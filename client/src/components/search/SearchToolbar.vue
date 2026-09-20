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
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import SearchFormatPicker, { type FormatOption } from "@/components/search/SearchFormatPicker.vue"
import SearchSizeRange from "@/components/search/SearchSizeRange.vue"
import type { DisplayFile } from "@/utils/displayPreferences"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FILE_TYPE_OPTIONS, type SearchSort } from "@/utils/searchQuery"
import { ArrowDownWideNarrow, Files, X } from "@lucide/vue"
import { computed } from "vue"

export type FilterChip = { key: string, value: string, label: string, category?: string, displayValue?: string }

const props = defineProps<{
  files?: DisplayFile[]
  total: number
  terms: string[]
  scopeLabel: string
  fileTypeCounts: Record<string, number>
  fileTypes: string[]
  sort: SearchSort | undefined
  hasQuery: boolean
  chips: FilterChip[]
  selectedCount: number
  allSelected: boolean
  formats: FormatOption[]
  selectedFormats: string[]
  minSize: number | undefined
  maxSize: number | undefined
}>()
const emit = defineEmits<{
  "update:fileTypes": [fileTypes: string[]]
  "update:sort": [sort: SearchSort]
  removeChip: [chip: FilterChip]
  toggleSelection: []
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

// One pill per filter category: the name is stated once and each value is removed on its own.
const chipGroups = computed(() => {
  const groups = new Map<string, { key: string, category?: string, chips: FilterChip[] }>()
  for (const chip of props.chips) {
    const key = `${chip.key}::${chip.category ?? ""}`
    const group = groups.get(key)
    if (group) {
      group.chips.push(chip)
    } else {
      groups.set(key, { key, category: chip.category, chips: [chip] })
    }
  }
  return Array.from(groups.values())
})

const currentSort = computed(() => props.sort ?? (props.hasQuery ? "relevance" : "name"))
</script>

<template>
  <div class="search-toolbar sticky top-0 z-20 -mx-5 mb-5 grid gap-3 border-b border-neutral-200 bg-white px-5 pt-5 pb-3">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <CollectionCheckbox
        v-if="total"
        :label="allSelected ? 'Unselect all results' : 'Select all results'"
        :title="allSelected ? 'Unselect all results' : 'Select all results'"
        :state="allSelected ? 'check' : selectedCount > 0 ? 'undetermined' : false"
        @click="emit('toggleSelection')"
      />
      <button
        v-if="total"
        type="button"
        class="shrink-0 cursor-pointer bg-transparent p-0 text-body text-neutral-500 hover:text-neutral-900"
        @click="emit('toggleSelection')"
      >
        <template v-if="allSelected">Unselect all</template>
        <template v-else-if="selectedCount">{{ selectedCount }} item{{ selectedCount > 1 ? "s" : "" }} selected, select all</template>
        <template v-else>Select all</template>
      </button>
      <p class="min-w-0 flex-1 text-body text-neutral-800" aria-live="polite">
        <strong class="font-semibold text-neutral-950">{{ total }} {{ total === 1 ? "result" : "results" }}</strong>
        <template v-if="terms.length"> for <span class="font-medium">{{ terms.join(", ") }}</span></template>
        <span class="text-[color:var(--dv-text-secondary)]"> in {{ scopeLabel }}</span>
      </p>
      <DisplayPreferences :files="files" grouped />
    </div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
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
      <ul v-if="chips.length" class="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Active filters">
        <li v-for="group in chipGroups" :key="group.key" class="max-w-full">
          <div class="filter-pill">
            <span v-if="group.category" class="filter-category">{{ group.category }}</span>
            <span v-for="chip in group.chips" :key="chip.value" class="filter-chip">
              <span class="filter-value">{{ chip.displayValue ?? chip.label }}</span>
              <button type="button" class="filter-remove" :aria-label="`Remove filter ${chip.label}`" @click="emit('removeChip', chip)">
                <X class="size-3.5" aria-hidden="true" />
              </button>
            </span>
          </div>
        </li>
        <li v-if="chips.length > 1">
          <button type="button" class="h-7 cursor-pointer px-2 text-caption font-medium text-neutral-600 hover:text-neutral-950" @click="emit('clearFilters')">Clear all</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style>
.search-toolbar .filter-pill:hover { border-color: #a3a3a3; background: #fafafa; }
.search-toolbar .filter-pill:focus-within { border-color: #a3a3a3; }
.search-toolbar .sort-pill { display: flex; align-items: center; width: auto; height: 29px; min-height: 29px; gap: 7px; padding: 0 10px; border: 1px solid #e5e5e5; border-radius: 999px; background: white; box-shadow: none; font-size: 12px; }
.search-toolbar .filter-pill { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 7px; min-height: 29px; max-width: 100%; padding: 3px 6px 3px 11px; border: 1px solid #d4d4d4; border-radius: 999px; background: #fafafa; font-size: 12px; line-height: 18px; }
.search-toolbar .filter-category { padding-right: 7px; border-right: 1px solid #d4d4d4; color: #737373; white-space: nowrap; }
.search-toolbar .filter-chip { display: inline-flex; align-items: center; gap: 2px; padding: 0 1px 0 6px; border-radius: 999px; }
.search-toolbar .filter-chip:first-of-type { padding-left: 0; }
.search-toolbar .filter-chip:hover { background: #ededed; }
.search-toolbar .filter-value { color: #404040; font-weight: 500; overflow-wrap: anywhere; }
.search-toolbar .filter-remove { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; color: #737373; cursor: pointer; }
.search-toolbar .filter-remove:hover { background: #d4d4d4; color: #171717; }
.search-toolbar .filter-remove:focus-visible { outline: 2px solid #525252; outline-offset: 1px; }
.search-toolbar .filter-pill svg { flex-shrink: 0; }
</style>
