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
import type { DisplayView, MasonrySize } from "@/utils/displayPreferences"
import { computed } from "vue"

const props = defineProps<{ view: DisplayView | "variants-grouped" | "variants-apart", masonrySize?: MasonrySize }>()

// Tones stand in for pictures; heights give masonry its uneven columns.
const tones = ["bg-[#d9dee8]", "bg-[#e8e2d9]", "bg-[#dde6dc]", "bg-[#e6dde3]", "bg-[#dfe3ea]", "bg-[#e9e5dc]"]
const heights = ["h-9", "h-5", "h-7", "h-4", "h-8", "h-6", "h-5", "h-9"]
const masonryColumns = computed(() => ({ 1: 5, 2: 4, 3: 3, 4: 2 })[props.masonrySize ?? 3])
const label = computed(() => ({
  grid: "Example: pictures in equal squares with their names underneath",
  list: "Example: one line per item, with columns of details",
  masonry: "Example: pictures in their own proportions, without names",
  "variants-grouped": "Example: the square, portrait and story formats of one visual stacked on a single card marked 3 variants",
  "variants-apart": "Example: the square, portrait and story formats of one visual shown as three separate files",
})[props.view])
const formats = [{ label: "1:1", shape: "h-7 w-7" }, { label: "4:5", shape: "h-8 w-[26px]" }, { label: "9:16", shape: "h-9 w-5" }]
</script>

<template>
  <div role="img" :aria-label="label" data-display-example
    class="h-[84px] w-[168px] shrink-0 overflow-hidden border border-neutral-200 bg-white p-2">
    <div v-if="view === 'grid'" class="grid grid-cols-4 gap-1.5">
      <div v-for="index in 8" :key="index" class="grid gap-0.5">
        <span class="aspect-square" :class="tones[index % tones.length]" />
        <span class="h-[3px] w-3/4 bg-neutral-300" />
      </div>
    </div>
    <div v-else-if="view === 'list'" class="grid gap-1.5">
      <div v-for="index in 5" :key="index" class="flex items-center gap-1.5 border-b border-neutral-100 pb-1 last:border-0">
        <span class="size-2.5 shrink-0" :class="tones[index % tones.length]" />
        <span class="h-[3px] flex-1 bg-neutral-300" />
        <span class="h-[3px] w-5 bg-neutral-200" />
        <span class="h-[3px] w-4 bg-neutral-200" />
      </div>
    </div>
    <div v-else-if="view === 'variants-grouped'" class="flex h-full items-center gap-3 pl-2">
      <div class="relative size-12">
        <span class="absolute left-2 top-0 size-10 border border-white bg-[#e8e2d9]" />
        <span class="absolute left-1 top-1 size-10 border border-white bg-[#dde6dc]" />
        <span class="absolute left-0 top-2 size-10 border border-white bg-[#d9dee8]" />
      </div>
      <div class="grid gap-1">
        <span class="h-[3px] w-12 bg-neutral-300" />
        <span class="w-fit bg-neutral-100 px-1 text-[9px] leading-[14px] text-neutral-600">3 variants</span>
      </div>
    </div>
    <div v-else-if="view === 'variants-apart'" class="flex h-full items-end justify-center gap-2 pb-1">
      <div v-for="format in formats" :key="format.label" class="grid justify-items-center gap-0.5">
        <span class="bg-[#d9dee8]" :class="format.shape" />
        <span class="text-[9px] leading-3 text-neutral-500">{{ format.label }}</span>
      </div>
    </div>
    <div v-else class="grid items-start gap-1" :style="{ gridTemplateColumns: `repeat(${masonryColumns}, minmax(0, 1fr))` }">
      <div v-for="column in masonryColumns" :key="column" class="grid gap-1">
        <span v-for="index in 3" :key="index" :class="[heights[(column * 3 + index) % heights.length], tones[(column + index) % tones.length]]" />
      </div>
    </div>
  </div>
</template>
