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
import CollectionDisplayGridFiles from "@/components/collection/CollectionDisplayGridFiles.vue"
import CollectionDisplayListFiles from "@/components/collection/CollectionDisplayListFiles.vue"
import Loader from "@/components/Loader.vue"
import SearchEmptyState from "@/components/search/SearchEmptyState.vue"
import SearchToolbar, { type FilterChip } from "@/components/search/SearchToolbar.vue"
import {
  Pagination,
  PaginationEllipsis,
  PaginationList,
  PaginationListItem,
  PaginationNext,
  PaginationPrev,
} from "@/components/ui/pagination"
import { Button } from "@/components/ui/button"
import { useSearchState } from "@/composables/useSearchState"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import type { DisplayView } from "@/utils/displayPreferences"
import { FILE_TYPE_OPTIONS } from "@/utils/searchQuery"
import { keepPreviousData, useQuery } from "@tanstack/vue-query"
import groupBy from "lodash/groupBy"
import { storeToRefs } from "pinia"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { computed, ref, watch } from "vue"

const PER_PAGE = 300
const { form, terms, hasQuery, filters, isScoped, setValues, setSort, setScope, setExactMatch, toggleValue, clearFilters, setPage, setSizeRange, setMetadataRange } = useSearchState()

const { data: assetTypes } = useQuery({ queryKey: ["asset-types"], queryFn: () => trpc.assetType.list.query() })
const { data: recordFacets } = useQuery({ queryKey: ["records", "attributes", "facets"], queryFn: () => trpc.recordAttribute.listFacets.query() })
const { data: metadataFacets } = useQuery({ queryKey: ["metadata-fields", "facets"], queryFn: () => trpc.metadataField.listFacets.query() })
const { data: collection } = useQuery({
  enabled: computed(() => !!form.value.collectionId),
  queryKey: computed(() => ["collection", form.value.collectionId]),
  queryFn: () => trpc.collection.findById.query(form.value.collectionId!),
})
const { status, data: search, error, isPlaceholderData } = useQuery({
  queryKey: computed(() => ["search", form.value]),
  queryFn: () => trpc.collection.search.query(form.value),
  // Changing a filter refines the current results instead of blanking the page.
  placeholderData: keepPreviousData,
})
const notFoundInput = computed(() => ({
  query: terms.value,
  collectionId: form.value.collectionId,
  assetTypes: form.value.assetTypes,
  recordViews: form.value.recordViews,
  fileTypes: form.value.fileTypes,
  searchScope: form.value.searchScope,
}))
const { data: notFound } = useQuery({
  enabled: computed(() => !form.value.exactMatch && terms.value.length > 0),
  queryKey: computed(() => ["search-not-found", notFoundInput.value]),
  queryFn: () => trpc.collection.searchNotFound.query(notFoundInput.value),
  placeholderData: keepPreviousData,
})

// Files linked to a range the matched records share, kept apart from the
// exact results; the first 60 come with the search, the rest on demand.
const recordLabel = useRecordLabel()
const rangeResults = computed<any[]>(() => search.value?.rangeResults ?? [])
const rangeTotal = computed(() => search.value?.rangeTotal ?? 0)
const rangePage = ref(0)
watch(() => form.value, () => { rangePage.value = 0 }, { deep: true })
const { data: rangeAll, isFetching: rangeLoading } = useQuery({
  enabled: computed(() => rangePage.value > 0 && !!form.value.query),
  queryKey: computed(() => ["search-range", form.value, rangePage.value]),
  queryFn: () => trpc.collection.rangeSearch.query({ ...form.value, query: form.value.query ?? "", page: rangePage.value }),
  placeholderData: keepPreviousData,
})
const rangeFiles = computed<any[]>(() => rangePage.value > 0 && rangeAll.value ? rangeAll.value.results : rangeResults.value)

const emptyFacets = { assetTypes: {}, fileTypes: {}, extensions: {}, recordViews: {}, attributes: {}, metadata: {}, metadataRanges: {} }
const facets = computed(() => search.value?.facets ?? emptyFacets)
const results = computed<any[]>(() => search.value?.results ?? [])
const total = computed(() => search.value?.total ?? results.value.length)

const scopeLabel = computed(() => {
  const name = collection.value?.name ?? "this collection"
  if (!form.value.collectionId || form.value.searchScope === "all") return "all collections"
  return form.value.searchScope === "current" ? name : `${name} and its sub-collections`
})

// Groups keep the server order inside them; the groups themselves follow the asset type names.
const searchResults = computed(() =>
  Object.entries(groupBy(results.value, "assetTypeId"))
    .map(([assetTypeId, results]) => ({
      assetType: assetTypes.value?.find((assetType: any) => assetType.id === assetTypeId),
      results,
    }))
    .sort((a, b) => (a.assetType?.name ?? "￿").localeCompare(b.assetType?.name ?? "￿"))
)

// The toolbar dropdowns already name their own choice, so they get no chips.
// Formats come from the files themselves, so the list only offers what exists.
const formatOptions = computed(() => {
  const counts: Record<string, number> = facets.value.extensions ?? {}
  const values = new Set<string>([...Object.keys(counts), ...form.value.extensions])
  return Array.from(values)
    .map((value) => ({ id: value, label: value.toUpperCase(), count: counts[value] ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const chips = computed<FilterChip[]>(() =>
  filters.value.filter((filter) => !["file_types", "extensions", "size"].includes(filter.group)).map((filter) => {
    if (filter.group === "asset_types") {
      const name = assetTypes.value?.find((assetType: any) => assetType.id === filter.value)?.name ?? filter.value
      return { key: filter.key, value: filter.value, label: `Asset type: ${name}`, category: "Asset type", displayValue: name }
    } else if (filter.group === "file_types") {
      const name = FILE_TYPE_OPTIONS.find((option) => option.id === filter.value)?.label ?? filter.value
      return { key: filter.key, value: filter.value, label: `File type: ${name}`, category: "File type", displayValue: name }
    } else if (filter.group === "size") {
      return { key: filter.key, value: filter.value, label: `Size: ${filter.value}`, category: "Size", displayValue: filter.value }
    } else if (filter.group === "extensions") {
      return { key: filter.key, value: filter.value, label: `Format: ${filter.value.toUpperCase()}`, category: "Format", displayValue: filter.value.toUpperCase() }
    } else if (filter.group === "record_views") {
      return { key: filter.key, value: filter.value, label: `View: ${filter.value}`, category: "View", displayValue: filter.value }
    } else if (filter.group === "metadata" || filter.group === "metadata_range") {
      const field = metadataFacets.value?.find((entry) => entry.id === filter.attributeId)
      const name = field?.displayName || field?.name || "File metadata"
      return { key: filter.key, value: filter.value, label: `${name}: ${filter.value}`, category: name, displayValue: filter.value }
    }
    const facet = recordFacets.value?.find((entry: any) => entry.id === filter.attributeId)
    return { key: filter.key, value: filter.value, label: `${facet?.displayName || facet?.name || "Attribute"}: ${filter.value}`, category: facet?.displayName || facet?.name || "Attribute", displayValue: filter.value }
  })
)

const globalStore = useGlobalStore()
const storeRefs = storeToRefs(globalStore)
const selection = computed(() => {
  const fileIds = new Set(results.value.map((file: any) => file.id))
  return storeRefs.selection.value.filter((item) => item.type === "file" && fileIds.has(item.id))
})
const allSelected = computed(() => results.value.length > 0 && selection.value.length === results.value.length)

function toggleSelection() {
  if (allSelected.value) {
    selection.value.forEach((item) => globalStore.removeFromSelection(item))
    return
  }
  results.value
    .filter((file: any) => !selection.value.some((item) => item.id === file.id))
    .forEach((file: any) => globalStore.addToSelection({ type: "file", id: file.id }))
}

function displayFor(assetType: any): DisplayView {
  return (
    globalStore.displayPreferences[assetType?.id as never] ??
    assetType?.defaultDisplay ??
    globalStore.displayPreferences["asset_file"] ??
    "grid"
  )
}

function removeChip(chip: FilterChip) {
  if (chip.key === "size") {
    setSizeRange({ min: "", max: "" })
    return
  }
  const range = /^metadata_range\[(.+)]$/.exec(chip.key)
  if (range) {
    setMetadataRange(range[1], { from: "", to: "" })
    return
  }
  toggleValue(chip.key, chip.value)
}

function focusTerms() {
  document.getElementById("search-panel-terms")?.focus()
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <h1 class="sr-only">Search</h1>
    <div role="status" aria-live="polite" class="sr-only">
      <template v-if="status === 'success'">{{ total ? `${total} result${total > 1 ? "s" : ""} found` : "No results found" }}</template>
    </div>
    <div v-if="status === 'pending'">
      <Loader :text="true" />
    </div>
    <div v-else-if="status === 'error'" role="alert" class="mt-5 alert alert-danger">
      {{ error?.message }}
    </div>
    <template v-else-if="status === 'success' && search">
      <SearchToolbar
        :files="results"
        :total="total"
        :terms="terms"
        :scope-label="scopeLabel"
        :file-type-counts="facets.fileTypes"
        :file-types="form.fileTypes"
        :sort="form.sort"
        :has-query="hasQuery"
        :chips="chips"
        :formats="formatOptions"
        :selected-formats="form.extensions"
        :min-size="form.minSize"
        :max-size="form.maxSize"
        :selected-count="selection.length"
        :all-selected="allSelected"
        @update:file-types="setValues('file_types', $event)"
        @update:sort="setSort($event)"
        @remove-chip="removeChip($event)"
        @toggle-selection="toggleSelection"
        @toggle-format="toggleValue('extensions', $event)"
        @clear-formats="setValues('extensions', [])"
        @apply-size="setSizeRange($event)"
        @clear-filters="clearFilters"
      />

      <div class="flex min-h-0 flex-1 flex-col transition-opacity" :class="isPlaceholderData && 'pointer-events-none opacity-60'" :aria-busy="isPlaceholderData || undefined">
      <SearchEmptyState
        v-if="!results.length"
        :terms="terms"
        :not-found="form.exactMatch ? [] : notFound ?? []"
        :scoped="isScoped"
        :scope-label="scopeLabel"
        :has-filters="filters.length > 0"
        :exact-match="form.exactMatch"
        @search-everywhere="setScope('all')"
        @clear-filters="clearFilters"
        @use-any-word="setExactMatch(false)"
        @edit-terms="focusTerms"
      />

      <template v-else>
        <div v-for="result in searchResults" :key="result.assetType?.id ?? 'other'" class="search__result-group mb-6">
          <h2 class="search__asset-type-name mb-2 text-body text-neutral-500">
            {{ result.assetType?.name ?? "Other files" }}
            <span class="text-[color:var(--dv-text-secondary)]">({{ result.results.length }})</span>
          </h2>
          <CollectionDisplayListFiles v-if="displayFor(result.assetType) === 'list'" :files="result.results" />
          <CollectionDisplayGridFiles v-else :files="result.results" />
        </div>

        <Pagination v-if="(search.totalPages ?? 1) > 1" v-slot="{ page }" :total="total" :items-per-page="PER_PAGE" :page="search.page ?? 1" :sibling-count="1" show-edges @update:page="setPage">
          <nav aria-label="Pagination" class="flex items-center gap-1">
            <PaginationPrev />
            <PaginationList v-slot="{ items }" class="flex items-center gap-1">
              <template v-for="(item, index) in items" :key="index">
                <PaginationListItem v-if="item.type === 'page'" :value="item.value" as-child>
                  <Button class="size-10 p-0" :variant="item.value === page ? 'default' : 'outline'" :aria-current="item.value === page ? 'page' : undefined">{{ item.value }}</Button>
                </PaginationListItem>
                <PaginationEllipsis v-else />
              </template>
            </PaginationList>
            <PaginationNext />
          </nav>
        </Pagination>
      </template>

      <section v-if="rangeFiles.length" class="search__result-group mb-6" aria-labelledby="search-range-heading">
        <h2 id="search-range-heading" class="search__asset-type-name mb-1 text-body text-neutral-500">
          Covering the range
          <span class="text-[color:var(--dv-text-secondary)]">({{ rangeTotal }})</span>
        </h2>
        <p class="mb-2 text-caption text-[color:var(--dv-text-secondary)]">Files made for a whole range of {{ recordLabel.lowerPlural.value }}, such as a collection or a season, that the {{ recordLabel.lowerPlural.value }} you searched belong to.</p>
        <CollectionDisplayGridFiles :files="rangeFiles" />
        <div class="mt-3 flex items-center gap-3">
          <Button v-if="rangePage === 0 && rangeTotal > rangeResults.length" variant="outline" @click="rangePage = 1">See all {{ rangeTotal }}</Button>
          <template v-else-if="rangePage > 0 && rangeAll">
            <Button variant="outline" :disabled="rangePage === 1 || rangeLoading" @click="rangePage--">Previous</Button>
            <span class="text-caption text-[color:var(--dv-text-secondary)]">Page {{ rangePage }} of {{ rangeAll.totalPages }}</span>
            <Button variant="outline" :disabled="!rangeAll.nextPage || rangeLoading" @click="rangePage++">Next</Button>
          </template>
        </div>
      </section>
      </div>
    </template>
  </div>
</template>
