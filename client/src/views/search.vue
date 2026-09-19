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
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
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
import LayoutDialogMember from "@/layouts/LayoutDialogMember.vue"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { FILE_TYPE_OPTIONS } from "@/utils/searchQuery"
import { useQuery } from "@tanstack/vue-query"
import groupBy from "lodash/groupBy"
import { storeToRefs } from "pinia"
import { computed, ref } from "vue"

const PER_PAGE = 300
const { form, terms, hasQuery, filters, isScoped, setValues, setSort, setScope, setExactMatch, toggleValue, clearFilters, setPage } = useSearchState()
const isMemberDialogOpen = ref(false)

const { data: assetTypes } = useQuery({ queryKey: ["asset-types"], queryFn: () => trpc.assetType.list.query() })
const { data: productFacets } = useQuery({ queryKey: ["products", "attributes", "facets"], queryFn: () => trpc.productAttribute.listFacets.query() })
const { data: collection } = useQuery({
  enabled: computed(() => !!form.value.collectionId),
  queryKey: computed(() => ["collection", form.value.collectionId]),
  queryFn: () => trpc.collection.findById.query(form.value.collectionId!),
})
const { status, data: search, error } = useQuery({
  queryKey: computed(() => ["search", form.value]),
  queryFn: () => trpc.collection.search.query(form.value),
})
const notFoundInput = computed(() => ({
  query: terms.value,
  collectionId: form.value.collectionId,
  assetTypes: form.value.assetTypes,
  productViews: form.value.productViews,
  fileTypes: form.value.fileTypes,
  searchScope: form.value.searchScope,
}))
const { data: notFound } = useQuery({
  enabled: computed(() => !form.value.exactMatch && terms.value.length > 0),
  queryKey: computed(() => ["search-not-found", notFoundInput.value]),
  queryFn: () => trpc.collection.searchNotFound.query(notFoundInput.value),
})

const emptyFacets = { assetTypes: {}, fileTypes: {}, productViews: {}, attributes: {} }
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

const chips = computed<FilterChip[]>(() =>
  filters.value.map((filter) => {
    if (filter.group === "asset_types") {
      const name = assetTypes.value?.find((assetType: any) => assetType.id === filter.value)?.name ?? filter.value
      return { key: filter.key, value: filter.value, label: `Asset type: ${name}` }
    } else if (filter.group === "file_types") {
      const name = FILE_TYPE_OPTIONS.find((option) => option.id === filter.value)?.label ?? filter.value
      return { key: filter.key, value: filter.value, label: `File type: ${name}` }
    } else if (filter.group === "product_views") {
      return { key: filter.key, value: filter.value, label: `View: ${filter.value}` }
    }
    const facet = productFacets.value?.find((entry: any) => entry.id === filter.attributeId)
    return { key: filter.key, value: filter.value, label: `${facet?.displayName || facet?.name || "Attribute"}: ${filter.value}` }
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

function displayFor(assetType: any): "grid" | "list" {
  return (
    globalStore.displayPreferences[assetType?.id as never] ??
    assetType?.defaultDisplay ??
    globalStore.displayPreferences["asset_file"] ??
    "grid"
  )
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
    <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
      {{ error?.message }}
    </div>
    <template v-else-if="status === 'success' && search">
      <SearchToolbar
        :total="total"
        :terms="terms"
        :scope-label="scopeLabel"
        :file-type-counts="facets.fileTypes"
        :file-types="form.fileTypes"
        :sort="form.sort"
        :has-query="hasQuery"
        :chips="chips"
        @update:file-types="setValues('file_types', $event)"
        @update:sort="setSort($event)"
        @remove-chip="toggleValue($event.key, $event.value)"
        @clear-filters="clearFilters"
        @open-display-preferences="isMemberDialogOpen = true"
      />

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
        <div class="mb-4 flex items-center gap-1.5">
          <CollectionCheckbox label="Select all results" :state="allSelected ? 'check' : selection.length > 0 ? 'undetermined' : false" @click="toggleSelection" />
          <button type="button" class="cursor-pointer bg-transparent p-0 text-body text-neutral-500 hover:text-neutral-900" @click="toggleSelection">
            <template v-if="allSelected">Unselect all</template>
            <template v-else-if="selection.length">{{ selection.length }} selected, select all</template>
            <template v-else>Select all</template>
          </button>
        </div>

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
    </template>
    <LayoutDialogMember v-model:open="isMemberDialogOpen" :initial-tab="'display-preferences'" />
  </div>
</template>
