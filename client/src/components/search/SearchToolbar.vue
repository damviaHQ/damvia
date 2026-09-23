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
import FilterChipList from "@/components/FilterChipList.vue"
import SearchFormatPicker, { type FormatOption } from "@/components/search/SearchFormatPicker.vue"
import SearchSizeRange from "@/components/search/SearchSizeRange.vue"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FILE_TYPE_OPTIONS, type SearchSort } from "@/utils/searchQuery"
import { ArrowDownWideNarrow, Files } from "@lucide/vue"
import { computed } from "vue"

// The chip shape is shared with the page filter, which draws the same pills.
export type { FilterChip } from "@/utils/pageFilter"
import type { FilterChip } from "@/utils/pageFilter"

const props = defineProps<{
  fileTypeCounts: Record<string, number>
  fileTypes: string[]
  sort: SearchSort | undefined
  hasQuery: boolean
  chips: FilterChip[]
  formats: FormatOption[]
  selectedFormats: string[]
  minSize: number | undefined
  maxSize: number | undefined
}>()
const emit = defineEmits<{
  "update:fileTypes": [fileTypes: string[]]
  "update:sort": [sort: SearchSort]
  removeChip: [chip: FilterChip]
  toggleFormat: [id: string]
  clearFormats: []
  applySize: [range: { min: string, max: string }]
  clearFilters: []
}>()

const allCount = computed(() => Object.values(props.fileTypeCounts).reduce((sum, count) => sum + count, 0))
const segments = computed(() => [
  { id: "", label: "All files", count: allCount.value },
  ...FILE_TYPE_OPTIONS.map((option) => ({ id: option.id, label: option.label, count: props.fileTypeCounts[option.id] ?? 0 })),
])
const activeSegment = computed(() => props.fileTypes.length === 1 ? props.fileTypes[0] : props.fileTypes.length ? "mixed" : "")
const sortOptions = computed(() => [
  ...(props.hasQuery ? [{ id: "relevance", label: "Best match" }] : []),
  { id: "name", label: "Name A to Z" },
  { id: "newest", label: "Recently updated" },
])
const fileTypeValue = computed(() => props.fileTypes.length === 1 ? props.fileTypes[0] : "all")
const fileTypeLabel = computed(() => segments.value.find((segment) => (segment.id || "all") === fileTypeValue.value)?.label ?? "All files")

const currentSort = computed(() => props.sort ?? (props.hasQuery ? "relevance" : "name"))
</script>

<template>
  <div class="search-toolbar flex flex-wrap items-center gap-x-3 gap-y-2">
    <div class="flex items-center">
      <Select :model-value="fileTypeValue" @update:model-value="emit('update:fileTypes', $event === 'all' ? [] : [$event as string])">
        <SelectTrigger id="search-file-type" aria-label="File type" class="sort-pill">
          <Files class="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
          <span class="border-r border-neutral-200 pr-2 text-neutral-500">Show</span>
          <span class="truncate">{{ fileTypeLabel }}</span>
        </SelectTrigger>
        <SelectContent class="rounded-xl">
          <SelectItem v-for="segment in segments" :key="segment.id || 'all'" :value="segment.id || 'all'" :disabled="segment.count === 0 && activeSegment !== segment.id">
            <span class="flex w-full items-center gap-3">
              <span class="flex-1">{{ segment.label }}</span>
              <span class="text-caption tabular-nums text-[color:var(--dv-text-secondary)]">{{ segment.count }}</span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex items-center">
      <Select :model-value="currentSort" @update:model-value="emit('update:sort', $event as SearchSort)">
        <SelectTrigger id="search-sort" aria-label="Sort results" class="sort-pill">
          <ArrowDownWideNarrow class="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
          <span class="border-r border-neutral-200 pr-2 text-neutral-500">Sort</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent class="rounded-xl">
          <SelectItem v-for="option in sortOptions" :key="option.id" :value="option.id">{{ option.label }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <SearchFormatPicker :options="formats" :selected="selectedFormats" @toggle="emit('toggleFormat', $event)" @clear="emit('clearFormats')" />
    <SearchSizeRange :min-size="minSize" :max-size="maxSize" @apply="emit('applySize', $event)" />
    <FilterChipList :chips="chips" @remove="emit('removeChip', $event)" @clear="emit('clearFilters')" />
  </div>
</template>

