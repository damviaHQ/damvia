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
import { computed, ref, watch } from "vue"
import { useRoute, useRouter, type LocationQuery } from "vue-router"
import { DialogContent, DialogDescription, DialogPortal, DialogRoot, DialogTitle } from "reka-ui"
import { X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { useSearchState } from "@/composables/useSearchState"
import { FILE_TYPE_OPTIONS, filterDraft, queryValueToArray, SEARCH_SORTS, toggleQueryValue } from "@/utils/searchQuery"

// One filter group: the values a reader can pick and how many results each has.
export type FilterGroup = { key: string, label: string, options: { value: string, label: string, count?: number }[] }
const props = defineProps<{ groups: FilterGroup[], ranges?: { id: string, label: string }[], products?: boolean, hasQuery: boolean }>()

const route = useRoute()
const router = useRouter()
const { applyDraft } = useSearchState()
const open = computed(() => route.query.panel === "filters")
const draft = ref<LocationQuery>({})
const expanded = ref<string[]>([])
const search = ref<Record<string, string>>({})
// The screen opens with what the address says, and changes it only on Apply.
watch(open, (value) => { if (value) { draft.value = filterDraft(route.query); expanded.value = []; search.value = {} } }, { immediate: true })

const selected = (key: string) => queryValueToArray(draft.value[key])
function toggle(key: string, value: string) {
  draft.value = filterDraft(toggleQueryValue(draft.value, key, value))
}
function setOne(key: string, value: string | undefined) {
  const next = { ...draft.value }
  if (value) next[key] = value
  else delete next[key]
  draft.value = next
}
function shown(group: FilterGroup) {
  const term = (search.value[group.key] ?? "").toLowerCase()
  const matching = group.options.filter((option) => !term || option.label.toLowerCase().includes(term))
  // Chosen values stay visible even when the list is cut short.
  if (expanded.value.includes(group.key) || term) return matching
  const first = matching.slice(0, 8)
  return [...first, ...matching.filter((option) => !first.includes(option) && selected(group.key).includes(option.value))]
}
const count = computed(() => Object.entries(draft.value).filter(([key]) => key !== "sort").reduce((total, [, value]) => total + queryValueToArray(value).length, 0))
const sortLabels: Record<string, string> = { relevance: "Best match", name: "Name A to Z", newest: "Recently updated" }
const sorts = computed(() => SEARCH_SORTS.filter((sort) => sort !== "relevance" || props.hasQuery))

function close() {
  if (window.history.state?.back) router.back()
  else router.replace({ query: { ...route.query, panel: undefined } })
}
function apply() {
  const { panel: _panel, ...query } = route.query
  applyDraft(draft.value, query)
}
function reset() {
  draft.value = {}
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => { if (!value) close() }">
    <DialogPortal>
      <DialogContent class="mobile-filters dv-theme dv-neutral dv-client">
        <header class="flex items-center gap-2 border-b border-[var(--dv-color-line)] px-4 py-2">
          <button type="button" class="-ml-3 grid size-11 place-items-center" aria-label="Cancel" @click="close"><X :size="22" aria-hidden="true" /></button>
          <DialogTitle class="flex-1 text-[17px] font-semibold">Filters</DialogTitle>
          <button type="button" class="min-h-11 px-2 underline" @click="reset">Reset</button>
        </header>
        <DialogDescription class="sr-only">Choose filters, then apply them to the results.</DialogDescription>
        <div class="overflow-y-auto pb-4">
          <fieldset v-if="!products" class="mobile-filters__group">
            <legend>Sort</legend>
            <label v-for="sort in sorts" :key="sort" class="mobile-filters__option">
              <input type="radio" name="sort" :checked="(draft.sort ?? (hasQuery ? 'relevance' : 'name')) === sort" @change="setOne('sort', sort === 'relevance' ? undefined : sort)" />{{ sortLabels[sort] }}
            </label>
          </fieldset>
          <fieldset v-if="!products" class="mobile-filters__group">
            <legend>Match</legend>
            <label class="mobile-filters__option"><input type="checkbox" :checked="draft.exact_match === 'true'" @change="setOne('exact_match', ($event.target as HTMLInputElement).checked ? 'true' : undefined)" />Exact phrase only</label>
          </fieldset>
          <fieldset v-if="!products" class="mobile-filters__group">
            <legend>File type</legend>
            <label v-for="option in FILE_TYPE_OPTIONS" :key="option.id" class="mobile-filters__option">
              <input type="checkbox" :checked="selected('file_types').includes(option.id)" @change="toggle('file_types', option.id)" />{{ option.label }}
            </label>
          </fieldset>
          <fieldset v-for="group in groups" :key="group.key" class="mobile-filters__group">
            <legend>{{ group.label }}</legend>
            <input v-if="group.options.length > 8" v-model="search[group.key]" type="search" :aria-label="`Search ${group.label}`" placeholder="Search"
              class="mb-2 min-h-11 w-full rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3 text-base" />
            <label v-for="option in shown(group)" :key="option.value" class="mobile-filters__option">
              <input type="checkbox" :checked="selected(group.key).includes(option.value)" @change="toggle(group.key, option.value)" />
              <span class="flex-1 break-words">{{ option.label }}</span>
              <span v-if="option.count !== undefined" class="text-sm text-[var(--dv-text-secondary)]">{{ option.count }}</span>
            </label>
            <button v-if="!search[group.key] && group.options.length > 8 && !expanded.includes(group.key)" type="button" class="min-h-11 underline" @click="expanded.push(group.key)">
              Show all {{ group.options.length }}
            </button>
          </fieldset>
          <fieldset v-for="range in ranges ?? []" :key="range.id" class="mobile-filters__group">
            <legend>{{ range.label }}</legend>
            <div class="grid grid-cols-2 gap-2">
              <label class="grid gap-1 text-sm">From<input type="date" :value="draft[`metadata_from[${range.id}]`] ?? ''" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-2 text-base" @change="setOne(`metadata_from[${range.id}]`, ($event.target as HTMLInputElement).value)" /></label>
              <label class="grid gap-1 text-sm">To<input type="date" :value="draft[`metadata_to[${range.id}]`] ?? ''" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-2 text-base" @change="setOne(`metadata_to[${range.id}]`, ($event.target as HTMLInputElement).value)" /></label>
            </div>
          </fieldset>
          <fieldset v-if="!products" class="mobile-filters__group">
            <legend>Size (MB)</legend>
            <div class="grid grid-cols-2 gap-2">
              <label class="grid gap-1 text-sm">Min<input type="number" min="0" inputmode="decimal" :value="draft.size_min ?? ''" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-2 text-base" @change="setOne('size_min', ($event.target as HTMLInputElement).value)" /></label>
              <label class="grid gap-1 text-sm">Max<input type="number" min="0" inputmode="decimal" :value="draft.size_max ?? ''" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-2 text-base" @change="setOne('size_max', ($event.target as HTMLInputElement).value)" /></label>
            </div>
          </fieldset>
        </div>
        <footer class="border-t border-[var(--dv-color-line)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <Button type="button" class="min-h-12 w-full" @click="apply">Apply{{ count ? ` (${count})` : "" }}</Button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.mobile-filters {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding-top: env(safe-area-inset-top);
  background: var(--dv-surface-panel);
  color: var(--dv-text-primary);
  font-size: 16px;
}
.mobile-filters__group {
  display: grid;
  gap: 0;
  padding: 16px 16px 8px;
  border-bottom: 1px solid var(--dv-color-line);
}
.mobile-filters__group legend {
  padding: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.mobile-filters__option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
}
.mobile-filters__option input {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
</style>
