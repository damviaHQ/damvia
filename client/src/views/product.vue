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
import ProductCard from "@/components/catalogue/ProductCard.vue"
import { gridClasses } from "@/components/collection/gridStyles"
import CollectionDialogAddToCollection from "@/components/collection/CollectionDialogAddToCollection.vue"
import CollectionRenderFiles from "@/components/collection/CollectionRenderFiles.vue"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import PageFilterBar from "@/components/PageFilterBar.vue"
import PageFilterToggle from "@/components/PageFilterToggle.vue"
import PathBreadcrumb from "@/components/navigation/PathBreadcrumb.vue"
import { providePageFilter } from "@/composables/usePageFilter"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore.ts"
import { useQuery } from "@tanstack/vue-query"
import { ImageOff } from "@lucide/vue"
import { computed, onUnmounted, ref, watch } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const globalStore = useGlobalStore()
const { plural } = useRecordLabel()
providePageFilter()
const collectionId = computed(() => route.query.collection as string | undefined)
const { data: collection } = useQuery({
  enabled: computed(() => !!collectionId.value),
  queryKey: computed(() => ["collection", collectionId.value]),
  queryFn: () => trpc.collection.findById.query(collectionId.value as string),
})

const id = computed(() => route.params.id as string)
const isAddToCollectionOpen = ref(false)
const relatedPage = ref(0)
watch([id, collectionId], () => { relatedPage.value = 0 })
const selectedIds = computed(() => globalStore.selection.filter(item => item.type === "record").map(item => item.id))
function toggleRelated(id: string, selected: boolean) {
  if (selected) globalStore.addToSelection({ type: "record", id })
  else globalStore.removeFromSelection({ type: "record", id })
}
const shown = ref<string | null>(null)

const { data: product, isFetching, error } = useQuery({
  queryKey: computed(() => ["catalogue", "product", id.value, collectionId.value, relatedPage.value]),
  placeholderData: (previous, query) => query?.queryKey[2] === id.value ? previous : undefined,
  queryFn: () => trpc.catalogue.get.query({ id: id.value, collectionId: collectionId.value, relatedOffset: relatedPage.value * 24 }),
})

watch(product, (next, before) => {
  if (next && next.id !== before?.id) shown.value = next.visuals[0]?.thumbnailURL ?? next.thumbnailURL ?? null
})

const fileGroups = computed(() => {
  const groups = new Map<string, { id: string, name: string, files: NonNullable<typeof product.value>["collectionFiles"] }>()
  for (const file of product.value?.collectionFiles ?? []) {
    const id = file.assetType?.id ?? "other"
    const group = groups.get(id) ?? { id, name: file.assetType?.name ?? "Other files", files: [] }
    group.files.push(file)
    groups.set(id, group)
  }
  return [...groups.values()].sort((a, b) => a.id === "other" ? 1 : b.id === "other" ? -1 : a.name.localeCompare(b.name))
})

const values = computed(() => (product.value?.fields ?? [])
  .filter(field => field.name !== product.value?.keyColumnName)
  .map((field) => ({ label: field.displayName, value: product.value?.metaData[field.name] }))
  .filter((entry) => !!entry.value))
const title = computed(() => (product.value?.cardTitleField ? product.value.metaData[product.value.cardTitleField] : null) || product.value?.recordKey || "")
const breadcrumb = computed(() => [
  { id: 'catalogue', label: plural.value, to: { name: 'catalogue' } },
  ...(collection.value ? [{ id: collection.value.id, label: collection.value.name, to: { name: 'collection', params: { id: collection.value.id } } }] : []),
  { id: id.value, label: product.value?.recordKey ?? '', to: { name: 'product', params: { id: id.value }, query: route.query } },
])

onUnmounted(() => {
  globalStore.setSelection(globalStore.selection.filter((item) => item.type !== "record"))
})

function addToCollection() {
  globalStore.setSelection([{ type: "record", id: id.value }])
  isAddToCollectionOpen.value = true
}
</script>

<template>
  <Loader v-if="isFetching && !product" :text="true" />
  <p v-else-if="error" role="alert" class="text-body text-neutral-700">This {{ plural.toLowerCase() }} entry is not available to you.</p>
  <article v-else-if="product" class="grid gap-8">
    <header class="collection__header flex flex-wrap items-center justify-between gap-4">
      <PathBreadcrumb :items="breadcrumb" />
      <Button type="button" variant="outline" size="sm" @click="addToCollection">Add to collection</Button>
    </header>

    <div class="grid min-w-0 gap-8 lg:grid-cols-2">
      <section class="min-w-0" aria-label="Visuals">
        <div class="grid aspect-[4/3] place-items-center overflow-hidden bg-neutral-100">
          <img v-if="shown" :src="shown" :alt="title" class="size-full object-contain" />
          <ImageOff v-else class="size-8 text-neutral-400" aria-hidden="true" />
        </div>
        <div v-if="product.visuals.length > 1" class="mt-3 flex flex-wrap gap-2">
          <button v-for="visual in product.visuals" :key="visual.id" type="button"
            class="size-16 overflow-hidden border bg-neutral-100 p-0"
            :class="shown === visual.thumbnailURL ? 'border-neutral-900' : 'border-transparent'"
            :aria-pressed="shown === visual.thumbnailURL" :aria-label="`Show view ${visual.view ?? visual.id}`" @click="shown = visual.thumbnailURL">
            <img :src="visual.thumbnailURL ?? ''" :alt="visual.view ?? ''" class="size-full object-contain" loading="lazy" />
          </button>
        </div>
      </section>

      <section class="min-w-0" aria-label="Details">
        <p v-if="title !== product.recordKey" class="mb-2 text-caption text-neutral-500">{{ product.recordKey }}</p>
        <h1 class="text-2xl font-semibold text-neutral-900">{{ title }}</h1>
        <dl class="mt-6 grid gap-0">
          <div v-for="entry in values" :key="entry.label" class="grid grid-cols-2 gap-4 border-b border-neutral-200 py-3">
            <dt class="text-body text-neutral-500">{{ entry.label }}</dt>
            <dd class="m-0 break-words whitespace-pre-wrap text-body text-neutral-900">{{ entry.value }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <section v-if="product.siblings.length || relatedPage" aria-labelledby="product-related-heading" class="min-w-0">
      <div class="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 id="product-related-heading" class="text-body font-semibold text-neutral-900">Related {{ plural }}</h2>
        <span class="text-caption text-neutral-500">{{ product.relatedTotal }}</span>
      </div>
      <div :class="gridClasses">
        <ProductCard v-for="related in product.siblings" :key="related.id" :product="related" :card-title-field="product.cardTitleField"
          :collection-id="collectionId" :selected="selectedIds.includes(related.id)" @update:selected="toggleRelated(related.id, $event)" />
      </div>
      <div v-if="product.relatedTotal > 24 || relatedPage" class="mt-5 flex items-center justify-end gap-3">
        <Button type="button" variant="outline" size="sm" :disabled="!relatedPage || isFetching" @click="relatedPage--">Previous related page</Button>
        <span class="text-caption text-neutral-500">Page {{ relatedPage + 1 }}</span>
        <Button type="button" variant="outline" size="sm" :disabled="(relatedPage + 1) * 24 >= product.relatedTotal || isFetching" @click="relatedPage++">Next related page</Button>
      </div>
    </section>

    <section aria-label="Linked assets" class="min-w-0 border-t border-neutral-200 pt-6">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-baseline gap-3">
          <span class="text-caption text-neutral-500">{{ product.collectionFiles.length }} linked assets</span>
        </div>
        <div class="flex items-center gap-1">
          <PageFilterToggle :files="product.collectionFiles" show-single-values />
          <DisplayPreferences :files="product.collectionFiles" grouped />
        </div>
      </div>
      <PageFilterBar :files="product.collectionFiles" show-single-values />
      <section v-for="group in fileGroups" :key="group.id" :aria-labelledby="`product-files-${group.id}`" class="mb-6 min-w-0">
        <div class="mb-4 flex items-baseline gap-3">
          <h2 :id="`product-files-${group.id}`" class="text-body font-semibold text-neutral-900">{{ group.name }}</h2>
          <span class="text-caption text-neutral-500">{{ group.files.length }}</span>
        </div>
        <CollectionRenderFiles :files="group.files" />
      </section>
      <p v-if="!fileGroups.length" class="text-body text-neutral-500">No file you can open is linked to this product yet.</p>
    </section>
    <CollectionDialogAddToCollection v-model:model-value="isAddToCollectionOpen" />
  </article>
</template>
