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
import { useRoute, useRouter } from "vue-router"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/vue-query"
import { Search, SlidersHorizontal, X, Copy, ImageOff } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { useSearchState } from "@/composables/useSearchState"
import { trpc } from "@/services/server"
import { clearRecentSearches, listRecentSearches, rememberSearch, type RecentSearch } from "@/utils/recentSearches"
import type { MobileFile } from "../composables"
import { usePreviewQuery, useMobileSelection } from "../composables"
import MobileFileGrid from "../components/MobileFileGrid.vue"
import MobilePreview from "../components/MobilePreview.vue"
import MobileSelectionBar from "../components/MobileSelectionBar.vue"
import MobileFilters, { type FilterGroup } from "../components/MobileFilters.vue"

const PAGE_SIZE = 48
const route = useRoute()
const router = useRouter()
const toast = useGlobalToast()
const labels = useRecordLabel()
const selection = useMobileSelection()
const { form, terms, recordInput, hasQuery, filters, isScoped, setScope, clearFilters, setExactMatch } = useSearchState()

// The catalogue is the product search of one collection: one screen serves both.
watch(() => route.name, (name) => {
  if (name === "catalogue") {
    router.replace({ name: "search", query: { kind: "products", ...(route.query.collection ? { from_collection: route.query.collection as string, search_scope: "current_with_sub" } : {}) } })
  }
}, { immediate: true })

const products = computed(() => route.query.kind === "products")
const text = ref(form.value.query ?? "")
watch(() => form.value.query, (value) => { text.value = value ?? "" })
const recent = ref<RecentSearch[]>(listRecentSearches())
const selecting = ref(false)
const baseForm = computed(() => ({ ...form.value, page: undefined }))
const searched = computed(() => hasQuery.value || filters.value.length > 0 || isScoped.value)

function submit(query = text.value, exactMatch = form.value.exactMatch) {
  const trimmed = query.trim()
  if (trimmed && !products.value) recent.value = rememberSearch({ query: trimmed, exactMatch })
  router.push({ name: "search", query: { ...route.query, q: trimmed || undefined, exact_match: exactMatch ? "true" : undefined, page: undefined, preview: undefined } })
  ;(document.activeElement as HTMLElement | null)?.blur()
}
function setKind(kind: "files" | "products") {
  router.replace({ name: "search", query: { ...route.query, kind: kind === "products" ? "products" : undefined, page: undefined } })
}
function forgetRecent() {
  clearRecentSearches()
  recent.value = []
}
function openFilters() {
  router.push({ query: { ...route.query, panel: "filters" } })
}

const fileSearch = useInfiniteQuery({
  enabled: computed(() => !products.value && searched.value),
  queryKey: computed(() => ["mobile-search", baseForm.value]),
  initialPageParam: 1,
  queryFn: ({ pageParam }) => trpc.collection.search.query({ ...baseForm.value, page: pageParam, perPage: PAGE_SIZE, collapseVariants: true, silent: pageParam > 1 }),
  getNextPageParam: (last) => last.nextPage ?? undefined,
  placeholderData: keepPreviousData,
})
const files = computed(() => (fileSearch.data.value?.pages ?? []).flatMap((page) => page?.results ?? []) as MobileFile[])
const total = computed(() => fileSearch.data.value?.pages[0]?.total ?? 0)
const facets = computed(() => fileSearch.data.value?.pages[0]?.facets)
const rangeFiles = computed(() => (fileSearch.data.value?.pages[0]?.rangeResults ?? []) as MobileFile[])
const preview = usePreviewQuery(() => [...files.value, ...rangeFiles.value])

const productSearch = useInfiniteQuery({
  enabled: products,
  queryKey: computed(() => ["mobile-products", recordInput.value]),
  initialPageParam: 0,
  queryFn: ({ pageParam }) => trpc.catalogue.list.query({ ...recordInput.value, sort: { column: "recordKey", direction: "asc" }, offset: pageParam, limit: PAGE_SIZE }),
  getNextPageParam: (last, pages) => pages.length * PAGE_SIZE < last.total ? pages.length * PAGE_SIZE : undefined,
  placeholderData: keepPreviousData,
})
const productList = computed(() => (productSearch.data.value?.pages ?? []).flatMap((page) => page?.products ?? []))
const productTotal = computed(() => productSearch.data.value?.pages[0]?.total ?? 0)
const cardTitle = computed(() => productSearch.data.value?.pages[0]?.cardTitleField ?? null)
const { data: productFacets } = useQuery({ enabled: products, queryKey: computed(() => ["mobile-product-facets", recordInput.value]), queryFn: () => trpc.catalogue.facets.query(recordInput.value) })

const notFoundInput = computed(() => ({ query: terms.value, collectionId: form.value.collectionId, assetTypes: form.value.assetTypes, recordViews: form.value.recordViews, fileTypes: form.value.fileTypes, searchScope: form.value.searchScope }))
const { data: notFound } = useQuery({
  enabled: computed(() => !products.value && !form.value.exactMatch && terms.value.length > 1),
  queryKey: computed(() => ["search-not-found", notFoundInput.value]),
  queryFn: () => trpc.collection.searchNotFound.query(notFoundInput.value),
})
async function copyNotFound() {
  await navigator.clipboard.writeText((notFound.value ?? []).join("\n"))
  toast.success("List copied")
}

// Filter groups use the reader's own facet counts; values come from files they can open.
const filesMode = computed(() => !products.value)
const { data: assetTypes } = useQuery({ enabled: filesMode, queryKey: ["asset-types"], queryFn: () => trpc.assetType.list.query() })
const { data: recordFacets } = useQuery({ enabled: filesMode, queryKey: ["records", "attributes", "facets"], queryFn: () => trpc.recordAttribute.listFacets.query() })
const { data: metadataFacets } = useQuery({ enabled: filesMode, queryKey: ["metadata-fields", "facets"], queryFn: () => trpc.metadataField.listFacets.query() })
const { data: axisFacets } = useQuery({ enabled: filesMode, queryKey: ["variant-axes", "facets"], queryFn: () => trpc.variantAxis.listFacets.query() })
const groups = computed<FilterGroup[]>(() => {
  if (products.value) {
    return (productFacets.value?.attributes ?? []).filter((facet) => facet.options.length).map((facet) => ({
      key: `attributes[${facet.id}]`, label: facet.label, options: facet.options.map((option) => ({ value: option.id, label: option.label, count: option.count })),
    }))
  }
  const counts = facets.value
  return [
    { key: "asset_types", label: "Asset type", options: (assetTypes.value ?? []).map((type: { id: string, name: string }) => ({ value: type.id, label: type.name, count: counts?.assetTypes?.[type.id] ?? 0 })).filter((option) => option.count || form.value.assetTypes.includes(option.value)) },
    { key: "extensions", label: "Format", options: Object.entries(counts?.extensions ?? {}).map(([value, count]) => ({ value, label: value.toUpperCase(), count })) },
    ...(recordFacets.value ?? []).map((facet) => ({ key: `attributes[${facet.id}]`, label: facet.displayName || facet.name, options: facet.values.map((value) => ({ value, label: value, count: counts?.attributes?.[facet.id]?.[value] })) })),
    ...(axisFacets.value ?? []).map((axis) => ({ key: `axes[${axis.id}]`, label: axis.label, options: axis.values.map((value) => ({ value, label: value, count: counts?.variantAxes?.[axis.id]?.[value] })) })),
    ...(metadataFacets.value ?? []).filter((field) => field.valueType !== "date").map((field) => ({ key: `metadata[${field.id}]`, label: field.displayName || field.name, options: field.values.map((value) => ({ value, label: value, count: counts?.metadata?.[field.id]?.[value] })) })),
  ].filter((group) => group.options.length)
})
const ranges = computed(() => products.value ? [] : (metadataFacets.value ?? []).filter((field) => field.valueType === "date").map((field) => ({ id: field.id, label: field.displayName || field.name })))
const activeCount = computed(() => filters.value.length + (form.value.exactMatch ? 1 : 0))
const loading = computed(() => products.value ? productSearch.isLoading.value : fileSearch.isLoading.value)
const failed = computed(() => products.value ? productSearch.error.value : fileSearch.error.value)
function stopSelecting() {
  selecting.value = false
  selection.clear()
}
</script>

<template>
  <header class="sticky top-0 z-30 grid gap-2 border-b border-[var(--dv-color-line)] bg-[var(--dv-surface-panel)] px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2">
    <form role="search" class="flex min-h-11 items-center gap-2 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] bg-[var(--dv-surface-subtle)] px-3" @submit.prevent="submit()">
      <Search :size="18" aria-hidden="true" class="shrink-0 text-[var(--dv-text-secondary)]" />
      <input v-model="text" type="search" name="q" enterkeyhint="search" autocomplete="off" class="min-w-0 flex-1 bg-transparent text-base outline-none"
        :aria-label="products ? `Search ${labels.lowerPlural.value}` : 'Search files'" :placeholder="products ? `Search ${labels.lowerPlural.value} or references` : 'Search files or references'" />
      <button v-if="text" type="button" class="grid size-9 place-items-center" aria-label="Clear search text" @click="text = ''"><X :size="18" aria-hidden="true" /></button>
    </form>
    <div class="flex items-center gap-2">
      <div class="flex rounded-[var(--dv-radius-control)] border border-[var(--dv-color-line-strong)] p-0.5" role="group" aria-label="Search for">
        <button type="button" class="min-h-9 rounded-[var(--dv-radius-sm)] px-3 text-sm" :class="!products && 'bg-[var(--dv-action-primary)] text-[var(--dv-color-white)]'" :aria-pressed="!products" @click="setKind('files')">Files</button>
        <button type="button" class="min-h-9 max-w-32 truncate rounded-[var(--dv-radius-sm)] px-3 text-sm" :class="products && 'bg-[var(--dv-action-primary)] text-[var(--dv-color-white)]'" :aria-pressed="products" @click="setKind('products')">{{ labels.plural.value }}</button>
      </div>
      <button type="button" class="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[var(--dv-radius-control)] border border-[var(--dv-color-line-strong)] px-3 text-sm" @click="openFilters">
        <SlidersHorizontal :size="16" aria-hidden="true" />Filters<span v-if="activeCount"> ({{ activeCount }})</span>
      </button>
    </div>
    <div v-if="form.collectionId" class="flex items-center gap-2 text-sm">
      <span class="text-[var(--dv-text-secondary)]">In:</span>
      <select :value="form.searchScope" aria-label="Where to search" class="min-h-9 rounded-[var(--dv-radius-control)] border border-[var(--dv-color-line-strong)] bg-transparent px-2" @change="setScope(($event.target as HTMLSelectElement).value as any)">
        <option value="current_with_sub">This collection and inside</option>
        <option value="current">This collection only</option>
        <option value="all">Everything</option>
      </select>
    </div>
  </header>

  <section v-if="!searched && !products" class="px-4 pt-4" aria-labelledby="recent-heading">
    <template v-if="recent.length">
      <div class="flex items-center">
        <h2 id="recent-heading" class="flex-1 text-sm font-semibold text-[var(--dv-text-secondary)]">Recent searches</h2>
        <button type="button" class="min-h-11 text-sm underline" @click="forgetRecent">Clear history</button>
      </div>
      <ul class="m-0 list-none p-0">
        <li v-for="entry in recent" :key="`${entry.query}-${entry.exactMatch}`">
          <button type="button" class="flex min-h-12 w-full items-center gap-3 border-0 border-b border-[var(--dv-color-line)] bg-transparent text-left" @click="text = entry.query; submit(entry.query, entry.exactMatch)">
            <Search :size="16" aria-hidden="true" class="text-[var(--dv-text-secondary)]" /><span class="truncate">{{ entry.query }}</span>
          </button>
        </li>
      </ul>
    </template>
    <p v-else class="pt-8 text-center text-[var(--dv-text-secondary)]">Type a file name, a reference or several references separated by spaces.</p>
  </section>

  <p v-else-if="failed" role="alert" class="grid gap-3 px-4 pt-8 text-center">
    The search did not complete.
    <Button type="button" variant="outline" class="mx-auto min-h-11" @click="products ? productSearch.refetch() : fileSearch.refetch()">Try again</Button>
  </p>
  <p v-else-if="loading" class="px-4 pt-8 text-center text-[var(--dv-text-secondary)]">Searching…</p>

  <section v-else-if="products" class="grid gap-3 pt-3 pb-24" aria-live="polite">
    <p class="px-4 text-sm text-[var(--dv-text-secondary)]">{{ productTotal }} {{ productTotal === 1 ? labels.lower.value : labels.lowerPlural.value }}</p>
    <ul class="m-0 grid list-none grid-cols-2 gap-3 px-4">
      <li v-for="product in productList" :key="product.id">
        <router-link :to="{ name: 'product', params: { id: product.id }, query: form.collectionId ? { collection: form.collectionId } : {} }" class="grid gap-1 no-underline text-inherit">
          <span class="grid aspect-square place-items-center overflow-hidden rounded-[var(--dv-radius-md)] bg-[var(--dv-surface-subtle)]">
            <img v-if="product.thumbnailURL" :src="product.thumbnailURL" alt="" class="size-full object-contain" loading="lazy" />
            <ImageOff v-else :size="24" aria-hidden="true" class="text-[var(--dv-text-secondary)]" />
          </span>
          <span class="truncate text-sm font-medium">{{ product.recordKey }}</span>
          <span v-if="cardTitle && product.metaData[cardTitle]" class="truncate text-xs text-[var(--dv-text-secondary)]">{{ product.metaData[cardTitle] }}</span>
        </router-link>
      </li>
    </ul>
    <Button v-if="productSearch.hasNextPage.value" type="button" variant="outline" class="mx-4 min-h-12" :disabled="productSearch.isFetchingNextPage.value" @click="productSearch.fetchNextPage()">
      {{ productSearch.isFetchingNextPage.value ? "Loading…" : "Load more" }}
    </Button>
    <p v-if="!productList.length" class="px-4 pt-6 text-center text-[var(--dv-text-secondary)]">No {{ labels.lowerPlural.value }} match.</p>
  </section>

  <section v-else class="grid gap-3 pt-3 pb-24" aria-live="polite">
    <div class="flex items-center px-4">
      <p class="flex-1 text-sm text-[var(--dv-text-secondary)]">{{ total }} {{ total === 1 ? "file" : "files" }}</p>
      <button v-if="files.length" type="button" class="min-h-11 px-2 font-medium" @click="selecting ? stopSelecting() : (selecting = true)">{{ selecting ? "Done" : "Select" }}</button>
    </div>
    <div v-if="notFound?.length" class="mx-4 flex items-center gap-2 rounded-[var(--dv-radius-md)] bg-[var(--dv-color-warning-soft)] p-3 text-sm">
      <span class="flex-1">{{ notFound.length }} {{ notFound.length === 1 ? "reference" : "references" }} not found</span>
      <button type="button" class="inline-flex min-h-11 items-center gap-1 underline" @click="copyNotFound"><Copy :size="16" aria-hidden="true" />Copy list</button>
    </div>
    <MobileFileGrid :files="files" :selecting="selecting" @open="preview.open" />
    <Button v-if="fileSearch.hasNextPage.value" type="button" variant="outline" class="mx-4 min-h-12" :disabled="fileSearch.isFetchingNextPage.value" @click="fileSearch.fetchNextPage()">
      {{ fileSearch.isFetchingNextPage.value ? "Loading…" : "Load more" }}
    </Button>
    <details v-if="rangeFiles.length" class="px-4">
      <summary class="min-h-11 py-3 font-medium">Covering the range ({{ fileSearch.data.value?.pages[0]?.rangeTotal ?? rangeFiles.length }})</summary>
      <div class="-mx-4"><MobileFileGrid :files="rangeFiles" :selecting="selecting" @open="preview.open" /></div>
    </details>
    <div v-if="!files.length" class="grid gap-3 px-4 pt-6 text-center">
      <p class="text-[var(--dv-text-secondary)]">No files match.</p>
      <Button v-if="isScoped" type="button" variant="outline" class="min-h-11" @click="setScope('all')">Search everywhere</Button>
      <Button v-if="filters.length" type="button" variant="outline" class="min-h-11" @click="clearFilters()">Remove all filters</Button>
      <Button v-if="form.exactMatch" type="button" variant="outline" class="min-h-11" @click="setExactMatch(false)">Match any word instead</Button>
    </div>
  </section>

  <MobilePreview v-if="preview.index.value >= 0" :files="[...files, ...rangeFiles]" :index="preview.index.value" @close="preview.close" @show="preview.show" />
  <MobileSelectionBar @done="selecting = false" />
  <MobileFilters :groups="groups" :ranges="ranges" :products="products" :has-query="hasQuery" />
</template>
