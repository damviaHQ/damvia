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
import Modal from "@/components/Modal.vue"
import { Button } from "@/components/ui/button"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import {
  ChevronDown,
  Quote,
  Search,
  SlidersHorizontal,
  Square,
  SquareCheck,
  X,
} from "lucide-vue-next"
import { computed, nextTick, onMounted, onUnmounted, ref, Ref, watch } from "vue"
import { LocationQuery, LocationQueryValue, useRoute, useRouter } from "vue-router"

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
watch(isModalOpen, (newValue) => {
  if (newValue) {
    nextTick(() => {
      if (searchInput.value) {
        searchInput.value.focus()
      }
    })
  }
})
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

function getInitialSearchQuery() {
  if (route.name === "search") {
    return {
      query: currentQuery.value,
      assetTypes: handleRouteQueryArray(route.query.asset_types),
      searchScope:
        (route.query.search_scope as string) ?? Object.keys(searchScopeOptions.value)[0],
      exactMatch: route.query.exact_match === "true",
    }
  }

  return {
    query: currentQuery.value,
    assetTypes: (assetTypes.value ?? [])
      .filter((assetType) => assetType.includeInSearchByDefault)
      .map((assetType) => assetType.id),
    searchScope: "all",
    exactMatch: false,
  }
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

const isExactSearchSelectOpen = ref(false)
function setExactMatch(enabled: boolean) {
  const newValue = { ...searchQuery.value, exactMatch: enabled }
  if (newValue.exactMatch && Array.isArray(newValue.query)) {
    newValue.query = [...newValue.query, searchQueryValue.value]
      .filter((v) => v)
      .join(" ")
  } else if (!newValue.exactMatch && !Array.isArray(newValue.query)) {
    newValue.query = parseQueryParts(newValue.query)
  }
  searchQuery.value = newValue
  isExactSearchSelectOpen.value = false
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

const exactSearchSelect = ref<HTMLElement | null>(null)
const assetTypeSelect = ref<HTMLElement | null>(null)
const searchScopeSelect = ref<HTMLElement | null>(null)
function handleDocumentClick(event: Event) {
  const target = event.target as HTMLDivElement
  if (exactSearchSelect.value && !isContainingElement(exactSearchSelect.value, target)) {
    isExactSearchSelectOpen.value = false
  }
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

onMounted(() => {
  document.addEventListener("click", handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick)
})
</script>

<template>
  <div class="dashboard-layout-search-bar__container relative flex items-center">
    <button type="button"
      class="bg-neutral-100 py-3.5 pr-4 pl-3 max-w-80 flex items-center border-none cursor-pointer transition duration-200 ease-in-out ring-2 ring-transparent hover:ring-neutral-500 focus:ring-neutral-500 outline-none group"
      @click="isModalOpen = true" title="Click to open search box">
      <Search class="w-7 h-7 search-bar__style text-neutral-400 group-hover:text-neutral-600 mr-[0.5em]" />
      <div
        class="search-bar__style flex items-center w-[480px] text-neutral-400 text-sm h-[17px] overflow-hidden whitespace-nowrap group-hover:text-neutral-600 leading-none">
        {{
          (Array.isArray(currentQuery) ? currentQuery.join(", ") : currentQuery) ||
          "Search by references or file names..."
        }}
      </div>
    </button>
    <div class="absolute right-4 flex items-center justify-center" @click.prevent="router.push({ name: 'search' })">
      <SlidersHorizontal class="cursor-pointer text-neutral-500 hover:text-neutral-800" width="18" />
    </div>
  </div>
  <modal v-if="isModalOpen" @close="isModalOpen = false">
    <div class="search-bar__modal">
      <button type="button" @click="isModalOpen = false" class="search-bar__modal-close">
        <X class="w-5 h-5 text-neutral-500 hover:text-neutral-800" />
      </button>
      <div class="search-bar__modal-title">
        <Quote class="w-5 h-5 text-transparent fill-neutral-500" />
        <div>I</div>
        <div class="search-bar__modal-select" ref="exactSearchSelect">
          <button class="search-bar__modal-select-control" @click="isExactSearchSelectOpen = !isExactSearchSelectOpen">
            <div
              class="font-medium text-base min-w-[200px] p-[0.1em_0.1em_0.1em_0.3em] max-w-[260px] truncate overflow-clip cursor-pointer">
              {{
                searchQuery.exactMatch
                  ? "search an exact term in"
                  : "search multiple references of"
              }}
            </div>
            <ChevronDown />
          </button>
          <div v-if="isExactSearchSelectOpen" class="search-bar__modal-select-content">
            <button class="search-bar__modal-select-option" @click="setExactMatch(false)">
              search multiple references
            </button>
            <button class="search-bar__modal-select-option" @click="setExactMatch(true)">
              search an exact term
            </button>
          </div>
        </div>
        <div class="search-bar__modal-select" ref="assetTypeSelect">
          <button class="search-bar__modal-select-control" @click="isAssetTypeSelectOpen = !isAssetTypeSelectOpen">
            <div
              class="font-medium text-base min-w-[200px] p-[0.1em_0.1em_0.1em_0.3em] max-w-[260px] truncate overflow-clip cursor-pointer">
              {{ selectedAssetTypes.length ? selectedAssetTypes.map((assetType) => assetType!.name).join(', ') : 'any
              asset type' }}
            </div>
            <ChevronDown />
          </button>
          <div v-if="isAssetTypeSelectOpen" class="search-bar__modal-select-content">
            <button v-for="assetType in assetTypes" :key="assetType.id" class="search-bar__modal-select-option"
              @click="toggleAssetType(assetType)">
              <SquareCheck v-if="searchQuery.assetTypes.includes(assetType.id)" />
              <Square v-else />
              {{ assetType.name }}
            </button>
          </div>
        </div>
        <div>in</div>
        <div class="search-bar__modal-select" ref="searchScopeSelect">
          <button class="search-bar__modal-select-control" @click="isSearchScopeSelectOpen = !isSearchScopeSelectOpen">
            <div
              class="font-medium text-base min-w-[200px] p-[0.1em_0.1em_0.1em_0.3em] max-w-[260px] truncate overflow-clip cursor-pointer">
              {{ (searchScopeOptions as any)[searchQuery.searchScope] ?? 'all' }}
            </div>
            <ChevronDown />
          </button>
          <div v-if="isSearchScopeSelectOpen" class="search-bar__modal-select-content">
            <button v-for="[value, name] in Object.entries(searchScopeOptions)" :key="value"
              class="search-bar__modal-select-option" @click="setSearchScope(value)">
              {{ name }}
            </button>
          </div>
        </div>
      </div>
      <div class="search-bar__modal-query">
        <template v-if="Array.isArray(searchQuery.query)">
          <button v-for="(element, index) in searchQuery.query" :key="index"
            class="tags flex items-center bg-neutral-50 text-neutral-500 font-medium ring-2 ring-neutral-200 hover:ring-neutral-300 text-base px-[0.2em] py-0.5 max-w-[260px] overflow-clip cursor-pointer whitespace-nowrap"
            @click="editingIndex === index ? null : (editingIndex = index)" @dblclick="startEditing(index)">
            <div v-if="editingIndex !== index" class="text-sm pl-[0.5em] pr-[0.2em]">
              {{ element }}
            </div>
            <input v-else :id="`edit-input-${index}`" :value="element"
              class="text-sm pl-[0.5em] pr-[0.2em] bg-transparent border-none outline-none"
              @blur="saveEdit(index, $event.target.value)" @keyup.enter="saveEdit(index, $event.target.value)" />
            <button type="button" @click.stop="removeQueryPart(index)">
              <X class="w-4 h-4 text-neutral-600 hover:text-red-400 ml-1" />
            </button>
          </button>
          <input class="search-bar__modal-query-input" type="text"
            placeholder="Paste multiple product references or files separated by spaces." @keydown="handleKeydown"
            @paste="handlePaste" v-model="searchQueryValue" ref="searchInput" />
        </template>
        <input v-else class="search-bar__modal-query-input" type="text"
          placeholder="Search for a reference or a file name" ref="searchInput" :value="searchQuery.query"
          @input="searchQuery = { ...searchQuery, query: ($event.target as HTMLInputElement).value }" />
      </div>
      <div class="search-bar__modal-actions">
        <div v-if="filesNotFoundEnabled && filesNotFound.data?.value?.length" class="search-bar__modal-missing-items">
          <div>No file found for those items:</div>
          <div>{{ filesNotFound.data.value.join(", ") }}</div>
        </div>
        <Button type="button" @click="search" class="px-10 py-5">Search</Button>
        <Button type="button" variant="ghost"
          class="bg-transparent text-neutral-500 hover:bg-transparent hover:text-red-500 text-sm p-0 mt-1.5"
          @click="resetSearch">
          Clear search
        </Button>
      </div>
    </div>
  </modal>
</template>

<style scoped lang="scss">
.search-bar__style {
  @apply transition-colors duration-200 ease-in-out;
}

.search-bar__button {
  background: var(--primary-color95);
  padding: 0.875rem 1rem 0.875rem 2.75rem;
  max-width: 20rem;
  display: flex;
  align-items: center;
  border: none;
  cursor: pointer;
  outline: 2px solid transparent;
  transition: outline 0.2s ease-in-out;

  &:hover {
    outline: 2px solid var(--primary-color65);
  }
}

.search-bar__modal {
  width: 100vw;
  max-width: 960px;
}

.search-bar__modal-close {
  display: block;
  margin-left: auto;
  margin-bottom: 12px;
  border: none;
  cursor: pointer;
  background: transparent;
}

.search-bar__modal-title {
  display: flex;
  justify-content: center;
  align-items: center;
  white-space: nowrap;
  gap: 8px;
  color: var(--primary-color50);
  font-weight: 500;
  font-size: 20px;
  margin-bottom: 19px;
}

.search-bar__modal-select {
  position: relative;

  &:hover {
    @apply ring-2 ring-neutral-400;
  }
}

.search-bar__modal-select-control {
  @apply bg-neutral-50;

  padding: 4px;
  text-align: left;
  border: none;
  display: flex;
  color: #929292;
  align-items: center;
  justify-content: space-between;
}

.search-bar__modal-select-content {
  @apply bg-neutral-50;

  display: flex;
  flex-direction: column;
  gap: 0.3em;
  z-index: 20;
  position: absolute;
  margin-top: -4px;
  width: 100%;
  padding: 0.6em 0.5em;
  box-shadow: 0 8px 8px rgba(0, 0, 0, 0.1);
}

.search-bar__modal-select-option {
  @apply flex text-base items-center p-[0.2em] border-none text-neutral-500 hover:bg-neutral-100 bg-transparent cursor-pointer;
}

.search-bar__modal-select-option:last-child {
  margin-bottom: 0;
}

.search-bar__modal-select-option>svg {
  @apply mr-2;
  pointer-events: none;
}

.search-bar__modal-query {
  @apply bg-neutral-100;

  display: flex;
  flex-wrap: wrap;
  padding: 12px;
  gap: 8px;
  max-height: 300px;
  overflow-x: auto;
  outline: 2px solid transparent;
  transition: outline 0.2s ease-in-out;

  &:hover {
    @apply outline-2 outline-neutral-400;
  }

  &:focus-within {
    @apply outline-2 outline-neutral-400;
  }
}

.search-bar__modal-query-input {
  flex: 1;
  min-width: 120px;
  padding: 3px 0;
  background: transparent;
  border: none;
  font-weight: 500;
  font-size: 15px;
}

.search-bar__modal-query-input::placeholder {
  @apply text-neutral-400 text-sm font-normal;
}

.search-bar__modal-query-input:focus {
  outline: none;
}

.search-bar__modal-actions {
  margin: 16px 0;
  gap: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.search-bar__modal-missing-items {
  text-align: center;
  color: #929292;
  font-size: 14px;
  margin-bottom: 8px;
}

.tags:focus-within {
  @apply ring-neutral-400;
}
</style>
