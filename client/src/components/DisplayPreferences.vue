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
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useGlobalStore } from '@/stores/globalStore'
import { collectionDisplayGroup, DEFAULT_MASONRY_SIZE, fileDisplayGroup, MASONRY_SIZES, type DisplayCollection, type DisplayFile, type DisplayGroup, type DisplayView, type MasonrySize } from '@/utils/displayPreferences'
import { Check, LayoutDashboard, LayoutGrid, LockKeyhole, RotateCcw, Rows3, SlidersHorizontal } from '@lucide/vue'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  files?: DisplayFile[]
  collections?: DisplayCollection[]
  grouped?: boolean
  layoutLocked?: boolean
}>(), { files: () => [], collections: () => [], grouped: false, layoutLocked: false })
const store = useGlobalStore()
const selectedId = ref('')
const groups = computed(() => {
  const items: DisplayGroup[] = []
  if (props.files.length || !props.collections.length) {
    if (props.grouped && props.files.length) {
      const filesByType = new Map<string, DisplayFile[]>()
      props.files.forEach(file => {
        const id = file.assetType?.id ?? 'asset_file'
        filesByType.set(id, [...(filesByType.get(id) ?? []), file])
      })
      items.push(...[...filesByType.values()].map(fileDisplayGroup).sort((a, b) => a.name.localeCompare(b.name)))
    } else items.push(fileDisplayGroup(props.files))
  }
  if (props.collections.length) items.push(collectionDisplayGroup(props.collections))
  return items
})
const group = computed(() => groups.value.find(item => item.id === selectedId.value) ?? groups.value[0])
const display = computed(() => store.displayPreferences[group.value.id] ?? group.value.defaultDisplay)
const selectedColumns = computed(() => store.displayDetails[group.value.id]?.columns ?? group.value.defaultColumns)
const views = computed<DisplayView[]>(() => group.value.id === 'asset_folder' ? ['grid', 'list'] : ['grid', 'list', 'masonry'])
const viewIcons = { grid: LayoutGrid, list: Rows3, masonry: LayoutDashboard }
const viewLabels = { grid: 'Grid', list: 'List', masonry: 'Masonry' }
const masonrySize = computed(() => store.displayDetails[group.value.id]?.masonrySize ?? DEFAULT_MASONRY_SIZE)
const masonrySizeLabel = computed(() => MASONRY_SIZES.find(size => size.id === masonrySize.value)?.label ?? '')
// The trigger wears the current view, and admits it when the groups disagree.
const displays = computed(() => groups.value.map(item => store.displayPreferences[item.id] ?? item.defaultDisplay))
const sharedDisplay = computed(() => displays.value.every(value => value === displays.value[0]) ? displays.value[0] : null)
const triggerIcon = computed(() => sharedDisplay.value ? viewIcons[sharedDisplay.value] : SlidersHorizontal)
const triggerTitle = computed(() => `Display preferences — ${sharedDisplay.value ? viewLabels[sharedDisplay.value] : 'mixed'}`)
const customized = computed(() => groups.value.some(item => store.displayPreferences[item.id] !== undefined || store.displayDetails[item.id] !== undefined))

function toggleColumn(id: string) {
  store.setDisplayDetails(group.value.id, {
    columns: selectedColumns.value.includes(id) ? selectedColumns.value.filter(value => value !== id) : [...selectedColumns.value, id],
  })
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Display preferences" :title="triggerTitle" class="relative text-neutral-500 data-[state=open]:bg-neutral-100 data-[state=open]:text-neutral-950">
        <component :is="triggerIcon" aria-hidden="true" />
        <span v-if="customized" class="absolute right-1 top-1 size-1 rounded-full bg-neutral-700 ring-2 ring-white" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" :side-offset="8" :collision-padding="12" class="display-preferences" aria-label="Display preferences">
      <div class="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h2 class="text-[13px] font-semibold text-neutral-900">Display preferences</h2>
        <span class="text-[11px] text-neutral-500">Only for you</span>
      </div>
      <div v-if="groups.length > 1" class="flex items-center justify-between gap-3 px-4 pb-3">
        <span class="text-xs text-neutral-500">Content</span>
        <Select :model-value="group.id" @update:model-value="selectedId = String($event)">
          <SelectTrigger aria-label="Content type" class="h-8 max-w-[220px] rounded-lg text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem v-for="item in groups" :key="item.id" :value="item.id">{{ item.name }}</SelectItem></SelectContent>
        </Select>
      </div>
      <p v-else class="px-4 pb-3 text-xs text-neutral-500">{{ group.name }}</p>
      <Tabs :model-value="display" @update:model-value="store.setDisplayPreferences(group.id, $event as DisplayView)">
        <TabsList aria-label="Layout" class="mx-4 grid gap-1 rounded-xl bg-neutral-100 p-1" :style="{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }">
          <TabsTrigger v-for="view in views" :key="view" :value="view" :disabled="layoutLocked" class="rounded-lg py-2 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <span class="flex items-center justify-center gap-1.5"><component :is="viewIcons[view]" class="size-4 shrink-0" aria-hidden="true" />{{ viewLabels[view] }}</span>
          </TabsTrigger>
        </TabsList>
        <p v-if="layoutLocked" class="mx-4 mt-2 text-[11px] leading-4 text-neutral-500">Some sections of this page use a layout fixed by its author.</p>
        <TabsContent value="list" class="m-0 p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="text-xs font-medium text-neutral-800">Display properties</h3>
            <span class="text-[11px] tabular-nums text-neutral-500">{{ group.properties.filter(item => selectedColumns.includes(item.id)).length }} selected</span>
          </div>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Visible list properties">
            <span class="property-pill property-locked" title="Name is always visible"><LockKeyhole class="size-3" aria-hidden="true" />Name</span>
            <button v-for="property in group.properties" :key="property.id" type="button" class="property-pill" :aria-pressed="selectedColumns.includes(property.id)" @click="toggleColumn(property.id)">
              <Check v-if="selectedColumns.includes(property.id)" class="size-3" aria-hidden="true" />{{ property.label }}
            </button>
          </div>
          <p class="mt-3 text-[11px] leading-4 text-neutral-500">Choose the attributes shown as columns.</p>
        </TabsContent>
        <TabsContent value="grid" class="m-0 p-4">
          <p class="text-xs leading-5 text-neutral-500">{{ group.id === 'asset_folder' ? 'Preview collections as visual cards. Switch to List to choose their displayed properties.' : 'Every thumbnail gets the same size. Switch to Masonry to keep each file\'s own proportions.' }}</p>
        </TabsContent>
        <TabsContent value="masonry" class="m-0 p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 id="masonry-size-label" class="text-xs font-medium text-neutral-800">Picture size</h3>
            <span class="text-[11px] text-neutral-500">{{ masonrySizeLabel }}</span>
          </div>
          <Slider :model-value="[masonrySize]" :min="1" :max="4" :step="1" thumb-labelledby="masonry-size-label"
            @update:model-value="store.setDisplayDetails(group.id, { masonrySize: ($event?.[0] ?? DEFAULT_MASONRY_SIZE) as MasonrySize })" />
          <div class="mt-2 flex justify-between text-[11px] text-neutral-500" aria-hidden="true">
            <span v-for="size in MASONRY_SIZES" :key="size.id" :class="size.id === masonrySize && 'font-medium text-neutral-800'">{{ size.label }}</span>
          </div>
          <p class="mt-3 text-[11px] leading-4 text-neutral-500">Pictures keep their own proportions and always fill the width. Their details appear on hover.</p>
        </TabsContent>
      </Tabs>
      <div class="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3">
        <span class="text-[11px] text-neutral-500">Saved in this browser</span>
        <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-md text-xs text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" @click="store.resetDisplayPreference(group.id)"><RotateCcw class="size-3" aria-hidden="true" />Reset</button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style>
.display-preferences {
  width: min(352px, calc(100vw - 24px));
  max-height: var(--reka-popover-content-available-height);
  overflow-y: auto;
  padding: 0;
  border: 1px solid #e5e5e5;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 16px 48px -12px rgb(0 0 0 / .2), 0 2px 8px rgb(0 0 0 / .04);
}
.display-preferences .property-pill { display: inline-flex; align-items: center; gap: 5px; min-height: 29px; max-width: 100%; overflow-wrap: anywhere; padding: 4px 10px; border: 1px solid #e5e5e5; border-radius: 999px; background: #fff; color: #737373; font-size: 12px; line-height: 18px; cursor: pointer; }
.display-preferences .property-pill:hover { border-color: #a3a3a3; color: #262626; }
.display-preferences .property-pill[aria-pressed=true] { background: #f0f0f0; border-color: #d4d4d4; color: #262626; }
.display-preferences .property-locked { background: #fafafa; cursor: default; }
.display-preferences .property-pill:focus-visible { outline: 2px solid #525252; outline-offset: 2px; }
.display-preferences [role="tablist"] { border-radius: 12px; }
.display-preferences [role="tab"] { border-radius: 8px; background: transparent; color: #737373; box-shadow: none; }
.display-preferences [role="tab"][data-state="active"] { background: #fff; color: #262626; box-shadow: 0 1px 3px rgb(0 0 0 / .1); }
.display-preferences [role="combobox"] { border-radius: 8px; min-height: 32px; }
</style>
