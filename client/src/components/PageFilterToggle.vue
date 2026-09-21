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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePageFilter } from "@/composables/usePageFilter"
import { useGlobalStore } from "@/stores/globalStore"
import type { DisplayFile } from "@/utils/displayPreferences"
import {
  availableGroups,
  fileFacets,
  groupValueCount,
  NAME_FILTER_KEY,
  pageFilterCount,
  type FilterableFile,
} from "@/utils/pageFilter"
import { Filter } from "@lucide/vue"
import { computed } from "vue"

const props = withDefaults(defineProps<{ files?: DisplayFile[] }>(), { files: () => [] })

const store = useGlobalStore()
const filter = usePageFilter()

const files = computed(() => props.files as unknown as FilterableFile[])
const facets = computed(() => fileFacets(files.value, filter.state.value))

// Every filter this page can offer. The name always can: it matches the files
// and the sub-collections alike, and it needs no values behind it.
const offered = computed(() => [
  { key: NAME_FILTER_KEY, title: "Name", detail: "Files and collections" },
  ...availableGroups(filter.state.value, facets.value).map((group) => ({
    key: group.key,
    title: group.title,
    detail: `${group.options.length} value${group.options.length === 1 ? "" : "s"}`,
  })),
])

const count = computed(() => pageFilterCount(filter.state.value))
const chosenCount = computed(() => offered.value.filter((item) => store.pageFilters.includes(item.key)).length)

// Switching a filter off takes its values with it, so the page cannot stay
// narrowed by something nobody can see any more.
function toggle(key: string) {
  if (store.pageFilters.includes(key)) {
    filter.clearDimension(key)
  }
  store.togglePageFilter(key)
}

function clearAll() {
  filter.clear()
  store.clearPageFilters()
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Filters"
        title="Choose the filters shown on this page"
        class="relative text-neutral-500 data-[state=open]:bg-neutral-100 data-[state=open]:text-neutral-950"
      >
        <Filter aria-hidden="true" />
        <span v-if="count" class="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-neutral-800 text-[10px] font-semibold tabular-nums text-white ring-2 ring-white">
          {{ count }}<span class="sr-only"> filters active</span>
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" :side-offset="8" :collision-padding="12" class="w-64 p-0" aria-label="Filters">
      <div class="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 class="text-[13px] font-semibold text-neutral-900">Filters</h2>
        <span class="text-[11px] text-neutral-500">Only for you</span>
      </div>
      <p class="px-4 pb-2 text-[11px] leading-4 text-neutral-500">Choose what to filter this page by. Only what is ticked appears above the content.</p>
      <ul class="flex flex-col pb-1">
        <li v-for="(item, index) in offered" :key="item.key">
          <label :for="`page-filter-choice-${index}`" class="flex min-h-8 w-full cursor-pointer items-center gap-2 px-4 py-1 text-body text-neutral-800 hover:bg-neutral-100">
            <Checkbox :id="`page-filter-choice-${index}`" :aria-label="item.title" :model-value="store.pageFilters.includes(item.key)" @update:model-value="toggle(item.key)" />
            <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
            <span v-if="groupValueCount(filter.state.value, item.key)" class="grid size-4 shrink-0 place-items-center rounded-full bg-neutral-800 text-[10px] font-semibold tabular-nums text-white">
              {{ groupValueCount(filter.state.value, item.key) }}<span class="sr-only"> values in use</span>
            </span>
            <span v-else class="shrink-0 text-caption text-[color:var(--dv-text-secondary)]">{{ item.detail }}</span>
          </label>
        </li>
      </ul>
      <p v-if="offered.length === 1" class="px-4 pb-2 text-[11px] leading-4 text-neutral-500">This page holds nothing else to filter by.</p>
      <button
        v-if="chosenCount || count"
        type="button"
        class="h-8 w-full cursor-pointer border-t border-neutral-200 px-4 text-left text-caption font-medium text-neutral-600 hover:text-neutral-950"
        @click="clearAll"
      >
        Remove all filters
      </button>
    </PopoverContent>
  </Popover>
</template>
