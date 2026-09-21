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
import type { FilterChip } from "@/utils/pageFilter"
import { X } from "@lucide/vue"
import { computed } from "vue"

const props = withDefaults(defineProps<{
  chips: FilterChip[]
  label?: string
  clearLabel?: string
}>(), { label: "Active filters", clearLabel: "Clear all" })
const emit = defineEmits<{ remove: [chip: FilterChip], clear: [] }>()

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
</script>

<template>
  <ul v-if="chips.length" class="filter-chip-list flex min-w-0 flex-wrap items-center gap-1.5" :aria-label="label">
    <li v-for="group in chipGroups" :key="group.key" class="max-w-full">
      <div class="filter-pill">
        <span v-if="group.category" class="filter-category">{{ group.category }}</span>
        <span v-for="chip in group.chips" :key="chip.value" class="filter-chip">
          <span class="filter-value">{{ chip.displayValue ?? chip.label }}</span>
          <button type="button" class="filter-remove" :aria-label="`Remove filter ${chip.label}`" @click="emit('remove', chip)">
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>
    </li>
    <li v-if="chips.length > 1">
      <button type="button" class="h-7 cursor-pointer px-2 text-caption font-medium text-neutral-600 hover:text-neutral-950" @click="emit('clear')">{{ clearLabel }}</button>
    </li>
  </ul>
</template>

<style>
.filter-chip-list .filter-pill { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 7px; min-height: 29px; max-width: 100%; padding: 3px 6px 3px 11px; border: 1px solid #d4d4d4; border-radius: 999px; background: #fafafa; font-size: 12px; line-height: 18px; }
.filter-chip-list .filter-pill:hover { border-color: #a3a3a3; background: #fafafa; }
.filter-chip-list .filter-pill:focus-within { border-color: #a3a3a3; }
.filter-chip-list .filter-category { padding-right: 7px; border-right: 1px solid #d4d4d4; color: #737373; white-space: nowrap; }
.filter-chip-list .filter-chip { display: inline-flex; align-items: center; gap: 2px; padding: 0 1px 0 6px; border-radius: 999px; }
.filter-chip-list .filter-chip:first-of-type { padding-left: 0; }
.filter-chip-list .filter-chip:hover { background: #ededed; }
.filter-chip-list .filter-value { color: #404040; font-weight: 500; overflow-wrap: anywhere; }
.filter-chip-list .filter-remove { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; color: #737373; cursor: pointer; }
.filter-chip-list .filter-remove:hover { background: #d4d4d4; color: #171717; }
.filter-chip-list .filter-remove:focus-visible { outline: 2px solid #525252; outline-offset: 1px; }
.filter-chip-list .filter-pill svg { flex-shrink: 0; }
</style>
