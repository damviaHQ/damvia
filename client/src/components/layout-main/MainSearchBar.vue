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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import Modal from "@/components/Modal.vue"
import { Button } from "@/components/ui/button"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import {
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-vue-next"
import { computed, nextTick, onMounted, onUnmounted, ref, Ref, watch } from "vue"
import { LocationQuery, LocationQueryValue, useRoute, useRouter } from "vue-router"

const sentenceChoiceClasses = 'flex min-h-9 max-w-full items-center justify-between gap-2 bg-neutral-50 px-2 py-1 text-left text-base font-medium text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const router = useRouter()
const route = useRoute()
const { data: assetTypes } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})
const currentCollectionId = computed(() => {
  if (route.name === "search") {
    return route.query.from_collection ?? null
  } else if (route.name === "collection") {
    return route.params.id
  }
  return null
})

function parseQueryParts(query: string) {
  return query
    .replace(/[ \t\n\s\r,]+/gm, " ")
    .trim()
    .split(" ")
    .filter((v) => v)
}
const searchInput: Ref<HTMLInputElement | null> = ref(null) // Auto focus when modal opens
const isModalOpen = ref(false)
const currentQuery = computed((): string | string[] => {
  if (route.name === "search") {
    if (route.query.exact_match === "true") {
      return (route.query.q as string) ?? ""
    }
    return parseQueryParts((route.query.q as string) ?? "")
  }
  return route.query.exact_match === "true" ? "" : []
})

const searchScopeOptions = computed(() => {
  const globalOptions = { all: "all files and collections" }
  const collectionOptions = {
    current_with_sub: "current and sub collections",
    current: "current collection",
  }
  return currentCollectionId.value
    ? { ...collectionOptions, ...globalOptions }
    : globalOptions
})

const isSearchCleared = ref(false)
const filesNotFoundQuery = computed(() => {
  if (route.name !== "search") {
    return null
  }

  return {
    query: parseQueryParts((route.query.q as string) ?? ""),
    assetTypes: handleRouteQueryArray(route.query.asset_types),
    searchScope:
      (route.query.search_scope as string) ?? Object.keys(searchScopeOptions.value)[0],
    collectionId: route.query.from_collection as string | null,
  }
})
const filesNotFoundEnabled = computed(
  () =>
    isSearchCleared.value === false &&
    route.query.exact_match !== "true" &&
    Array.isArray(filesNotFoundQuery.value?.query) &&
    filesNotFoundQuery.value.query.length > 0
)
const filesNotFound = useQuery({
  queryKey: computed(() => ["files-not-found", filesNotFoundQuery.value]),
  enabled: filesNotFoundEnabled,
  queryFn: () => trpc.collection.searchNotFound.query(filesNotFoundQuery.value!),
})

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

const LOCAL_STORAGE_SEARCH_OPTIONS_KEY = 'damvia_search_options'
const hasSearchOptions = ref(!!localStorage.getItem(LOCAL_STORAGE_SEARCH_OPTIONS_KEY))
const requestClearSearchOptions = ref(false)

type SearchState = { query: string | string[]; assetTypes: string[]; searchScope: string; exactMatch: boolean }

function getDefaultSearchState(): SearchState {
  return {
    query: Array.isArray(currentQuery.value) ? currentQuery.value : [],
    assetTypes: (assetTypes.value ?? [])
        .filter((assetType: any) => assetType.includeInSearchByDefault)
        .map((assetType: any) => assetType.id),
    searchScope: Object.keys(searchScopeOptions.value)[0],
    exactMatch: false,
  }
}

function getInitialSearchQuery(): SearchState {
  if (route.name === "search") {
    return {
      query: currentQuery.value,
      assetTypes: handleRouteQueryArray(route.query.asset_types),
      searchScope:
          (route.query.search_scope as string) ?? Object.keys(searchScopeOptions.value)[0],
      exactMatch: route.query.exact_match === "true",
    }
  }

  let searchOptions: any = localStorage.getItem(LOCAL_STORAGE_SEARCH_OPTIONS_KEY)
  if (searchOptions) {
    searchOptions = JSON.parse(searchOptions)
    return {
      query: currentQuery.value,
      assetTypes: searchOptions?.assetTypes ?? [],
      searchScope: searchOptions?.searchScope ?? "all",
      exactMatch: searchOptions?.exactMatch ?? false,
    }
  }

  return getDefaultSearchState()
}
const searchQuery = ref(getInitialSearchQuery())

watch(
  () => assetTypes.value,
  () => {
    searchQuery.value = getInitialSearchQuery()
  }
)
watch(
  () => route.query,
  () => {
    if (route.name === "search") {
      searchQuery.value = getInitialSearchQuery()
      searchQueryValue.value = ""
    }
  }
)
watch(
  () => isModalOpen.value,
  () => {
    searchQuery.value = getInitialSearchQuery()
    searchQueryValue.value = ""
  }
)

function removeQueryPart(index: number) {
  if (!Array.isArray(searchQuery.value.query)) {
    return
  }

  searchQuery.value = {
    ...searchQuery.value,
    query: searchQuery.value.query.filter((_, currentIndex) => currentIndex !== index),
  }
}

const selectedAssetTypes = computed(() => {
  return searchQuery.value.assetTypes
    .map((id) => assetTypes.value?.find((assetType) => assetType.id === id))
    .filter((v) => v)
})
const isAssetTypeSelectOpen = ref(false)
function toggleAssetType(assetType: RouterOutput["assetType"]["list"][number]) {
  searchQuery.value = {
    ...searchQuery.value,
    assetTypes: searchQuery.value.assetTypes.includes(assetType.id)
      ? searchQuery.value.assetTypes.filter((id) => id !== assetType.id)
      : [...searchQuery.value.assetTypes, assetType.id],
  }
}

const isSearchScopeSelectOpen = ref(false)
function setSearchScope(searchScope: string) {
  searchQuery.value = {
    ...searchQuery.value,
    searchScope,
  }
  isSearchScopeSelectOpen.value = false
}

const searchQueryValue = ref("")
function handleKeydown(event: KeyboardEvent) {
  if (event.code.toLowerCase() === "backspace" && searchQueryValue.value === "") {
    removeQueryPart(searchQuery.value.query.length - 1)
    return
  } else if (["space", "enter", "comma"].includes(event.code.toLowerCase())) {
    event.preventDefault()
    if (searchQueryValue.value) {
      searchQuery.value = {
        ...searchQuery.value,
        query: [...searchQuery.value.query, searchQueryValue.value],
      }
    } else if (event.code.toLowerCase() === "enter") {
      search()
    }
    searchQueryValue.value = ""
    return
  }
}

function search() {
  if (searchQueryValue.value && !searchQuery.value.exactMatch) {
    searchQuery.value = {
      ...searchQuery.value,
      query: [...searchQuery.value.query, searchQueryValue.value],
    }
    searchQueryValue.value = ""
  }

  let routeQuery: LocationQuery = {}
  if (route.name === "search") {
    routeQuery = { ...route.query }
  } else if (route.name === "collection") {
    routeQuery.from_collection = route.params.id
  }
  routeQuery.q = Array.isArray(searchQuery.value.query)
    ? searchQuery.value.query.join(" ")
    : searchQuery.value.query
  routeQuery.asset_types = searchQuery.value.assetTypes
  routeQuery.search_scope = searchQuery.value.searchScope
  routeQuery.exact_match = "true"
  if (!searchQuery.value.exactMatch) {
    delete routeQuery.exact_match
  }

  localStorage.setItem(LOCAL_STORAGE_SEARCH_OPTIONS_KEY, JSON.stringify({
    assetTypes: searchQuery.value.assetTypes,
    searchScope: searchQuery.value.searchScope,
    exactMatch: searchQuery.value.exactMatch || false,
  }))
  hasSearchOptions.value = true
  if (requestClearSearchOptions.value) {
    localStorage.removeItem(LOCAL_STORAGE_SEARCH_OPTIONS_KEY)
  }
  router.push({ name: "search", query: routeQuery })
  searchQueryValue.value = ""
  isModalOpen.value = false
  isSearchCleared.value = false
}

function resetSearch() {
  searchQuery.value = {
    ...searchQuery.value,
    query: searchQuery.value.exactMatch ? "" : [],
  }
  searchQueryValue.value = ""
  isSearchCleared.value = true
}

function setExactMatch(enabled: boolean) {
  const newValue = { ...searchQuery.value, exactMatch: enabled }
  if (newValue.exactMatch && Array.isArray(newValue.query)) {
    newValue.query = [...newValue.query, searchQueryValue.value]
      .filter((v) => v)
      .join(" ")
    searchQueryValue.value = ""
  } else if (!newValue.exactMatch && !Array.isArray(newValue.query)) {
    newValue.query = parseQueryParts(newValue.query)
  }
  searchQuery.value = newValue
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const clipboardData = event.clipboardData?.getData("text/plain") ?? ""
  searchQuery.value = {
    ...searchQuery.value,
    query: [...searchQuery.value.query, ...parseQueryParts(clipboardData)],
  }
}

function isContainingElement(el: HTMLElement, child: HTMLElement) {
  for (
    let current: HTMLElement | null = child;
    current;
    current = current.parentElement
  ) {
    if (current === el) {
      return true
    }
  }
  return false
}

const assetTypeSelect = ref<HTMLElement | null>(null)
const searchScopeSelect = ref<HTMLElement | null>(null)
const assetTypeToggle = ref<HTMLElement | null>(null)
const searchScopeToggle = ref<HTMLElement | null>(null)
function closeAssetTypeSelect(event: KeyboardEvent) {
  if (!isAssetTypeSelectOpen.value) {
    return
  }
  event.stopPropagation()
  isAssetTypeSelectOpen.value = false
  assetTypeToggle.value?.focus()
}
function closeSearchScopeSelect(event: KeyboardEvent) {
  if (!isSearchScopeSelectOpen.value) {
    return
  }
  event.stopPropagation()
  isSearchScopeSelectOpen.value = false
  searchScopeToggle.value?.focus()
}
function handleDocumentClick(event: Event) {
  const target = event.target as HTMLDivElement
  if (assetTypeSelect.value && !isContainingElement(assetTypeSelect.value, target)) {
    isAssetTypeSelectOpen.value = false
  }
  if (searchScopeSelect.value && !isContainingElement(searchScopeSelect.value, target)) {
    isSearchScopeSelectOpen.value = false
  }
}

const editingIndex = ref<number | null>(null)

function startEditing(index: number) {
  editingIndex.value = index
  nextTick(() => {
    const input = document.getElementById(`edit-input-${index}`)
    if (input) {
      (input as HTMLInputElement).focus()
    }
  })
}

function saveEdit(index: number, newValue: string) {
  if (Array.isArray(searchQuery.value.query)) {
    const newTags = newValue
      .trim()
      .split(/\s+/)
      .filter((tag) => tag !== "")
    if (newTags.length > 1) {
      // If user added space replace the edited tag with multiple new tags
      searchQuery.value.query.splice(index, 1, ...newTags)
    } else if (newTags.length === 1) {
      // Replace with a single new tag
      searchQuery.value.query[index] = newTags[0]
    } else {
      // Remove the tag if it's empty after trimming
      searchQuery.value.query.splice(index, 1)
    }
  }
  editingIndex.value = null
}

function clearSearchOptions() {
  searchQuery.value = getDefaultSearchState()
  searchQueryValue.value = ""
  requestClearSearchOptions.value = true
}

watch(isModalOpen, (newValue) => {
  requestClearSearchOptions.value = false
  if (newValue) {
    nextTick(() => {
      if (searchInput.value) {
        searchInput.value.focus()
      }
    })
  }
})

onMounted(() => {
  document.addEventListener("click", handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick)
})
</script>

<template>
  <div class="dashboard-layout-search-bar__container relative flex min-w-0 items-center gap-1">
    <button type="button" class="group flex h-10 min-w-0 items-center gap-2.5 border border-neutral-200 bg-neutral-50 px-3 text-left transition-colors hover:border-neutral-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-ring md:w-[360px]" @click="isModalOpen = true" aria-label="Search assets">
      <Search class="size-4 shrink-0 text-neutral-500" />
      <span class="truncate text-[length:var(--dv-field-label-size)] text-neutral-500 max-md:hidden">{{ (Array.isArray(currentQuery) ? currentQuery.join(', ') : currentQuery) || 'Search assets' }}</span>
    </button>
    <button type="button" aria-label="Search filters" class="search-filter-trigger flex size-9 items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" @click.prevent="router.push({ name: 'search' })">
      <SlidersHorizontal class="cursor-pointer text-neutral-500 hover:text-neutral-800" width="18" />
    </button>
  </div>
  <modal v-if="isModalOpen" @close="isModalOpen = false">
    <div class="search-bar__modal w-full min-w-0">
      <div class="search-bar__modal-title flex flex-wrap items-center gap-2 mb-5 text-base font-medium text-neutral-600" data-search-sentence>
        <span>I</span>
        <div class="search-bar__modal-select relative min-w-0">
          <Label for="search-mode" class="sr-only">Search mode</Label>
          <button id="search-mode" type="button" aria-label="Search mode" :aria-pressed="searchQuery.exactMatch" :title="searchQuery.exactMatch ? 'Switch to multiple references' : 'Switch to an exact term'" class="search-bar__modal-select-control" :class="sentenceChoiceClasses" @click="setExactMatch(!searchQuery.exactMatch)">
            <div
              class="min-w-0 max-w-[300px] truncate">
              {{
                searchQuery.exactMatch
                  ? "search an exact term in"
                  : "search multiple references of"
              }}
            </div>
          </button>
        </div>
        <div class="search-bar__modal-select relative min-w-0" ref="assetTypeSelect" @keydown.esc="closeAssetTypeSelect">
          <Label for="search-asset-types" class="sr-only">Asset types</Label>
          <button id="search-asset-types" ref="assetTypeToggle" aria-label="Asset types" :aria-expanded="isAssetTypeSelectOpen" aria-controls="search-asset-types-options" class="search-bar__modal-select-control" :class="sentenceChoiceClasses" @click="isAssetTypeSelectOpen = !isAssetTypeSelectOpen">
            <div
              class="min-w-0 max-w-[300px] truncate">
              {{ selectedAssetTypes.length ? selectedAssetTypes.map((assetType) => assetType!.name).join(', ') : 'any asset type' }}
            </div>
            <ChevronDown class="size-4 shrink-0" />
          </button>
          <div v-if="isAssetTypeSelectOpen" id="search-asset-types-options" class="search-bar__modal-select-content absolute z-20 mt-1 flex min-w-full flex-col gap-1 bg-white p-1 shadow-md border border-input">
            <label v-for="assetType in assetTypes" :key="assetType.id" class="flex cursor-pointer items-center gap-2 px-2 py-2 text-body text-foreground hover:bg-neutral-100">
              <Checkbox :model-value="searchQuery.assetTypes.includes(assetType.id)" :aria-label="assetType.name" @update:model-value="toggleAssetType(assetType)" />
              <span>{{ assetType.name }}</span>
            </label>
          </div>
        </div>
        <span>in</span>
        <div class="search-bar__modal-select relative min-w-0" ref="searchScopeSelect" @keydown.esc="closeSearchScopeSelect">
          <Label for="search-scope" class="sr-only">Search scope</Label>
          <button id="search-scope" ref="searchScopeToggle" aria-label="Search scope" :aria-expanded="isSearchScopeSelectOpen" aria-controls="search-scope-options" class="search-bar__modal-select-control" :class="sentenceChoiceClasses" @click="isSearchScopeSelectOpen = !isSearchScopeSelectOpen">
            <div
              class="min-w-0 max-w-[300px] truncate">
              {{ (searchScopeOptions as any)[searchQuery.searchScope] ?? 'all' }}
            </div>
            <ChevronDown class="size-4 shrink-0" />
          </button>
          <div v-if="isSearchScopeSelectOpen" id="search-scope-options" class="search-bar__modal-select-content absolute z-20 mt-1 flex min-w-full flex-col gap-1 bg-white p-1 shadow-md border border-input">
            <button v-for="[value, name] in Object.entries(searchScopeOptions)" :key="value"
              class="search-bar__modal-select-option flex text-base items-center p-[0.2em] border-none text-neutral-500 hover:bg-neutral-100 bg-transparent cursor-pointer [&:last-child]:mb-0 [&_>_svg]:mr-2 [&_>_svg]:pointer-events-none" @click="setSearchScope(value)">
              {{ name }}
            </button>
          </div>
        </div>
      </div>
      <Label for="search-terms" class="mb-[var(--dv-field-gap)]">Search terms</Label>
      <div class="search-bar__modal-query flex min-h-[var(--dv-control-height)] flex-wrap gap-2 border border-input bg-background px-[var(--dv-control-padding-x)] py-[var(--dv-control-padding-y)] max-h-[300px] overflow-x-auto focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        <template v-if="Array.isArray(searchQuery.query)">
          <div v-for="(element, index) in searchQuery.query" :key="index"
            class="tags [&:focus-within]:ring-neutral-400 flex items-center bg-neutral-50 text-neutral-500 font-medium ring-2 ring-neutral-200 hover:ring-neutral-300 text-base px-[0.2em] py-0.5 max-w-[260px] overflow-clip cursor-pointer whitespace-nowrap"
            @dblclick="startEditing(index)">
            <button v-if="editingIndex !== index" type="button" :aria-label="`Edit ${element}`" class="text-sm pl-[0.5em] pr-[0.2em] cursor-pointer" @click="startEditing(index)">
              {{ element }}
            </button>
            <input v-else :id="`edit-input-${index}`" :value="element" :aria-label="`Edit ${element}`"
              class="text-sm pl-[0.5em] pr-[0.2em] bg-transparent border-none outline-hidden"
              @blur="saveEdit(index, ($event.target as HTMLInputElement).value)" @keyup.enter="saveEdit(index, ($event.target as HTMLInputElement).value)" />
            <button type="button" :aria-label="`Remove ${element}`" @click.stop="removeQueryPart(index)">
              <X aria-hidden="true" class="w-4 h-4 text-neutral-600 hover:text-red-400 ml-1" />
            </button>
          </div>
          <input id="search-terms" class="search-bar__modal-query-input flex-1 [min-width:120px] p-0 [background:transparent] border-0 font-medium text-[length:var(--dv-field-label-size)] leading-[var(--dv-field-line-height)] [&::placeholder]:text-neutral-400 [&::placeholder]:text-[length:var(--dv-field-label-size)] [&::placeholder]:font-normal [&:focus]:[outline:none]" type="text"
            placeholder="Paste multiple product references or files separated by spaces." @keydown="handleKeydown"
            @paste="handlePaste" v-model="searchQueryValue" ref="searchInput" />
        </template>
        <input v-else id="search-terms" class="search-bar__modal-query-input flex-1 [min-width:120px] p-0 [background:transparent] border-0 font-medium text-[length:var(--dv-field-label-size)] leading-[var(--dv-field-line-height)] [&::placeholder]:text-neutral-400 [&::placeholder]:text-[length:var(--dv-field-label-size)] [&::placeholder]:font-normal [&:focus]:[outline:none]" type="text"
          placeholder="Search for a reference or a file name" ref="searchInput" :value="searchQuery.query" @keydown.enter="search"
          @input="searchQuery = { ...searchQuery, query: ($event.target as HTMLInputElement).value }" />
      </div>
      <div class="search-bar__modal-actions mt-5 pt-2 gap-2 flex flex-wrap items-center justify-end">
        <div v-if="filesNotFoundEnabled && filesNotFound.data?.value?.length" class="search-bar__modal-missing-items text-center text-neutral-600 [font-size:14px] mb-2">
          <div>No file found for those items:</div>
          <div>{{ filesNotFound.data.value.join(", ") }}</div>
        </div>
        <Button type="button" @click="search" class="order-2 px-8">Search</Button>
        <div class="order-1 mr-auto flex items-center gap-4">
          <Button
            type="button" variant="ghost" @click="resetSearch"
            class="bg-transparent text-neutral-500 hover:bg-transparent hover:text-red-500 text-sm p-0 mt-1.5"
          >
            Clear search
          </Button>
          <Button
            v-if="hasSearchOptions && !requestClearSearchOptions" @click="clearSearchOptions"
            type="button" variant="ghost"
            class="bg-transparent text-neutral-500 hover:bg-transparent hover:text-red-500 text-sm p-0 mt-1.5"
          >
            Reset to default
          </Button>
        </div>
      </div>
    </div>
  </modal>
</template>
