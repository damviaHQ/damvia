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
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown, FileType } from "@lucide/vue"
import { computed, ref } from "vue"

export type FormatOption = { id: string, label: string, count: number }

const props = defineProps<{ options: FormatOption[], selected: string[] }>()
const emit = defineEmits<{ toggle: [id: string], clear: [] }>()

const isOpen = ref(false)
// A format with nothing behind it is dropped, unless it is the one in use.
const available = computed(() => props.options.filter((option) => option.count > 0 || props.selected.includes(option.id)))
const label = computed(() => props.selected.length
  ? props.selected.map((value) => value.toUpperCase()).join(", ")
  : "Any")
</script>

<template>
  <div v-if="available.length" class="flex items-center">
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <button type="button" class="sort-pill" :aria-label="`File format, ${label}`">
          <FileType class="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
          <span class="border-r border-neutral-200 pr-2 text-neutral-500">Format</span>
          <span class="max-w-40 truncate" :class="selected.length ? 'font-medium' : ''">{{ label }}</span>
          <ChevronDown class="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="max-h-80 w-56 overflow-y-auto p-1">
        <ul class="flex flex-col">
          <li v-for="(option, index) in available" :key="option.id">
            <label :for="`search-format-${index}`" class="flex h-8 w-full cursor-pointer items-center gap-2 px-2 text-body text-neutral-800 hover:bg-neutral-100">
              <Checkbox :id="`search-format-${index}`" :aria-label="option.label" :aria-describedby="`search-format-count-${index}`" :model-value="selected.includes(option.id)" @update:model-value="emit('toggle', option.id)" />
              <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
              <span :id="`search-format-count-${index}`" class="text-caption tabular-nums text-[color:var(--dv-text-secondary)]">{{ option.count }}<span class="sr-only"> {{ option.count === 1 ? "file" : "files" }}</span></span>
            </label>
          </li>
        </ul>
        <button v-if="selected.length" type="button" class="mt-1 h-7 w-full cursor-pointer px-2 text-left text-caption font-medium text-neutral-600 hover:text-neutral-950" @click="emit('clear')">Clear formats</button>
      </PopoverContent>
    </Popover>
  </div>
</template>
