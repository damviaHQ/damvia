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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import SearchFacetGroup from "@/components/search/SearchFacetGroup.vue"
import { usePageFilter } from "@/composables/usePageFilter"
import type { PageFilterGroup } from "@/utils/pageFilter"
import { useGlobalStore } from "@/stores/globalStore"
import { ChevronRight, Plus, Search, Tag } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const props = defineProps<{ groups: PageFilterGroup[] }>()
const store = useGlobalStore()
const filter = usePageFilter()
const activeKey = ref<string | null>(null)
const openedByHover = ref(false)
const query = ref("")
const open = ref(false)
const offered = computed(() => props.groups.filter(group => (!store.pageFilters.includes(group.key) || group.key === activeKey.value)
  && group.title.toLowerCase().includes(query.value.toLowerCase())))
watch(open, () => {
  activeKey.value = null
  query.value = ""
})
function showOptions(key: string, hover = false) {
  openedByHover.value = hover
  activeKey.value = key
}
function updateOptions(key: string, isOpen: boolean) {
  if (isOpen) showOptions(key)
  else if (activeKey.value === key) activeKey.value = null
}
function add(key: string) {
  if (!store.pageFilters.includes(key)) store.togglePageFilter(key)
}
function toggleValue(key: string, value: string) {
  add(key)
  filter.toggleValue(key, value)
}
function addWithoutValue(key: string) {
  add(key)
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button type="button" aria-label="Add filter" title="Add filter" class="grid size-[29px] shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-ring">
        <Plus class="size-4" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" :collision-padding="12" class="w-60 p-1" aria-label="Add filter">
      <div class="flex items-center gap-2 border-b border-neutral-200 px-2 pb-2 pt-1">
        <Search class="size-3.5 text-neutral-500" aria-hidden="true" />
        <input v-model="query" aria-label="Find a filter" placeholder="Add filter…" class="min-w-0 w-full bg-transparent text-sm outline-none" />
      </div>
      <div class="max-h-64 overflow-y-auto py-1">
        <Popover v-for="group in offered" :key="group.key" :open="activeKey === group.key" @update:open="updateOptions(group.key, $event)">
          <PopoverTrigger as-child>
            <button type="button" @pointerenter="$event.pointerType === 'mouse' && showOptions(group.key, true)" @click.prevent="showOptions(group.key)" @keydown.right.prevent="showOptions(group.key)" :class="activeKey === group.key ? 'bg-neutral-100' : ''" class="flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-ring">
              <Tag class="size-3.5 text-neutral-500" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ group.title }}</span>
              <ChevronRight class="size-3.5 text-neutral-500" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" :side-offset="8" :collision-padding="12" class="max-h-80 w-60 overflow-y-auto p-1" :aria-label="group.title" @open-auto-focus="openedByHover && $event.preventDefault()" @close-auto-focus="open && $event.preventDefault()">
            <SearchFacetGroup
              :id="`add-filter-${group.key.replace(':', '-')}`"
              :title="group.title"
              :options="group.options"
              :selected="group.selected"
              :show-header="false"
              @toggle="toggleValue(group.key, $event)"
            />
            <button v-if="!store.pageFilters.includes(group.key)" type="button" class="mt-1 min-h-8 w-full border-t border-neutral-200 px-3 text-left text-xs text-neutral-500 hover:text-neutral-950" @click="addWithoutValue(group.key)">Add without a value</button>
          </PopoverContent>
        </Popover>
        <p v-if="!offered.length" class="px-2 py-2 text-xs text-neutral-500">{{ query ? 'No matching filters.' : 'All available filters are on the bar.' }}</p>
      </div>
    </PopoverContent>
  </Popover>
</template>
