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
import { ArrowDown, ArrowUp, ChevronsUpDown } from "@lucide/vue"
import { computed } from "vue"

// Structural on purpose: the table generics of a sortable column say nothing
// this button needs, and asking for them would spread them through every table.
export type SortableColumn = {
  getCanSort: () => boolean
  getIsSorted: () => false | "asc" | "desc"
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined
}

const props = defineProps<{ column: SortableColumn, label: string }>()

const sorted = computed(() => props.column.getIsSorted())
const icon = computed(() => sorted.value === "asc" ? ArrowUp : sorted.value === "desc" ? ArrowDown : ChevronsUpDown)
</script>

<template>
  <!-- The column label is the whole accessible name; the sort state is announced
  by aria-sort on the cell, which is what a screen reader reads a table by. The
  whole cell would be easier to hit but unreachable by keyboard, so the button
  carries the action and fills the cell. -->
  <button
    type="button"
    class="group/sort flex w-full min-w-0 cursor-pointer items-center gap-1 bg-transparent p-0 text-left text-inherit"
    @click="column.getToggleSortingHandler()?.($event)"
  >
    <span class="min-w-0 truncate">{{ label }}</span>
    <component
      :is="icon"
      class="size-3 shrink-0 transition-opacity"
      :class="sorted ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60'"
      aria-hidden="true"
    />
  </button>
</template>
