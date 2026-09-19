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
import { menuIconClasses, sidebarSectionTitleClasses } from "@/components/layout-main/navigationStyles"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, ChevronRight } from "lucide-vue-next"
import { computed, ref } from "vue"

export type FacetOption = { id: string, label: string, count?: number }

const props = withDefaults(defineProps<{
  id: string
  title: string
  options: FacetOption[]
  selected: string[]
  open?: boolean
  limit?: number
  emptyText?: string
}>(), { open: true, limit: 8, emptyText: "Nothing to filter on" })
const emit = defineEmits<{ toggle: [id: string] }>()

const isOpen = ref(props.open)
const filter = ref("")
const showAll = ref(false)
const filterable = computed(() => props.options.length > props.limit)

// The first rows plus every selected value, so a chosen value never hides behind "Show more".
const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  if (needle) {
    return props.options.filter((option) => option.label.toLowerCase().includes(needle))
  }
  if (showAll.value) {
    return props.options
  }
  return props.options.filter((option, index) => index < props.limit || props.selected.includes(option.id))
})
const hiddenCount = computed(() => filter.value.trim() ? 0 : props.options.length - visible.value.length)

function isDisabled(option: FacetOption) {
  return option.count === 0 && !props.selected.includes(option.id)
}
</script>

<template>
  <section :aria-labelledby="`${id}-title`" class="border-t border-neutral-200 pt-1">
    <button type="button" class="flex h-8 w-full cursor-pointer items-center gap-2 pr-2 hover:bg-neutral-200/60" :aria-expanded="isOpen" :aria-controls="`${id}-options`" @click="isOpen = !isOpen">
      <span :id="`${id}-title`" :class="sidebarSectionTitleClasses" class="min-w-0 flex-1 truncate text-left">{{ title }}</span>
      <span v-if="selected.length" class="grid size-5 place-items-center bg-neutral-800 text-[11px] font-semibold text-white" :aria-label="`${selected.length} selected`">{{ selected.length }}</span>
      <ChevronDown v-if="isOpen" :class="menuIconClasses" aria-hidden="true" />
      <ChevronRight v-else :class="menuIconClasses" aria-hidden="true" />
    </button>
    <div v-show="isOpen" :id="`${id}-options`" class="pb-1">
      <input v-if="filterable" v-model="filter" type="search" :aria-label="`Filter ${title}`" placeholder="Type to filter…" class="mx-3 mb-1 h-7 w-[calc(100%-24px)] border border-neutral-200 bg-white px-2 text-body text-neutral-900 placeholder:text-[color:var(--dv-text-secondary)] focus-visible:outline-2 focus-visible:outline-ring" />
      <p v-if="!options.length" class="px-3 py-1 text-caption text-[color:var(--dv-text-secondary)]">{{ emptyText }}</p>
      <ul v-else class="flex flex-col">
        <li v-for="(option, index) in visible" :key="option.id" class="min-w-0">
          <label :for="`${id}-option-${index}`" class="flex h-7 w-full min-w-0 items-center gap-2 px-3 text-body text-neutral-800" :class="isDisabled(option) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-neutral-200/60'">
            <Checkbox :id="`${id}-option-${index}`" :aria-label="option.label" :aria-describedby="option.count !== undefined ? `${id}-count-${index}` : undefined" :model-value="selected.includes(option.id)" :disabled="isDisabled(option)" @update:model-value="emit('toggle', option.id)" />
            <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
            <span v-if="option.count !== undefined" :id="`${id}-count-${index}`" class="text-caption tabular-nums text-[color:var(--dv-text-secondary)]">{{ option.count }}<span class="sr-only"> {{ option.count === 1 ? "file" : "files" }}</span></span>
          </label>
        </li>
      </ul>
      <button v-if="hiddenCount > 0 || showAll" type="button" class="h-7 cursor-pointer px-3 text-caption font-medium text-neutral-600 hover:text-neutral-950" @click="showAll = !showAll">
        {{ showAll ? "Show less" : `Show ${hiddenCount} more` }}
      </button>
    </div>
  </section>
</template>
