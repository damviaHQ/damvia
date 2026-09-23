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
import CollectionDialogAddToCollection from "@/components/collection/CollectionDialogAddToCollection.vue"
import PageSelectionContext from "@/components/PageSelectionContext.vue"
import CollectionRenderProducts from "@/components/collection/CollectionRenderProducts.vue"
import MainPageTools from "@/components/layout-main/MainPageTools.vue"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import Loader from "@/components/Loader.vue"
import PageFilterBar from "@/components/PageFilterBar.vue"
import PageFilterToggle from "@/components/PageFilterToggle.vue"
import { Button } from "@/components/ui/button"
import { providePageFilter } from "@/composables/usePageFilter"
import { providePageListings } from "@/composables/usePageListings"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore.ts"
import { keepPreviousData, useQuery } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { computed, onUnmounted, ref, watch } from "vue"
import { useRoute } from "vue-router"

const PAGE_SIZE = 48
const route = useRoute()
const globalStore = useGlobalStore()
const { plural, lowerPlural } = useRecordLabel()
const pageFilter = providePageFilter()
const { products: shownProducts } = providePageListings()
const collectionId = computed(() => (route.query.collection as string | undefined) || undefined)
const search = computed(() => pageFilter.state.value.name)
const debouncedSearch = refDebounced(search, 300)
const page = ref(0)
const isAddToCollectionOpen = ref(false)
const sort = ref<{ column: string, direction: 'asc' | 'desc' }>({ column: 'recordKey', direction: 'asc' })
const queryInput = computed(() => ({
  collectionId: collectionId.value,
  sort: sort.value,
  search: debouncedSearch.value || undefined,
  filters: Object.entries(pageFilter.state.value.attributes).map(([column, values]) => ({ column, op: 'has_any' as const, values })),
}))
watch(queryInput, () => { page.value = 0 })
watch(collectionId, () => pageFilter.clear())

const { data, isFetching, error } = useQuery({
  queryKey: computed(() => ["catalogue", "list", queryInput.value, page.value]),
  queryFn: () => trpc.catalogue.list.query({ ...queryInput.value, offset: page.value * PAGE_SIZE, limit: PAGE_SIZE }),
  placeholderData: keepPreviousData,
})
const { data: facets } = useQuery({
  queryKey: computed(() => ["catalogue", "facets", queryInput.value]),
  queryFn: () => trpc.catalogue.facets.query(queryInput.value),
  placeholderData: keepPreviousData,
})
const { data: collection } = useQuery({
  enabled: computed(() => !!collectionId.value),
  queryKey: computed(() => ["collection", collectionId.value]),
  queryFn: () => trpc.collection.findById.query(collectionId.value as string),
})

const products = computed(() => data.value?.products ?? [])
const total = computed(() => data.value?.total ?? 0)
const pages = computed(() => Math.ceil(total.value / PAGE_SIZE))
const selected = computed(() => products.value.filter(product => globalStore.selection.some(item => item.type === 'record' && item.id === product.id)))
const breadcrumb = computed(() => [
  { id: 'catalogue', label: plural.value, to: { name: 'catalogue' } },
  ...(collection.value ? [{ id: collection.value.id, label: collection.value.name, to: { name: 'collection', params: { id: collection.value.id } } }] : []),
])

onUnmounted(() => {
  globalStore.setSelection(globalStore.selection.filter(item => item.type !== "record"))
})

function toggleSelection() {
  const allSelected = selected.value.length === products.value.length
  products.value.forEach(product => {
    if (allSelected) globalStore.removeFromSelection({ type: 'record', id: product.id })
    else if (!selected.value.some(item => item.id === product.id)) globalStore.addToSelection({ type: 'record', id: product.id })
  })
}
</script>

<template>
  <div class="collection__container">
    <MainPageTools area="context">
      <PageSelectionContext :items="breadcrumb" :selected-count="selected.length" :selectable-count="products.length"
        selection-label="Select all products on this page" @toggle="toggleSelection" />
      <h1 class="sr-only">{{ collection?.name ?? plural }}</h1>
    </MainPageTools>
    <MainPageTools area="actions">
        <Button v-if="selected.length && globalStore.user?.role !== 'guest'" type="button" variant="outline" size="sm" class="md:hidden" @click="isAddToCollectionOpen = true">Add to collection</Button>
        <PageFilterToggle :facets="facets" />
        <DisplayPreferences :products="shownProducts" />
    </MainPageTools>
    <p v-if="collection?.description" class="mb-5 text-body text-neutral-600">{{ collection.description }}</p>
    <MainPageTools area="filters"><PageFilterBar :show-summary="false" :facets="facets" :total="facets?.total ?? total" :shown="total" /></MainPageTools>
    <p v-if="error" role="alert" class="text-body text-red-700">{{ error.message }}</p>
    <Loader v-else-if="isFetching && !data" :text="true" />
    <CollectionRenderProducts v-else-if="data" :products="products" :fields="data.fields" :card-title-field="data.cardTitleField"
      :collection-id="collectionId" server-filtered @sort="sort = $event" />
    <footer class="mt-6 flex flex-wrap items-center justify-between gap-3 text-caption text-neutral-500" :aria-busy="isFetching">
      <span role="status">{{ total }} {{ lowerPlural }}</span>
      <nav v-if="pages > 1" class="flex items-center gap-3" aria-label="Pages">
        <Button type="button" variant="outline" size="sm" :disabled="page === 0 || isFetching" @click="page--">Previous</Button>
        <span>Page {{ page + 1 }} of {{ pages }}</span>
        <Button type="button" variant="outline" size="sm" :disabled="page + 1 >= pages || isFetching" @click="page++">Next</Button>
      </nav>
    </footer>
    <CollectionDialogAddToCollection v-if="isAddToCollectionOpen" v-model="isAddToCollectionOpen" />
  </div>
</template>
