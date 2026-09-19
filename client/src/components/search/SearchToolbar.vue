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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FILE_TYPE_OPTIONS, type SearchSort } from "@/utils/searchQuery"
import { LayoutDashboard, X } from "lucide-vue-next"
import { computed } from "vue"

export type FilterChip = { key: string, value: string, label: string }

const props = defineProps<{
  total: number
  terms: string[]
  scopeLabel: string
  fileTypeCounts: Record<string, number>
  fileTypes: string[]
  sort: SearchSort | undefined
  hasQuery: boolean
  chips: FilterChip[]
}>()
const emit = defineEmits<{
  "update:fileTypes": [fileTypes: string[]]
  "update:sort": [sort: SearchSort]
  removeChip: [chip: FilterChip]
  clearFilters: []
  openDisplayPreferences: []
}>()

const allCount = computed(() => Object.values(props.fileTypeCounts).reduce((sum, count) => sum + count, 0))
const segments = computed(() => [
  { id: "", label: "All", count: allCount.value },
  ...FILE_TYPE_OPTIONS.map((option) => ({ id: option.id, label: option.label, count: props.fileTypeCounts[option.id] ?? 0 })),
])
const activeSegment = computed(() => props.fileTypes.length === 1 ? props.fileTypes[0] : props.fileTypes.length ? "mixed" : "")
const sortOptions = computed(() => [
  ...(props.hasQuery ? [{ id: "relevance", label: "Best match" }] : []),
  { id: "name", label: "Name A to Z" },
  { id: "newest", label: "Recently updated" },
])
const currentSort = computed(() => props.sort ?? (props.hasQuery ? "relevance" : "name"))
</script>

<template>
  <div class="sticky top-0 z-10 -mx-5 -mt-5 mb-5 grid gap-3 border-b border-neutral-200 bg-white px-5 pt-5 pb-3">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p class="min-w-0 flex-1 text-body text-neutral-800" aria-live="polite">
        <strong class="font-semibold text-neutral-950">{{ total }} {{ total === 1 ? "result" : "results" }}</strong>
        <template v-if="terms.length"> for <span class="font-medium">{{ terms.join(", ") }}</span></template>
        <span class="text-[color:var(--dv-text-secondary)]"> in {{ scopeLabel }}</span>
      </p>
      <Button type="button" variant="ghost" size="icon" aria-label="Display preferences" @click="emit('openDisplayPreferences')">
        <LayoutDashboard class="text-neutral-500 hover:text-neutral-800" />
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label="File type" class="flex max-w-full overflow-x-auto border border-neutral-200 bg-neutral-50 p-0.5">
        <button v-for="segment in segments" :key="segment.id" type="button" role="radio" :aria-checked="activeSegment === segment.id" :disabled="segment.count === 0 && activeSegment !== segment.id" class="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 px-3 text-body font-medium text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-white aria-checked:text-neutral-950 aria-checked:shadow-sm" @click="emit('update:fileTypes', segment.id ? [segment.id] : [])">
          <span>{{ segment.label }}</span>
          <span class="text-caption tabular-nums text-[color:var(--dv-text-secondary)]">{{ segment.count }}</span>
        </button>
      </div>
      <div class="flex items-center gap-2">
        <label for="search-sort" class="text-body text-[color:var(--dv-text-secondary)]">Sort</label>
        <Select :model-value="currentSort" @update:model-value="emit('update:sort', $event as SearchSort)">
          <SelectTrigger id="search-sort" class="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in sortOptions" :key="option.id" :value="option.id">{{ option.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ul v-if="chips.length" class="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Active filters">
        <li v-for="chip in chips" :key="`${chip.key}-${chip.value}`">
          <button type="button" class="flex h-7 cursor-pointer items-center gap-1 border border-neutral-300 bg-white pl-2 pr-1 text-caption font-medium text-neutral-800 hover:border-neutral-500" :aria-label="`Remove filter ${chip.label}`" @click="emit('removeChip', chip)">
            <span>{{ chip.label }}</span>
            <X class="size-3.5 text-neutral-500" aria-hidden="true" />
          </button>
        </li>
        <li v-if="chips.length > 1">
          <button type="button" class="h-7 cursor-pointer px-2 text-caption font-medium text-neutral-600 hover:text-neutral-950" @click="emit('clearFilters')">Clear all</button>
        </li>
      </ul>
    </div>
  </div>
</template>
