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
import CollectionCheckbox from '@/components/collection/CollectionCheckbox.vue'
import PathBreadcrumb, { type PathBreadcrumbItem } from '@/components/navigation/PathBreadcrumb.vue'
import { ChevronRight } from '@lucide/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  items: PathBreadcrumbItem[]
  selectedCount: number
  selectableCount: number
  selectionLabel: string
}>()
defineEmits<{ toggle: [] }>()
const isHovered = ref(false)
const allSelected = computed(() => props.selectableCount > 0 && props.selectedCount === props.selectableCount)
const selectionText = computed(() => {
  if (!props.selectedCount) return 'Select All in'
  if (isHovered.value) return allSelected.value ? 'Remove Selection in' : 'Select All in'
  return `${props.selectedCount} item${props.selectedCount === 1 ? '' : 's'} selected in`
})
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center">
    <template v-if="selectableCount">
      <div class="collection__selection-container flex shrink-0 items-center gap-1.5 text-neutral-500" @mouseenter="isHovered = true" @mouseleave="isHovered = false">
        <CollectionCheckbox :label="selectionLabel" :state="allSelected ? 'check' : selectedCount ? 'undetermined' : false" @click="$emit('toggle')" />
        <button type="button" class="text-sm text-neutral-500 bg-transparent border-none cursor-pointer p-0 w-max" @click="$emit('toggle')">
          {{ selectionText }}
        </button>
      </div>
      <ChevronRight aria-hidden="true" class="mx-2 size-4 shrink-0 text-neutral-500" />
    </template>
    <div class="collection__path flex min-w-0 items-center">
      <PathBreadcrumb :items="items" />
    </div>
  </div>
</template>
