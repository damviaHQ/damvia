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
import PageFilterToggle from "@/components/PageFilterToggle.vue"
import SearchFacetGroup from "@/components/search/SearchFacetGroup.vue"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePageFilter } from "@/composables/usePageFilter"
import { useGlobalStore } from "@/stores/globalStore"
import type { DisplayCollection } from "@/utils/displayPreferences"
import {
  availableGroups,
  fileFacets,
  matchesCollection,
  matchesFile,
  type FilterableCollection,
  type FilterableFile,
  type PageFacets,
} from "@/utils/pageFilter"
import { ChevronDown, Search, X } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const props = withDefaults(defineProps<{
  files?: FilterableFile[]
  collections?: DisplayCollection[]
  restricted?: boolean
  showSummary?: boolean
  showSingleValues?: boolean
  facets?: PageFacets
  total?: number
  shown?: number
}>(), { files: () => [], collections: () => [], showSummary: true })

const filter = usePageFilter()
const store = useGlobalStore()

// The facets describe the whole page, never the narrowed result: counting the
// filtered set would take away every value the reader has not picked yet.
const files = computed(() => props.files as unknown as FilterableFile[])
const collections = computed(() => props.collections as unknown as FilterableCollection[])
const facets = computed(() => props.facets ?? fileFacets(files.value, filter.state.value))

const available = computed(() => availableGroups(filter.state.value, facets.value, props.showSingleValues))
const groups = computed(() => available.value
  .filter((group) => store.pageFilters.includes(group.key))
  .map((group) => ({ ...group, id: group.key.replace(":", "-") })))
const hasContent = computed(() => filter.isActive.value || (props.total !== undefined ? props.total > 0 : files.value.length > 0))
const saved = ref(false)
watch(() => [...store.pageFilters], () => { saved.value = false })
function remove(key: string) {
  filter.clearDimension(key)
  store.togglePageFilter(key)
}
function save() {
  try {
    store.savePageFilters()
    saved.value = true
    saveError.value = ""
  } catch {
    saveError.value = "Could not save filters in this browser."
  }
}
const saveError = ref("")

const total = computed(() => props.total ?? files.value.length + collections.value.length)
const shown = computed(() => props.shown ?? (
  files.value.filter((file) => matchesFile(file, filter.state.value)).length +
  collections.value.filter((collection) => matchesCollection(collection, filter.state.value)).length
))
const summaryLabel = computed(() => {
  if (!filter.isActive.value) return `${total.value} ${total.value === 1 ? "item" : "items"}`
  return `${shown.value} of ${total.value} ${total.value === 1 ? "item" : "items"}`
})
const triggerLabel = (selected: string[], options: { id: string, label: string }[]) => selected.length
  ? selected.map((value) => options.find((option) => option.id === value)?.label ?? value).join(", ")
  : "Any"
</script>

<template>
  <div v-if="hasContent" class="page-filter-bar mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 border-b border-neutral-200 pb-3" role="search" aria-label="Filter this page" :title="restricted ? 'Hidden for some people' : undefined">
    <div class="relative flex items-center">
      <Search class="pointer-events-none absolute left-3 size-3.5 text-neutral-500" aria-hidden="true" />
      <input
        id="page-filter-name"
        :value="filter.state.value.name"
        type="text"
        aria-label="Filter by name"
        placeholder="Filter by name"
        class="h-[29px] w-56 rounded-full border border-neutral-200 bg-white pl-8 pr-8 text-[12px] text-neutral-900 placeholder:text-[color:var(--dv-text-secondary)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        @input="filter.setName(($event.target as HTMLInputElement).value)"
        @keydown.esc.prevent="filter.setName('')"
      >
      <button
        v-if="filter.state.value.name"
        type="button"
        class="absolute right-2 grid size-5 cursor-pointer place-items-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
        aria-label="Clear the name filter"
        @click="filter.setName('')"
      >
        <X class="size-3.5" aria-hidden="true" />
      </button>
    </div>
    <div v-for="group in groups" :key="group.id" class="flex max-w-full items-center rounded-full border border-neutral-200 bg-white">
    <Popover>
      <PopoverTrigger as-child>
        <button type="button" class="sort-pill min-w-0 !gap-1.5 !rounded-l-full !rounded-r-none !border-0 !px-2" :aria-label="`${group.title}, ${triggerLabel(group.selected, group.options)}`">
          <span class="max-w-32 truncate border-r border-neutral-200 pr-1.5 text-neutral-500">{{ group.title }}</span>
          <span class="shrink-0 text-neutral-400">{{ group.selected.length > 1 ? 'is any of' : 'is' }}</span>
          <span class="max-w-28 truncate" :class="group.selected.length ? 'font-medium' : ''">{{ triggerLabel(group.selected, group.options) }}</span>
          <ChevronDown class="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="max-h-80 w-60 overflow-y-auto p-1">
        <SearchFacetGroup
          :id="`page-filter-${group.id}`"
          :title="group.title"
          :options="group.options"
          :selected="group.selected"
          :show-header="false"
          @toggle="filter.toggleValue(group.key, $event)"
        />
      </PopoverContent>
    </Popover>
    <button type="button" :aria-label="`Remove ${group.title} filter`" class="grid h-[29px] w-6 shrink-0 place-items-center rounded-r-full border-l border-neutral-200 text-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-ring" @click="remove(group.key)"><X class="size-3.5" aria-hidden="true" /></button>
    </div>
    <PageFilterToggle :groups="available" />
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <button type="button" class="px-1 text-xs text-neutral-600 hover:text-neutral-950 disabled:opacity-50" :disabled="!filter.isActive.value" @click="filter.clear()">Clear</button>
      <button v-if="store.pageFiltersChanged" type="button" class="sort-pill" title="Save the available filters as your defaults in this browser. Selected values are not saved." @click="save">Save</button>
      <span role="status" class="sr-only left-0">{{ saved ? 'Default filters saved. Selected values were not saved.' : '' }}</span>
    </div>
    <p v-if="saveError" role="alert" class="w-full text-xs text-red-600">{{ saveError }}</p>
    <p :class="showSummary ? 'ml-auto text-caption tabular-nums text-[color:var(--dv-text-secondary)]' : 'sr-only left-0'" aria-live="polite">{{ summaryLabel }}</p>
  </div>
</template>
