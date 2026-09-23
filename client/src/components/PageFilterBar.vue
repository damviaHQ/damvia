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
  NAME_FILTER_KEY,
  type FilterableCollection,
  type FilterableFile,
  type PageFacets,
} from "@/utils/pageFilter"
import { ChevronDown, Search, X } from "@lucide/vue"
import { computed } from "vue"

const props = withDefaults(defineProps<{
  files?: FilterableFile[]
  collections?: DisplayCollection[]
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

// Only what the reader put on the bar from the funnel: showing every facet at
// once was a wall of controls on a page that already has plenty.
const showName = computed(() => store.pageFilters.includes(NAME_FILTER_KEY))
const groups = computed(() => availableGroups(filter.state.value, facets.value, props.showSingleValues)
  .filter((group) => store.pageFilters.includes(group.key))
  .map((group) => ({ ...group, id: group.key.replace(":", "-") })))
const isEmpty = computed(() => !showName.value && !groups.value.length)

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
  <div v-if="!isEmpty" class="page-filter-bar mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-200 pb-3" role="search" aria-label="Filter this page">
    <div v-if="showName" class="relative flex items-center">
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
    <Popover v-for="group in groups" :key="group.id">
      <PopoverTrigger as-child>
        <button type="button" class="sort-pill" :aria-label="`${group.title}, ${triggerLabel(group.selected, group.options)}`">
          <span class="border-r border-neutral-200 pr-2 text-neutral-500">{{ group.title }}</span>
          <span class="max-w-40 truncate" :class="group.selected.length ? 'font-medium' : ''">{{ triggerLabel(group.selected, group.options) }}</span>
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
    <p :class="showSummary ? 'ml-auto text-caption tabular-nums text-[color:var(--dv-text-secondary)]' : 'sr-only'" aria-live="polite">{{ summaryLabel }}</p>
  </div>
</template>
