<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useQueryClient } from "@tanstack/vue-query"
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui"
import { X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc, type RouterInput, type RouterOutput } from "@/services/server"
import type { SelectionItem } from "@/stores/globalStore"
import { downloadSummary } from "@/utils/downloadDelivery"
import { formatFileSize } from "@/utils/fileSize"

const props = defineProps<{ items: SelectionItem[] }>()
const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ done: [] }>()
const toast = useGlobalToast()
const queryClient = useQueryClient()

type Files = RouterOutput["collection"]["getFiles"]
const resolved = ref<Files | null>(null)
const loading = ref(false)
const busy = ref(false)
const failed = ref("")
const imageFormat = ref<"original" | "jpg" | "webp">("original")
const imageResolution = ref<"high" | "medium" | "low">("medium")
const videoFormat = ref<"original" | "mp4">("original")
const accepted = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return
  resolved.value = null
  failed.value = ""
  accepted.value = false
  loading.value = true
  try {
    resolved.value = await trpc.collection.getFiles.mutate({ items: props.items })
  } catch (error) {
    failed.value = (error as Error).message
  } finally {
    loading.value = false
  }
}, { immediate: true })

const files = computed(() => resolved.value?.files ?? [])
const summary = computed(() => downloadSummary(files.value))
const hasImages = computed(() => summary.value.imageCount > 0)
const hasVideo = computed(() => files.value.some((file) => file.mimeType.startsWith("video/")))
const licenses = computed(() => [...new Map(files.value.flatMap((file) => file.license ? [[file.license.id, file.license] as const] : [])).values()])
const ready = computed(() => !!files.value.length && !summary.value.tooLarge && (!licenses.value.length || accepted.value) && !busy.value)
watch(summary, (next) => { if (!next.conversionAllowed) imageFormat.value = "original" })

async function submit(type: "direct" | "email") {
  if (!ready.value) return
  busy.value = true
  try {
    const result = await trpc.download.create.mutate({
      collectionFileIds: files.value.map((file) => file.id),
      imageFormat: imageFormat.value,
      imageResolution: imageResolution.value,
      videoFormat: videoFormat.value,
      videoResolution: "low",
      downloadType: type,
      licenseAccepted: accepted.value,
    } as RouterInput["download"]["create"])
    await queryClient.invalidateQueries({ queryKey: ["downloads"] })
    if (result.url) {
      window.location.assign(result.url)
      toast.success("Your download has started.")
    } else {
      toast.success("We’ll email you a link when it’s ready. You can also copy it from Downloads.")
    }
    open.value = false
    emit("done")
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40" />
      <DialogContent class="mobile-sheet dv-theme dv-neutral dv-client">
        <header class="flex items-center gap-2 border-b border-[var(--dv-color-line)] px-4 py-3">
          <DialogTitle class="flex-1 text-[17px] font-semibold">Download</DialogTitle>
          <button type="button" class="grid size-11 place-items-center -mr-3" aria-label="Close" @click="open = false"><X :size="22" aria-hidden="true" /></button>
        </header>
        <DialogDescription class="sr-only">Choose the format, then download now or get a link by email.</DialogDescription>
        <div class="grid gap-5 overflow-y-auto px-4 py-4">
          <p v-if="loading" class="text-[var(--dv-text-secondary)]">Checking the files…</p>
          <p v-else-if="failed" role="alert" class="text-[var(--dv-color-danger)]">{{ failed }}</p>
          <template v-else-if="resolved">
            <p class="font-medium">{{ files.length }} {{ files.length === 1 ? "file" : "files" }} · {{ formatFileSize(summary.bytes) }}</p>
            <p v-if="summary.tooLarge" role="alert" class="text-[var(--dv-color-danger)]">Select fewer files to stay under 10 GB.</p>

            <fieldset v-if="hasImages" class="grid gap-2">
              <legend class="mb-2 text-sm font-medium">Images</legend>
              <div class="mobile-segments" role="radiogroup" aria-label="Image format">
                <label v-for="option in ['original', 'jpg', 'webp']" :key="option" :class="{ 'is-on': imageFormat === option }">
                  <input v-model="imageFormat" type="radio" :value="option" class="sr-only" :disabled="option !== 'original' && !summary.conversionAllowed" />
                  {{ option === "original" ? "Original" : option.toUpperCase() }}
                </label>
              </div>
              <div v-if="imageFormat !== 'original'" class="mobile-segments" role="radiogroup" aria-label="Image quality">
                <label v-for="[value, label] in [['high', 'Print'], ['medium', 'Web'], ['low', 'Preview']]" :key="value" :class="{ 'is-on': imageResolution === value }">
                  <input v-model="imageResolution" type="radio" :value="value" class="sr-only" />{{ label }}
                </label>
              </div>
              <p v-if="!summary.conversionAllowed" class="text-sm text-[var(--dv-text-secondary)]">More than 300 images keep their original format.</p>
            </fieldset>

            <fieldset v-if="hasVideo" class="grid gap-2">
              <legend class="mb-2 text-sm font-medium">Videos</legend>
              <div class="mobile-segments" role="radiogroup" aria-label="Video format">
                <label v-for="[value, label] in [['original', 'Original'], ['mp4', 'MP4 · 720p']]" :key="value" :class="{ 'is-on': videoFormat === value }">
                  <input v-model="videoFormat" type="radio" :value="value" class="sr-only" />{{ label }}
                </label>
              </div>
            </fieldset>

            <section v-if="licenses.length" class="grid gap-2" aria-label="Usage terms">
              <h2 class="text-sm font-medium">Usage terms</h2>
              <details v-for="license in licenses" :key="license.id" class="rounded-[var(--dv-radius-md)] border border-[var(--dv-color-line)] px-3 py-2">
                <summary class="min-h-8 cursor-pointer">{{ license.name }}</summary>
                <div v-if="license.details" class="pt-2 text-sm leading-relaxed" v-html="license.details" />
              </details>
              <label class="flex min-h-11 items-center gap-3"><input v-model="accepted" type="checkbox" class="size-5" />I agree to the usage terms</label>
            </section>

            <p v-if="!summary.directAllowed && !summary.tooLarge" class="rounded-[var(--dv-radius-md)] bg-[var(--dv-surface-subtle)] p-3 text-sm">
              Over 1 GB. We’ll email you a link when it’s ready. You can also copy it from Downloads.
            </p>
          </template>
        </div>
        <footer class="grid gap-2 border-t border-[var(--dv-color-line)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <Button type="button" class="min-h-12 w-full" :disabled="!ready" @click="submit(summary.directAllowed ? 'direct' : 'email')">
            {{ busy ? "Preparing…" : summary.directAllowed ? "Download now" : "Email me a link" }}
          </Button>
          <button v-if="summary.directAllowed" type="button" class="min-h-11 underline disabled:opacity-50" :disabled="!ready" @click="submit('email')">Email me a link instead</button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.mobile-sheet {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 50;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr auto;
  max-height: 92dvh;
  overflow-wrap: anywhere;
  background: var(--dv-surface-panel);
  color: var(--dv-text-primary);
  border-radius: var(--dv-radius-xl) var(--dv-radius-xl) 0 0;
  font-size: 16px;
}
.mobile-segments {
  display: flex;
  gap: 6px;
}
.mobile-segments label {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 44px;
  border: 1px solid var(--dv-color-line-strong);
  border-radius: var(--dv-radius-control);
  font-size: 14px;
}
.mobile-segments label.is-on {
  background: var(--dv-action-primary);
  border-color: var(--dv-action-primary);
  color: var(--dv-color-white);
}
.mobile-segments label:has(input:disabled) {
  opacity: 0.4;
}
.mobile-segments label:has(input:focus-visible) {
  outline: 2px solid var(--dv-color-blue);
  outline-offset: 2px;
}
</style>
