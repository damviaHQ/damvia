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
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import LayoutDialogMember from "@/layouts/LayoutDialogMember.vue"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { groupBy } from "lodash"
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  PanelRightClose,
  PanelRightOpen
} from "lucide-vue-next"
import { storeToRefs } from "pinia"
import { computed, ref } from "vue"
import { LocationQueryValue, useRoute, useRouter } from "vue-router"
import Treeselect from "vue3-treeselect-ts"

const route = useRoute()
const router = useRouter()
const isMemberDialogOpen = ref(false)
const hideFilters = ref(false)
const fileTypeOptions = [
  { label: "Documents", id: "document" },
  { label: "Videos", id: "video" },
  { label: "Images", id: "image" },
]
const { data: assetTypes } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})
const { data: productViews } = useQuery({
  queryKey: ["product-views"],
  queryFn: () => trpc.asset.listProductViews.query(),
})
const { data: productFacets } = useQuery({
  queryKey: ["products", "attributes", "facets"],
  queryFn: () => trpc.productAttribute.listFacets.query(),
})
const { data: collection } = useQuery({
  enabled() {
    return !!route.query.from_collection
  },
  queryKey: computed(() => ["collection", route.query.from_collection]),
  queryFn: () => trpc.collection.findById.query(route.query.from_collection as string),
})

const collectionName = computed(() => {
  if (form.value.collectionId && collection.value) {
    return collection.value.name
  }
  return ""
})
const assetTypeOptions = computed(() =>
  (assetTypes.value ?? []).map((assetType) => ({
    label: assetType.name,
    id: assetType.id,
  }))
)
const searchScopeOptions = computed(() => {
  const globalOptions = [{ label: "Every collections", id: "all" }]
  const collectionOptions = [
    {
      label: "Current and Sub Collections",
      id: "current_with_sub",
    },
    {
      label: "Current Collection",
      id: "current",
    },
  ]
  return route.query.from_collection
    ? [...collectionOptions, ...globalOptions]
    : globalOptions
})
const productViewOptions = computed(() =>
  (productViews.value ?? []).map((productView) => ({
    label: productView,
    id: productView,
  }))
)

function handleRouteQueryArray(
  query: LocationQueryValue | LocationQueryValue[]
): string[] {
  if (!query) {
    return []
  } else if (!Array.isArray(query)) {
    return [query]
  }
  return query as string[]
}

const form = computed(() => {
  const attributes = Object.fromEntries(
    Object.entries(route.query)
      .map(([key, value]) => {
        const match = /attributes\[(.+)]/g.exec(key)
        return match ? [match[1], handleRouteQueryArray(value)] : null
      })
      .filter((value) => value)
  )

  return {
    query: route.query.q as string,
    page: route.query.page ? parseInt(route.query.page as string, 10) : undefined,
    collectionId: route.query.from_collection as string,
    assetTypes: handleRouteQueryArray(route.query.asset_types),
    productViews: handleRouteQueryArray(route.query.product_views),
    fileTypes: handleRouteQueryArray(route.query.file_types),
    searchScope: (route.query.search_scope as string) ?? searchScopeOptions.value[0].id,
    exactMatch: route.query.exact_match === "true",
    attributes,
  }
})

const { status, data: search, error } = useQuery({
  queryKey: computed(() => ["search", form.value]),
  queryFn: () => trpc.collection.search.query(form.value),
})

const searchResults = computed(() =>
  Object.entries(groupBy(search.value?.results ?? [], "assetTypeId")).map(
    ([assetTypeId, results]) => ({
      assetType: assetTypes.value?.find((assetType) => assetType.id === assetTypeId),
      results,
    })
  )
)

const globalStore = useGlobalStore()
const storeRefs = storeToRefs(globalStore)
const selection = computed(() => {
  if (!search.value?.results) {
    return []
  }

  const fileIds = search.value.results.map((file: any) => file.id) ?? []
  return storeRefs.selection.value.filter(
    (item) => item.type === "file" && fileIds.includes(item.id)
  )
})

function handleSetQuery(key: string, value: string[]) {
  router.push({
    ...route,
    query: {
      ...route.query,
      [key]: value,
    },
  })
}

const isHovered = ref(false)

function goBack() {
  router.push({ name: "collection", params: { id: form.value.collectionId } })
}

function toggleSelection() {
  if (!search.value) {
    return
  } else if (!selection.value.length) {
    search.value.results.forEach((file: any) =>
      globalStore.addToSelection({ type: "file", id: file.id })
    )
  } else if (selection.value.length === search.value.results.length) {
    selection.value.forEach((item) => globalStore.removeFromSelection(item))
    isHovered.value = false
    return
  }

  search.value.results
    .filter(
      (file: any) =>
        !selection.value.some((item) => item.type === "file" && item.id === file.id)
    )
    .forEach((file: any) => globalStore.addToSelection({ type: "file", id: file.id }))
}

function openMemberDialog() {
  isMemberDialogOpen.value = true
}
</script>

<template>
  <div class="flex h-full">
    <div class="flex-1 overflow-auto p-4">
      <div v-if="status === 'pending'">
        <Loader :text="true" />
      </div>
      <div v-else-if="status === 'error'" class="alert alert-danger">
        {{ error?.message }}
      </div>
      <div v-else-if="status === 'success'" class="search__back-container">
        <div class="search__back-wrapper">
          <div class="flex items-center flex-1">
            <div v-if="search && search.results?.length" class="flex flex-row gap-1.5 items-center"
              @mouseenter="isHovered = true" @mouseleave="isHovered = false">
              <CollectionCheckbox @click="toggleSelection" :state="search && selection.length === search.results.length
                ? 'check'
                : selection.length > 0
                  ? 'undetermined'
                  : false
                " />
              <!-- Nothing is selected, [] SELECT ALL -->
              <button v-if="!selection.length" @click="toggleSelection"
                class="flex items-center text-sm gap-1.5 text-neutral-500 bg-transparent border-none cursor-pointer p-0">
                <span>Select All</span>
              </button>
              <button v-else-if="selection.length"
                class="flex items-center text-sm gap-1.5 text-neutral-500 bg-transparent border-none cursor-pointer p-0"
                @click="toggleSelection">
                <!-- Show number of items selected -->
                <span v-if="!isHovered && selection.length">{{ selection.length }} item{{ selection.length > 1 ? "s" :
                  "" }}
                  selected
                  <span v-if="form.collectionId && form.searchScope !== 'all'"> in</span>
                </span>
                <!-- HOVER -->
                <span v-else-if="search && form.collectionId && form.searchScope !== 'all'">
                  <!-- HOVER inside a specific collection -->
                  {{
                    selection.length === search.results.length
                      ? "Remove all selected items in"
                      : "Select all items in"
                  }}
                </span>
                <span v-else-if="search">
                  <!-- HOVER in every collection -->
                  {{
                    selection.length === search.results.length
                      ? "Remove all selected items"
                      : "Select all items"
                  }}
                </span>
              </button>
              <ChevronRight v-if="
                form.collectionId && search.results.length && form.searchScope !== 'all'
              " class="h-4 w-4 text-neutral-500 mx-2 ml-0" />
            </div>
            <!-- Display collection name if inside collection, or every collection -->
            <div>
              <div v-if="form.searchScope === 'current_with_sub'" class="search__scope-wrapper">
                <span v-if="search && !search.results.length">No result found</span>
                <span v-if="!selection.length">in</span> {{ collectionName }} and it's sub
                collections
              </div>
              <div v-else-if="form.searchScope === 'current'" class="search__scope-wrapper">
                <span v-if="search && !search.results.length">No result found</span>
                <span v-if="!selection.length">in</span> {{ collectionName }}
              </div>
              <div v-else class="search__scope-wrapper">
                <span v-if="search && !search.results.length">No result found in any collection</span>
              </div>
            </div>
          </div>
          <Button v-if="form.collectionId" variant="ghost" type="button" class="pl-0" @click="goBack"
            :title="collectionName">
            <ChevronLeft class="h-4 w-4 text-neutral-500 mx-2" />
            <span class="text-neutral-500">Back to collection</span>
          </Button>
          <div class="search__path-actions">
            <Button @click="openMemberDialog" type="button" variant="ghost" size="icon">
              <LayoutDashboard class="text-neutral-500 hover:text-neutral-800" />
            </Button>
          </div>
          <Button v-if="hideFilters" @click="hideFilters = !hideFilters" variant="ghost" size="icon" type="button">
            <PanelRightOpen class="text-neutral-500 hover:text-neutral-800" />
          </Button>
          <Button v-else @click="hideFilters = !hideFilters" variant="ghost" size="icon" type="button">
            <PanelRightClose class="text-neutral-500 hover:text-neutral-800" />
          </Button>
        </div>
      </div>

      <div>
        <div v-if="searchResults.length >= 1">
          <div v-for="result in searchResults" :key="result.assetType?.id" class="search__result-group">
            <div v-if="result.assetType" class="search__asset-type-name">
              {{ result.assetType?.name }}
            </div>
            <CollectionDisplayListFiles v-if="
              (
                globalStore.displayPreferences[result.assetType?.id as never] ??
                result.assetType?.defaultDisplay ??
                globalStore.displayPreferences['asset_file'] ??
                'grid'
              ) === 'list'
            " :files="result.results" />
            <CollectionDisplayGridFiles v-else :files="result.results" />
          </div>

          <div v-if="search && search.totalPages > 1" class="search__pagination">
            <router-link v-if="search.previousPage" :to="{
              name: 'search',
              query: { ...$route.query, page: search.previousPage },
            }">
              Previous page
            </router-link>
            <div>{{ search.page }}/{{ search.totalPages }}</div>
            <router-link v-if="search.nextPage"
              :to="{ name: 'search', query: { ...$route.query, page: search.nextPage } }">
              Next page
            </router-link>
          </div>
        </div>
      </div>
    </div>
    <div v-if="!hideFilters" class="flex flex-col bg-neutral-50 p-4 gap-3 w-64 h-full overflow-y-auto">
      <div>
        <Label>Asset Type</Label>
        <treeselect :model-value="form.assetTypes" @update:modelValue="handleSetQuery('asset_types', $event)"
          :options="assetTypeOptions" :clearable="true" :multiple="true" placeholder="All"
          no-options-text="No asset type available." />
      </div>
      <div>
        <Label>Search scope</Label>
        <treeselect :model-value="form.searchScope" @update:modelValue="handleSetQuery('search_scope', $event)"
          :options="searchScopeOptions" placeholder="" no-options-text="No search scope available."
          :clearable="false" />
      </div>
      <div>
        <Label>Product view</Label>
        <treeselect :model-value="form.productViews" @update:modelValue="handleSetQuery('product_views', $event)"
          :clearable="true" :multiple="true" :options="productViewOptions" placeholder="All"
          no-options-text="No product views available." />
      </div>
      <div>
        <Label>File type</Label>
        <treeselect :model-value="form.fileTypes" @update:modelValue="handleSetQuery('file_types', $event)"
          :clearable="true" :multiple="true" :options="fileTypeOptions" placeholder="All"
          no-options-text="No file types available." />
      </div>
      <div v-for="facet in productFacets">
        <Label>{{ facet.displayName || facet.name }}</Label>
        <treeselect :model-value="form.attributes[facet.id] ?? []" :clearable="true" :multiple="true"
          @update:modelValue="handleSetQuery(`attributes[${facet.id}]`, $event)"
          :options="facet.values.map((value) => ({ label: value, id: value }))" placeholder="All"
          no-options-text="No options available." />
      </div>
    </div>
    <LayoutDialogMember v-model:open="isMemberDialogOpen" :initial-tab="'display-preferences'" />
  </div>
</template>

<style scoped lang="scss">
.search__filter-container {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.search__filter {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.search__filter>label {
  color: var(--primary-color50);
  font-weight: 500;
  padding-bottom: 4px;
}

.search__back-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.search__back-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  margin-bottom: 1rem;
}

.search__back {
  width: max-content;
  display: flex;
  align-items: center;
  font-size: 15px;
  margin: 16px 0;
  padding: 0;
  gap: 0.4rem;
  font-weight: 500;
  color: var(--primary-color50);
  background: none;
  border: none;
  cursor: pointer;
}

.search__back>svg {
  height: 1.3rem;
  padding: 0.1rem;
  width: 1.3rem;
  stroke: var(--primary-color50);
  stroke-width: 1px;
  border: 1px solid var(--primary-color50);
  border-radius: var(--border-radius);
}

.search__back-collection-name {
  font-weight: 700;
}

.search__result-group {
  margin-bottom: 24px;
}

.search__path-actions {
  margin-left: auto;
}

.search__asset-type-name {
  @apply text-neutral-500 text-sm mb-2;
}

.search__filter-list-actions {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 0.8rem;

  button {
    color: var(--primary-color65);
    font-size: 14px;
    background: none;
    border: none;
    cursor: pointer;
  }
}

.search__filter--checkbox {
  flex-direction: row;
  align-items: center;
}

.search__filter--checkbox>label {
  padding-left: 4px;
  padding-bottom: 0;
}

.search__filer-match {
  margin-bottom: 0px !important;
}

.search__pagination {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search__pagination>a {
  color: var(--primary-color50);
}

.no-result {
  color: var(--primary-color50);
  font-size: 15px;
  font-weight: 500;
  text-align: center;
  margin-top: 24px;
}

.search__selection-btn,
.search__selection-text {
  font-size: 1rem;
  background: transparent;
  border: none;
  color: var(--primary-color50);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin-left: 0.5rem;

  &:hover {
    text-decoration: underline;
  }
}

.search__path-item-chevron {
  width: 0.75rem;
  height: 0.75rem;
  stroke-width: 2px;
  stroke: var(--primary-color50);
  margin: 0 0.3rem;
}

.search__scope-wrapper {
  @apply text-sm text-neutral-800 font-medium p-0 bg-transparent border-none cursor-pointer;
}
</style>
