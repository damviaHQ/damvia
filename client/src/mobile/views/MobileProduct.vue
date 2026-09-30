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
import { useRoute } from "vue-router"
import { useQuery } from "@tanstack/vue-query"
import { ImageOff } from "@lucide/vue"
import Loader from "@/components/Loader.vue"
import ModuleSlot from "@/components/ModuleSlot.vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import type { MobileFile } from "../composables"
import { usePreviewQuery } from "../composables"
import MobileTopBar from "../components/MobileTopBar.vue"
import MobileFileGrid from "../components/MobileFileGrid.vue"
import MobilePreview from "../components/MobilePreview.vue"
import MobileDownloadSheet from "../components/MobileDownloadSheet.vue"
import MobileAddToCollection from "../components/MobileAddToCollection.vue"

const route = useRoute()
const store = useGlobalStore()
const toast = useGlobalToast()
const { plural } = useRecordLabel()
const id = computed(() => route.params.id as string)
const collectionId = computed(() => route.query.collection as string | undefined)
const shown = ref<string | null>(null)
const downloading = ref(false)
const adding = ref(false)
const isGuest = computed(() => store.user?.role === "guest")

const { data: product, isLoading, error } = useQuery({
  queryKey: computed(() => ["catalogue", "product", id.value, collectionId.value, 0]),
  queryFn: () => trpc.catalogue.get.query({ id: id.value, collectionId: collectionId.value, relatedOffset: 0 }),
})
watch(product, (next, before) => {
  if (next && next.id !== before?.id) shown.value = next.visuals[0]?.thumbnailURL ?? next.thumbnailURL ?? null
}, { immediate: true })

const title = computed(() => (product.value?.cardTitleField ? product.value.metaData[product.value.cardTitleField] : null) || product.value?.recordKey || "")
const facts = computed(() => (product.value?.fields ?? [])
  .filter((field) => field.name !== product.value?.keyColumnName)
  .map((field) => ({ label: field.displayName, value: product.value?.metaData[field.name] }))
  .filter((entry): entry is { label: string, value: string } => !!entry.value))
const files = computed(() => (product.value?.collectionFiles ?? []) as MobileFile[])
const preview = usePreviewQuery(() => files.value)

async function copy(text: string, label: string) {
  await navigator.clipboard.writeText(text)
  toast.success(`${label} copied`)
}
let startX = 0
function swipe(event: TouchEvent, phase: "start" | "end") {
  const x = event.changedTouches[0].clientX
  if (phase === "start") { startX = x; return }
  const visuals = product.value?.visuals ?? []
  const current = visuals.findIndex((visual) => visual.thumbnailURL === shown.value)
  const next = visuals[current + (x - startX < 0 ? 1 : -1)]
  if (Math.abs(x - startX) > 60 && next) shown.value = next.thumbnailURL
}
</script>

<template>
  <MobileTopBar :title="product?.recordKey ?? plural" back />
  <Loader v-if="isLoading" :text="true" />
  <p v-else-if="error" role="alert" class="px-4 pt-8 text-center text-[var(--dv-text-secondary)]">This entry is not available to you.</p>
  <article v-else-if="product" class="grid gap-5 pb-24">
    <div class="grid aspect-[4/3] place-items-center bg-[var(--dv-surface-subtle)]" @touchstart.passive="swipe($event, 'start')" @touchend.passive="swipe($event, 'end')">
      <img v-if="shown" :src="shown" :alt="title" class="size-full object-contain" />
      <ImageOff v-else :size="32" class="text-[var(--dv-text-secondary)]" aria-hidden="true" />
    </div>
    <div v-if="product.visuals.length > 1" class="flex gap-2 overflow-x-auto px-4" role="group" aria-label="Views">
      <button v-for="visual in product.visuals" :key="visual.id" type="button" class="size-14 shrink-0 overflow-hidden border-2 bg-[var(--dv-surface-subtle)] p-0"
        :class="shown === visual.thumbnailURL ? 'border-[var(--dv-text-primary)]' : 'border-transparent'" :aria-pressed="shown === visual.thumbnailURL"
        :aria-label="`Show view ${visual.view ?? ''}`" @click="shown = visual.thumbnailURL">
        <img :src="visual.thumbnailURL ?? ''" alt="" class="size-full object-contain" loading="lazy" />
      </button>
    </div>
    <header class="grid gap-1 px-4">
      <p v-if="title !== product.recordKey" class="text-sm text-[var(--dv-text-secondary)]">{{ product.recordKey }}</p>
      <h1 class="text-xl font-semibold">{{ title }}</h1>
    </header>
    <div class="grid grid-cols-2 gap-2 px-4">
      <Button type="button" class="min-h-12" :disabled="!files.length" @click="downloading = true">Download files</Button>
      <Button v-if="!isGuest" type="button" variant="outline" class="min-h-12" @click="adding = true">Add to collection</Button>
    </div>
    <dl v-if="facts.length" class="m-0 px-4">
      <div v-for="fact in facts" :key="fact.label" class="grid gap-0.5 border-b border-[var(--dv-color-line)] py-3">
        <dt class="text-sm text-[var(--dv-text-secondary)]">{{ fact.label }}</dt>
        <dd class="m-0"><button type="button" class="w-full break-words whitespace-pre-wrap bg-transparent p-0 text-left text-inherit" :aria-label="`Copy ${fact.label}: ${fact.value}`" @click="copy(fact.value, fact.label)">{{ fact.value }}</button></dd>
      </div>
    </dl>
    <ModuleSlot name="product.details" :props="{ product }" class="px-4" />
    <section v-if="product.siblings.length" aria-labelledby="related-heading" class="grid gap-2">
      <h2 id="related-heading" class="px-4 text-sm font-semibold text-[var(--dv-text-secondary)]">Related {{ plural }}</h2>
      <div class="flex gap-3 overflow-x-auto px-4 pb-2">
        <router-link v-for="sibling in product.siblings" :key="sibling.id" :to="{ name: 'product', params: { id: sibling.id }, query: route.query.collection ? { collection: route.query.collection } : {} }"
          class="grid w-32 shrink-0 gap-1 no-underline text-inherit">
          <span class="grid aspect-square place-items-center overflow-hidden rounded-[var(--dv-radius-md)] bg-[var(--dv-surface-subtle)]">
            <img v-if="sibling.thumbnailURL" :src="sibling.thumbnailURL" alt="" class="size-full object-contain" loading="lazy" />
          </span>
          <span class="truncate text-sm">{{ sibling.recordKey }}</span>
        </router-link>
      </div>
    </section>
    <section v-if="files.length" aria-labelledby="files-heading" class="grid gap-2">
      <h2 id="files-heading" class="px-4 text-sm font-semibold text-[var(--dv-text-secondary)]">{{ files.length }} files</h2>
      <MobileFileGrid :files="files" @open="preview.open" />
    </section>
    <MobilePreview v-if="preview.index.value >= 0" :files="files" :index="preview.index.value" @close="preview.close" @show="preview.show" />
    <MobileDownloadSheet v-model:open="downloading" :items="[{ type: 'record', id: product.id }]" />
    <MobileAddToCollection v-model:open="adding" :items="[{ type: 'record', id: product.id }]" />
  </article>
</template>
