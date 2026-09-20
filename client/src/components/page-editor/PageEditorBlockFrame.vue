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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SIZE_LABELS } from "@/components/page-renderer/layout"
import type { EditorBlock } from "@/components/page-renderer/types"
import { BLOCK_SIZES, type BlockSize } from "server/src/page-blocks/schema"
import {
  ArrowDown, ArrowUp, Columns2, Columns3, Copy, GripVertical, RectangleHorizontal, Settings, Trash2,
} from "@lucide/vue"
import { computed, ref } from "vue"
import { libraryItem } from "./blockLibrary"
import SettingsHero from "./settings/SettingsHero.vue"
import SettingsImage from "./settings/SettingsImage.vue"
import SettingsListing from "./settings/SettingsListing.vue"

const props = defineProps<{ block: EditorBlock; index: number; count: number }>()
const emit = defineEmits<{
  (e: "update", data: any): void
  (e: "resize", size: BlockSize): void
  (e: "move", direction: "up" | "down"): void
  (e: "duplicate"): void
  (e: "remove"): void
}>()

const SIZE_ICONS = { full: RectangleHorizontal, half: Columns2, third: Columns3 }
const label = computed(() => libraryItem(props.block.type)?.name ?? props.block.type)
const hasSettings = computed(() => props.block.type !== "text" && props.block.type !== "video")
// The toolbar hides when the pointer leaves the block. While a menu is open
// its trigger must stay in the layout, or the floating panel loses its anchor
// and jumps to the corner of the screen.
const isMenuOpen = ref(false)
const listingType = computed(() =>
  ["collections", "files", "last_files"].includes(props.block.type) ? (props.block.type as any) : null
)
</script>

<template>
  <div class="group relative rounded-md border border-transparent p-2 transition-colors hover:border-neutral-300 focus-within:border-neutral-300"
    :data-block-index="index">
    <div
      class="absolute -top-4 right-2 z-10 items-center gap-0.5 rounded-md border border-neutral-200 bg-white px-1 py-0.5 shadow-sm group-hover:flex group-focus-within:flex"
      :class="isMenuOpen ? 'flex' : 'hidden'">
      <span class="block-handle flex cursor-grab items-center px-1 text-neutral-400" :aria-label="`Drag ${label} block`"
        role="button" tabindex="-1"><GripVertical class="size-4" /></span>
      <span class="mr-1 text-xs font-medium text-neutral-500">{{ label }}</span>
      <Button v-for="size in BLOCK_SIZES" :key="size" type="button" variant="ghost" size="icon" class="size-7"
        :aria-label="SIZE_LABELS[size]" :aria-pressed="block.size === size" :class="block.size === size && 'bg-muted'"
        @click="emit('resize', size)">
        <component :is="SIZE_ICONS[size]" class="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Move block up" :disabled="index === 0"
        data-block-action="up" @click="emit('move', 'up')"><ArrowUp class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Move block down"
        :disabled="index === count - 1" data-block-action="down" @click="emit('move', 'down')">
        <ArrowDown class="size-4" />
      </Button>
      <Popover v-if="hasSettings" @update:open="isMenuOpen = $event">
        <PopoverTrigger as-child>
          <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Block settings">
            <Settings class="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-80" align="end" :collision-padding="12">
          <SettingsListing v-if="listingType" :data="block.data" :type="listingType" @update="emit('update', $event)" />
          <SettingsImage v-else-if="block.type === 'image'" :data="block.data" @update="emit('update', $event)" />
          <SettingsHero v-else-if="block.type === 'hero'" :data="block.data" @update="emit('update', $event)" />
        </PopoverContent>
      </Popover>
      <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Duplicate block"
        @click="emit('duplicate')"><Copy class="size-4" /></Button>
      <AlertDialog @update:open="isMenuOpen = $event">
        <AlertDialogTrigger as-child>
          <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Delete block">
            <Trash2 class="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this block?</AlertDialogTitle>
            <AlertDialogDescription>It is removed when you save the page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction @click="emit('remove')">Delete block</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    <slot />
  </div>
</template>
