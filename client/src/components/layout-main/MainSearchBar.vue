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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { PopoverContent, Popover } from "@/components/ui/popover"
import { RouterOutput, trpc } from "@/services/server.ts"
import { clearRecentSearches, listRecentSearches, rememberSearch, type RecentSearch } from "@/utils/recentSearches"
import { parseQueryParts, queryValueToArray, queryValueToString, toSearchScope, type SearchScope } from "@/utils/searchQuery"
import { useQuery } from "@tanstack/vue-query"
import { ChevronDown, History, Search, SlidersHorizontal, X } from "lucide-vue-next"
import { PopoverAnchor } from "reka-ui"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { LocationQuery, useRoute, useRouter } from "vue-router"

const sentenceChoiceClasses = 'flex min-h-9 max-w-full cursor-pointer items-center justify-between gap-2 bg-neutral-50 px-2 py-1 text-left text-base font-medium text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const LOCAL_STORAGE_SEARCH_OPTIONS_KEY = 'damvia_search_options'

const router = useRouter()
const route = useRoute()
const { data: assetTypes } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})

const currentCollectionId = computed(() => {
  if (route.name === "search") {
    return queryValueToString(route.query.from_collection) ?? null
  } else if (route.name === "collection") {
    return route.params.id as string
  }
  return null
})
const searchScopeOptions = computed(() => {
  const globalOptions = { all: "all files and collections" }
  const collectionOptions = {
    current_with_sub: "current and sub collections",
    current: "current collection",
  }
  return currentCollectionId.value ? { ...collectionOptions, ...globalOptions } : globalOptions
})
const defaultSearchScope = () => Object.keys(searchScopeOptions.value)[0] as SearchScope

type SearchOptions = { assetTypes: string[]; searchScope: SearchScope; exactMatch: boolean }

// Storage is untrusted: anything that is not the expected shape falls back to the defaults.
function readStoredOptions(): SearchOptions | null {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SEARCH_OPTIONS_KEY) ?? 'null')
    if (!stored || !Array.isArray(stored.assetTypes)) {
      return null
    }
    return {
      assetTypes: stored.assetTypes.filter((id: unknown) => typeof id === 'string'),
      searchScope: toSearchScope(stored.searchScope) ?? 'all',
      exactMatch: stored.exactMatch === true,
    }
  } catch (_) {
    return null
  }
}

function defaultOptions(): SearchOptions {
  return {
    assetTypes: (assetTypes.value ?? [])
      .filter((assetType: any) => assetType.includeInSearchByDefault)
      .map((assetType: any) => assetType.id),
    searchScope: defaultSearchScope(),
    exactMatch: false,
  }
}

// On the results page the bar mirrors the URL; elsewhere it starts from the remembered options.
function initialOptions(): SearchOptions {
  if (route.name === "search") {
    return {
      assetTypes: queryValueToArray(route.query.asset_types),
      searchScope: toSearchScope(queryValueToString(route.query.search_scope)) ?? defaultSearchScope(),
      exactMatch: route.query.exact_match === "true",
    }
  }
  return readStoredOptions() ?? defaultOptions()
}

const options = ref<SearchOptions>(initialOptions())
const text = ref(route.name === "search" ? (queryValueToString(route.query.q) ?? "") : "")
const hasStoredOptions = ref(!!readStoredOptions())
const recent = ref<RecentSearch[]>(listRecentSearches())
const isOpen = ref(false)
const input = ref<HTMLInputElement | null>(null)
const anchor = ref<HTMLElement | null>(null)

watch(() => assetTypes.value, () => { options.value = initialOptions() })
watch(() => route.query, () => {
  if (route.name === "search") {
    options.value = initialOptions()
    text.value = queryValueToString(route.query.q) ?? ""
  }
})

const selectedAssetTypes = computed(() =>
  options.value.assetTypes
    .map((id) => assetTypes.value?.find((assetType) => assetType.id === id))
    .filter((assetType) => assetType)
)
const isAssetTypeSelectOpen = ref(false)
const isSearchScopeSelectOpen = ref(false)
const assetTypeSelect = ref<HTMLElement | null>(null)
const searchScopeSelect = ref<HTMLElement | null>(null)
const assetTypeToggle = ref<HTMLElement | null>(null)
const searchScopeToggle = ref<HTMLElement | null>(null)

function toggleAssetType(assetType: RouterOutput["assetType"]["list"][number]) {
  options.value = {
    ...options.value,
    assetTypes: options.value.assetTypes.includes(assetType.id)
      ? options.value.assetTypes.filter((id) => id !== assetType.id)
      : [...options.value.assetTypes, assetType.id],
  }
}
function setSearchScope(searchScope: SearchScope) {
  options.value = { ...options.value, searchScope }
  isSearchScopeSelectOpen.value = false
}
function setExactMatch(exactMatch: boolean) {
  options.value = { ...options.value, exactMatch }
}
function closeAssetTypeSelect(event: KeyboardEvent) {
  if (!isAssetTypeSelectOpen.value) return
  event.stopPropagation()
  isAssetTypeSelectOpen.value = false
  assetTypeToggle.value?.focus()
}
function closeSearchScopeSelect(event: KeyboardEvent) {
  if (!isSearchScopeSelectOpen.value) return
  event.stopPropagation()
  isSearchScopeSelectOpen.value = false
  searchScopeToggle.value?.focus()
}
function handleDocumentClick(event: Event) {
  const target = event.target as Node
  if (assetTypeSelect.value && !assetTypeSelect.value.contains(target)) {
    isAssetTypeSelectOpen.value = false
  }
  if (searchScopeSelect.value && !searchScopeSelect.value.contains(target)) {
    isSearchScopeSelectOpen.value = false
  }
}
onMounted(() => document.addEventListener("click", handleDocumentClick))
onUnmounted(() => document.removeEventListener("click", handleDocumentClick))

function open() {
  isOpen.value = true
}
function close() {
  isOpen.value = false
  isAssetTypeSelectOpen.value = false
  isSearchScopeSelectOpen.value = false
}
// Clicks on the input itself must not count as clicking outside the popover.
function handleInteractOutside(event: CustomEvent) {
  const target = (event.detail as any)?.originalEvent?.target as Node | undefined
  if (target && anchor.value?.contains(target)) {
    event.preventDefault()
    return
  }
  close()
}

function search(value = text.value) {
  const query = options.value.exactMatch ? value.trim() : parseQueryParts(value).join(" ")
  let routeQuery: LocationQuery = {}
  if (route.name === "search") {
    routeQuery = { ...route.query }
    delete routeQuery.page
  } else if (route.name === "collection") {
    routeQuery.from_collection = route.params.id as string
  }
  routeQuery.q = query
  routeQuery.asset_types = options.value.assetTypes
  routeQuery.search_scope = options.value.searchScope
  if (options.value.exactMatch) {
    routeQuery.exact_match = "true"
  } else {
    delete routeQuery.exact_match
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_SEARCH_OPTIONS_KEY, JSON.stringify(options.value))
    hasStoredOptions.value = true
  } catch (_) { /* storage unavailable */ }
  recent.value = rememberSearch({ query, exactMatch: options.value.exactMatch })
  text.value = query
  close()
  input.value?.blur()
  router.push({ name: "search", query: routeQuery })
}

function useRecent(entry: RecentSearch) {
  options.value = { ...options.value, exactMatch: entry.exactMatch }
  search(entry.query)
}
function forgetRecent() {
  clearRecentSearches()
  recent.value = []
}
function resetOptions() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_SEARCH_OPTIONS_KEY)
  } catch (_) { /* storage unavailable */ }
  hasStoredOptions.value = false
  options.value = defaultOptions()
}
function clearText() {
  text.value = ""
  input.value?.focus()
}
</script>

<template>
  <div class="dashboard-layout-search-bar__container relative flex min-w-0 items-center gap-1">
    <Popover :open="isOpen">
      <PopoverAnchor as-child>
        <form ref="anchor" role="search" class="group flex h-10 min-w-0 items-center gap-2.5 border border-neutral-200 bg-neutral-50 px-3 transition-colors focus-within:border-neutral-400 focus-within:bg-white hover:border-neutral-300 md:w-[360px]" @submit.prevent="search()">
          <Search class="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
          <input ref="input" v-model="text" type="search" name="q" aria-label="Search assets" placeholder="Search files or references" autocomplete="off" enterkeyhint="search" class="h-full min-w-0 flex-1 bg-transparent text-[length:var(--dv-field-label-size)] text-neutral-900 outline-hidden placeholder:text-[color:var(--dv-text-secondary)] [&::-webkit-search-cancel-button]:hidden max-md:w-9" :aria-expanded="isOpen" @focus="open" @click="open" @keydown.esc.prevent="close(); input?.blur()" />
          <button v-if="text" type="button" aria-label="Clear search text" class="grid size-6 cursor-pointer place-items-center text-neutral-500 hover:text-neutral-900" @click="clearText"><X class="size-4" aria-hidden="true" /></button>
        </form>
      </PopoverAnchor>
      <PopoverContent data-search-options align="start" :side-offset="6" class="client-search-popover w-[min(720px,calc(100vw-24px))] p-4" @open-auto-focus.prevent @close-auto-focus.prevent @interact-outside="handleInteractOutside" @escape-key-down="close">
        <div class="flex flex-wrap items-center gap-2 text-base font-medium text-neutral-600" data-search-sentence>
          <span>I</span>
          <div class="relative min-w-0">
            <Label for="search-mode" class="sr-only">Search mode</Label>
            <button id="search-mode" type="button" aria-label="Search mode" :aria-pressed="options.exactMatch" :title="options.exactMatch ? 'Switch to multiple references' : 'Switch to an exact term'" :class="sentenceChoiceClasses" @click="setExactMatch(!options.exactMatch)">
              <span class="min-w-0 max-w-[300px] truncate">{{ options.exactMatch ? "search an exact term in" : "search multiple references of" }}</span>
            </button>
          </div>
          <div ref="assetTypeSelect" class="relative min-w-0" @keydown.esc="closeAssetTypeSelect">
            <Label for="search-asset-types" class="sr-only">Asset types</Label>
            <button id="search-asset-types" ref="assetTypeToggle" type="button" aria-label="Asset types" :aria-expanded="isAssetTypeSelectOpen" aria-controls="search-asset-types-options" :class="sentenceChoiceClasses" @click="isAssetTypeSelectOpen = !isAssetTypeSelectOpen">
              <span class="min-w-0 max-w-[300px] truncate">{{ selectedAssetTypes.length ? selectedAssetTypes.map((assetType) => assetType!.name).join(', ') : 'any asset type' }}</span>
              <ChevronDown class="size-4 shrink-0" aria-hidden="true" />
            </button>
            <div v-if="isAssetTypeSelectOpen" id="search-asset-types-options" class="absolute z-20 mt-1 flex min-w-full flex-col gap-1 border border-input bg-white p-1 shadow-md">
              <label v-for="assetType in assetTypes" :key="assetType.id" class="flex cursor-pointer items-center gap-2 px-2 py-2 text-body text-foreground hover:bg-neutral-100">
                <Checkbox :model-value="options.assetTypes.includes(assetType.id)" :aria-label="assetType.name" @update:model-value="toggleAssetType(assetType)" />
                <span class="whitespace-nowrap">{{ assetType.name }}</span>
              </label>
            </div>
          </div>
          <span>in</span>
          <div ref="searchScopeSelect" class="relative min-w-0" @keydown.esc="closeSearchScopeSelect">
            <Label for="search-scope" class="sr-only">Search scope</Label>
            <button id="search-scope" ref="searchScopeToggle" type="button" aria-label="Search scope" :aria-expanded="isSearchScopeSelectOpen" aria-controls="search-scope-options" :class="sentenceChoiceClasses" @click="isSearchScopeSelectOpen = !isSearchScopeSelectOpen">
              <span class="min-w-0 max-w-[300px] truncate">{{ (searchScopeOptions as any)[options.searchScope] ?? 'all files and collections' }}</span>
              <ChevronDown class="size-4 shrink-0" aria-hidden="true" />
            </button>
            <div v-if="isSearchScopeSelectOpen" id="search-scope-options" class="absolute z-20 mt-1 flex min-w-full flex-col gap-1 border border-input bg-white p-1 shadow-md">
              <button v-for="[value, name] in Object.entries(searchScopeOptions)" :key="value" type="button" class="flex cursor-pointer items-center whitespace-nowrap px-2 py-2 text-body text-neutral-700 hover:bg-neutral-100" @click="setSearchScope(value as SearchScope)">{{ name }}</button>
            </div>
          </div>
        </div>

        <div v-if="recent.length" class="mt-4 border-t border-neutral-200 pt-3">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-caption font-semibold uppercase tracking-[.08em] text-neutral-500">Recent searches</span>
            <button type="button" class="cursor-pointer text-caption text-neutral-500 hover:text-neutral-900" @click="forgetRecent">Clear</button>
          </div>
          <ul class="grid gap-px">
            <li v-for="entry in recent" :key="`${entry.exactMatch}-${entry.query}`">
              <button type="button" class="flex h-8 w-full cursor-pointer items-center gap-2 px-2 text-left text-body text-neutral-800 hover:bg-neutral-100" @click="useRecent(entry)">
                <History class="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ entry.query }}</span>
                <span v-if="entry.exactMatch" class="text-caption text-[color:var(--dv-text-secondary)]">exact</span>
              </button>
            </li>
          </ul>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3">
          <p class="text-caption text-[color:var(--dv-text-secondary)]">
            <template v-if="options.exactMatch">Press Enter to find that exact text.</template>
            <template v-else>Paste several references separated by spaces, then press Enter.</template>
          </p>
          <div class="flex items-center gap-3">
            <button v-if="hasStoredOptions" type="button" class="cursor-pointer text-caption text-neutral-500 hover:text-red-600" @click="resetOptions">Reset to default</button>
            <Button type="button" class="px-6" @click="search()">Search</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    <button v-if="route.name !== 'search'" type="button" aria-label="Search filters" title="Open the search page with filters" class="search-filter-trigger flex size-9 cursor-pointer items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" @click.prevent="search('')">
      <SlidersHorizontal class="size-[18px]" aria-hidden="true" />
    </button>
  </div>
</template>
