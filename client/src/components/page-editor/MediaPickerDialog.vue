<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { parseEmbedUrl } from "server/src/page-blocks/schema"
import { computed, ref, useId, watch } from "vue"

const props = defineProps<{ modelValue: boolean; pageId: string; kind: "image" | "video" }>()
const emit = defineEmits<{
  (e: "update:modelValue", open: boolean): void
  (e: "select", payload: { media: any; previewUrl?: string }): void
}>()

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"]
const MAX_BYTES = { image: 20 * 1024 * 1024, video: 500 * 1024 * 1024 }

const toast = useGlobalToast()
const fieldId = useId()
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const search = ref("")
const embedUrl = ref("")
const accept = computed(() => (props.kind === "image" ? IMAGE_TYPES : VIDEO_TYPES).join(","))

watch(() => props.modelValue, (open) => {
  if (!open) {
    search.value = ""
    embedUrl.value = ""
  }
})

// Library results come from the same search the rest of the app uses, silenced
// so that choosing a picture is not recorded as someone searching the library.
const { data: results, isFetching } = useQuery({
  queryKey: computed(() => ["page-media", props.kind, search.value]),
  queryFn: () => trpc.collection.search.query({
    page: 1,
    query: search.value || null,
    fileTypes: [props.kind],
    searchScope: "all",
    silent: true,
  }),
  enabled: computed(() => props.modelValue),
})

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  isUploading.value = true
  try {
    const allowed = props.kind === "image" ? IMAGE_TYPES : VIDEO_TYPES
    if (!allowed.includes(file.type) || !file.size || file.size > MAX_BYTES[props.kind]) {
      throw new Error(props.kind === "image"
        ? "Choose a JPEG, PNG, WebP, GIF or AVIF picture of up to 20 MB."
        : "Choose an MP4, WebM or MOV video of up to 500 MB.")
    }
    const created = await trpc.page.createUpload.mutate({ pageId: props.pageId, kind: props.kind, contentType: file.type })
    const form = new FormData()
    for (const [key, value] of Object.entries(created.fields)) form.append(key, value)
    form.append("file", file)
    const response = await fetch(created.url, { method: "POST", body: form })
    if (!response.ok) {
      throw new Error("The upload failed. Please try again.")
    }
    const finalized = await trpc.page.finalizeUpload.mutate({ pageId: props.pageId, uploadId: created.uploadId, kind: props.kind })
    emit("select", { media: { source: "upload", s3key: finalized.s3key }, previewUrl: finalized.url })
    emit("update:modelValue", false)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally {
    isUploading.value = false
    input.value = ""
  }
}

function chooseFile(file: any) {
  emit("select", { media: { source: "file", fileId: file.id }, previewUrl: file.thumbnailURL ?? file.fileURL })
  emit("update:modelValue", false)
}

function useEmbed() {
  const parsed = parseEmbedUrl(embedUrl.value.trim())
  if (!parsed) {
    toast.error("Paste a YouTube or Vimeo address.")
    return
  }
  emit("select", { media: { source: "embed", ...parsed } })
  emit("update:modelValue", false)
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[820px]">
      <DialogHeader>
        <DialogTitle>{{ kind === "image" ? "Choose a picture" : "Choose a video" }}</DialogTitle>
        <DialogDescription>Upload a new file or reuse one already in your library.</DialogDescription>
      </DialogHeader>
      <Tabs default-value="library">
        <TabsList>
          <TabsTrigger value="library">From the library</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger v-if="kind === 'video'" value="embed">YouTube or Vimeo</TabsTrigger>
        </TabsList>
        <TabsContent value="library" class="mt-4">
          <Input v-model="search" type="search" :placeholder="`Search ${kind === 'image' ? 'pictures' : 'videos'}`"
            aria-label="Search the library" />
          <p v-if="isFetching" class="mt-4 text-sm text-neutral-500">Searching…</p>
          <p v-else-if="!results?.results?.length" class="mt-4 text-sm text-neutral-500">Nothing found here.</p>
          <div v-else class="mt-4 grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
            <button v-for="file in results.results" :key="file.id" type="button"
              class="group overflow-hidden rounded-md border border-neutral-200 text-left hover:border-neutral-500"
              @click="chooseFile(file)">
              <img v-if="file.thumbnailURL" :src="file.thumbnailURL" alt="" class="aspect-square w-full object-cover" />
              <span v-else class="flex aspect-square items-center justify-center bg-neutral-100 text-xs text-neutral-500">
                No preview
              </span>
              <span class="block truncate px-2 py-1 text-xs text-neutral-700">{{ file.name }}</span>
            </button>
          </div>
        </TabsContent>
        <TabsContent value="upload" class="mt-4">
          <input :id="`${fieldId}-file`" ref="fileInput" type="file" :accept="accept" class="hidden" @change="upload" />
          <button type="button" :disabled="isUploading"
            class="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-neutral-400 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
            @click="fileInput?.click()">
            <span>{{ isUploading ? "Uploading…" : "Click to choose a file" }}</span>
            <span class="text-xs text-neutral-500">
              {{ kind === "image" ? "JPEG, PNG, WebP, GIF or AVIF, up to 20 MB" : "MP4, WebM or MOV, up to 500 MB" }}
            </span>
          </button>
        </TabsContent>
        <TabsContent v-if="kind === 'video'" value="embed" class="mt-4">
          <Label :for="`${fieldId}-embed`">Video address</Label>
          <div class="mt-1 flex gap-2">
            <Input :id="`${fieldId}-embed`" v-model="embedUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" />
            <Button type="button" @click="useEmbed">Use this video</Button>
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
