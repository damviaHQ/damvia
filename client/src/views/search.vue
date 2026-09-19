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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
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
const { data: allProductFacets } = useQuery({
  queryKey: ["products", "attributes", "facets"],
  queryFn: () => trpc.productAttribute.listFacets.query(),
})

const productFacets = computed(() => {
  if (!allProductFacets.value) {
    return []
  }

  return allProductFacets.value.map((facet: any) => {
    const searchData = searchForFacets.value || search.value
    if (!searchData?.results || searchData.results.length === 0) {
      return facet
    }

    const valuesInResults = new Set<string>()
    
    searchData.results.forEach((result: any) => {
      if (result.product?.attributes) {
        const attribute = result.product.attributes.find((attr: any) => attr.name === facet.name)
        if (attribute?.value) {
          const value = attribute.value
          if (Array.isArray(value)) {
            value.forEach(v => valuesInResults.add(v))
          } else {
            valuesInResults.add(value)
          }
        }
      }
    })

    return {
      ...facet,
      values: Array.from(valuesInResults)
    }
  })
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
  (assetTypes.value ?? [])
    .map((assetType: any) => ({
      label: assetType.name,
      id: assetType.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
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
  (productViews.value ?? [])
    .map((productView: any) => ({
      label: productView,
      id: productView,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
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

const { data: searchForFacets } = useQuery({
  queryKey: computed(() => ["search-for-facets", { ...form.value, attributes: {} }]),
  queryFn: () => trpc.collection.search.query({ ...form.value, attributes: {} }),
})

const searchResults = computed(() =>
  Object.entries(groupBy(search.value?.results ?? [], "assetTypeId")).map(
    ([assetTypeId, results]) => ({
      assetType: assetTypes.value?.find((assetType: any) => assetType.id === assetTypeId),
      results: results.sort((a: any, b: any) => a.name.localeCompare(b.name)),
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
  <div class="flex min-h-full gap-8">
    <div class="min-w-0 flex-1">
      <h1 class="sr-only">Search</h1>
      <div role="status" aria-live="polite" class="sr-only">
        <template v-if="status === 'success' && search">{{ search.total ? `${search.total} result${search.total > 1 ? "s" : ""} found` : "No results found" }}</template>
      </div>
      <div v-if="status === 'pending'">
        <Loader :text="true" />
      </div>
      <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
        {{ error?.message }}
      </div>
      <div v-else-if="status === 'success'" class="search__back-container flex flex-col w-full">
        <div class="search__back-wrapper mb-6 flex w-full items-center justify-between gap-4 border-b border-neutral-200 pb-5">
          <div class="flex items-center flex-1">
            <div v-if="search && search.results?.length" class="flex flex-row gap-1.5 items-center"
              @mouseenter="isHovered = true" @mouseleave="isHovered = false" @focusin="isHovered = true" @focusout="isHovered = false">
              <CollectionCheckbox label="Select all results" @click="toggleSelection" :state="search && selection.length === search.results.length
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
              <div v-if="form.searchScope === 'current_with_sub'" class="search__scope-wrapper text-sm text-neutral-800 font-medium p-0 bg-transparent border-none cursor-pointer">
                <span v-if="search && !search.results.length">No results found in </span>
                <span v-else-if="!selection.length">in </span> {{ collectionName }} and its sub
                collections
              </div>
              <div v-else-if="form.searchScope === 'current'" class="search__scope-wrapper text-sm text-neutral-800 font-medium p-0 bg-transparent border-none cursor-pointer">
                <span v-if="search && !search.results.length">No results found in </span>
                <span v-else-if="!selection.length">in </span> {{ collectionName }}
              </div>
              <div v-else class="search__scope-wrapper text-sm text-neutral-800 font-medium p-0 bg-transparent border-none cursor-pointer">
                <span v-if="search && !search.results.length">No result found in any collection</span>
              </div>
            </div>
          </div>
          <Button v-if="form.collectionId" variant="ghost" type="button" class="pl-0" @click="goBack"
            :title="collectionName">
            <ChevronLeft class="h-4 w-4 text-neutral-500 mx-2" />
            <span class="text-neutral-500">Back to collection</span>
          </Button>
          <div class="search__path-actions ml-auto">
            <Button @click="openMemberDialog" type="button" variant="ghost" size="icon" aria-label="Display preferences">
              <LayoutDashboard class="text-neutral-500 hover:text-neutral-800" />
            </Button>
          </div>
          <Button v-if="hideFilters" @click="hideFilters = !hideFilters" variant="ghost" size="icon" type="button" aria-label="Show filters" :aria-expanded="false" aria-controls="search-filters">
            <PanelRightOpen class="text-neutral-500 hover:text-neutral-800" />
          </Button>
          <Button v-else @click="hideFilters = !hideFilters" variant="ghost" size="icon" type="button" aria-label="Hide filters" :aria-expanded="true" aria-controls="search-filters">
            <PanelRightClose class="text-neutral-500 hover:text-neutral-800" />
          </Button>
        </div>
      </div>

      <div>
        <div v-if="searchResults.length >= 1">
          <div v-for="result in searchResults" :key="result.assetType?.id" class="search__result-group mb-6">
            <h2 v-if="result.assetType" class="search__asset-type-name text-neutral-500 text-sm mb-2">
              {{ result.assetType?.name }}
            </h2>
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

          <nav v-if="search && search.totalPages > 1" aria-label="Pagination" class="search__pagination flex items-center gap-4 [&_>_a]:[color:var(--dv-text-secondary)]">
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
          </nav>
        </div>
      </div>
    </div>
    <div v-if="!hideFilters" id="search-filters" class="flex w-60 shrink-0 flex-col gap-5 border-l border-neutral-200 pl-6">
      <FieldGroup>
        <Label for="search-assetTypes">Asset Type</Label>
        <treeselect input-id="search-assetTypes" :model-value="form.assetTypes" @update:modelValue="handleSetQuery('asset_types', $event)"
          :options="assetTypeOptions" :clearable="true" :multiple="true" placeholder="All"
          no-options-text="No asset type available." />
      </FieldGroup>
      <FieldGroup>
        <Label for="search-searchScope">Search scope</Label>
        <treeselect input-id="search-searchScope" :model-value="form.searchScope" @update:modelValue="handleSetQuery('search_scope', $event)"
          :options="searchScopeOptions" placeholder="" no-options-text="No search scope available."
          :clearable="false" />
      </FieldGroup>
      <FieldGroup>
        <Label for="search-productViews">Product view</Label>
        <treeselect input-id="search-productViews" :model-value="form.productViews" @update:modelValue="handleSetQuery('product_views', $event)"
          :clearable="true" :multiple="true" :options="productViewOptions" placeholder="All"
          no-options-text="No product views available." />
      </FieldGroup>
      <FieldGroup>
        <Label for="search-fileTypes">File type</Label>
        <treeselect input-id="search-fileTypes" :model-value="form.fileTypes" @update:modelValue="handleSetQuery('file_types', $event)"
          :clearable="true" :multiple="true" :options="fileTypeOptions" placeholder="All"
          no-options-text="No file types available." />
      </FieldGroup>
      <FieldGroup v-for="facet in productFacets">
        <Label :for="`search-facet-${facet.id}`">{{ facet.displayName || facet.name }}</Label>
        <treeselect :input-id="`search-facet-${facet.id}`" :model-value="form.attributes[facet.id] ?? []" :clearable="true" :multiple="true"
          @update:modelValue="handleSetQuery(`attributes[${facet.id}]`, $event)"
          :options="facet.values.map((value: string) => ({ label: value, id: value })).sort((a, b) => a.label.localeCompare(b.label))" placeholder="All"
          no-options-text="No options available." />
      </FieldGroup>
    </div>
    <LayoutDialogMember v-model:open="isMemberDialogOpen" :initial-tab="'display-preferences'" />
  </div>
</template>
