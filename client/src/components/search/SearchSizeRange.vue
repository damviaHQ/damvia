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
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { bytesToMegabytes, formatSizeRange, megabytesToBytes } from "@/utils/searchQuery"
import { ChevronDown, HardDrive } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const props = defineProps<{ minSize: number | undefined, maxSize: number | undefined }>()
const emit = defineEmits<{ apply: [range: { min: string, max: string }] }>()

const isOpen = ref(false)
const from = ref<string | number>(bytesToMegabytes(props.minSize))
const to = ref<string | number>(bytesToMegabytes(props.maxSize))
// A number input hands Vue a number, so both shapes are normalised before they reach the URL.
const text = (value: string | number) => value === "" || value === null ? "" : String(value)
const label = computed(() => formatSizeRange(props.minSize, props.maxSize))
const isSet = computed(() => props.minSize !== undefined || props.maxSize !== undefined)

// The fields always reopen on whatever the URL currently holds.
watch(() => [props.minSize, props.maxSize], () => {
  from.value = bytesToMegabytes(props.minSize)
  to.value = bytesToMegabytes(props.maxSize)
})

function apply() {
  // A reversed range is read the way it was meant, smallest first.
  const low = megabytesToBytes(from.value)
  const high = megabytesToBytes(to.value)
  const ordered = low !== undefined && high !== undefined && low > high
  emit("apply", ordered ? { min: text(to.value), max: text(from.value) } : { min: text(from.value), max: text(to.value) })
  isOpen.value = false
}

function clear() {
  from.value = ""
  to.value = ""
  emit("apply", { min: "", max: "" })
  isOpen.value = false
}
</script>

<template>
  <div class="flex items-center">
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <button type="button" class="sort-pill" :aria-label="`File size, ${label}`">
          <HardDrive class="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
          <span class="border-r border-neutral-200 pr-2 text-neutral-500">Size</span>
          <span class="truncate" :class="isSet ? 'font-medium' : ''">{{ label }}</span>
          <ChevronDown class="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-64 p-3">
        <div class="grid gap-2">
          <div class="flex items-end gap-2">
            <div class="grid flex-1 gap-1">
              <label for="search-size-from" class="text-caption text-[color:var(--dv-text-secondary)]">From</label>
              <input id="search-size-from" v-model="from" type="number" min="0" step="0.1" inputmode="decimal" placeholder="0" class="h-8 w-full border border-neutral-200 bg-white px-2 text-body text-neutral-900 focus-visible:outline-2 focus-visible:outline-ring" @keydown.enter.prevent="apply" />
            </div>
            <div class="grid flex-1 gap-1">
              <label for="search-size-to" class="text-caption text-[color:var(--dv-text-secondary)]">To</label>
              <input id="search-size-to" v-model="to" type="number" min="0" step="0.1" inputmode="decimal" placeholder="Any" class="h-8 w-full border border-neutral-200 bg-white px-2 text-body text-neutral-900 focus-visible:outline-2 focus-visible:outline-ring" @keydown.enter.prevent="apply" />
            </div>
            <span class="pb-2 text-body text-[color:var(--dv-text-secondary)]">MB</span>
          </div>
          <p class="text-caption text-[color:var(--dv-text-secondary)]">Leave a field empty for no limit.</p>
          <div class="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" class="h-8 px-2 text-caption text-neutral-600 hover:text-red-600" :disabled="!isSet && !from && !to" @click="clear">Clear size</Button>
            <Button type="button" class="h-8 px-4" @click="apply">Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
