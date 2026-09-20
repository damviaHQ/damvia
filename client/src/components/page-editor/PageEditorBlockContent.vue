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
import PageBlockView from "@/components/page-renderer/PageBlockView.vue"
import BlockHero from "@/components/page-renderer/blocks/BlockHero.vue"
import { resolveMedia } from "@/components/page-renderer/media"
import type { Collection, EditorBlock, PageAssets } from "@/components/page-renderer/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Check, ImageUp, Move } from "@lucide/vue"
import { computed, ref } from "vue"
import { RouteLocationRaw } from "vue-router"
import MediaPickerDialog from "./MediaPickerDialog.vue"
import RichTextEditor from "./RichTextEditor.vue"

// What the author edits is the block itself, in place, with the same markup a
// reader sees; only the controls around it differ.
const props = defineProps<{
  block: EditorBlock
  pageId: string
  assets?: PageAssets
  collection?: Collection
  generateRoute: (collection: Collection) => RouteLocationRaw
}>()
const emit = defineEmits<{
  (e: "update", data: any): void
  (e: "preview", payload: { media: any; url: string; name?: string }): void
}>()

const isPickerOpen = ref(false)
const isRepositioning = ref(false)
const heroImage = ref<HTMLElement | null>(null)
const mediaKind = computed<"image" | "video">(() => (props.block.type === "video" ? "video" : "image"))
const hasMedia = computed(() => !!resolveMedia(props.block.data?.media, props.assets) || props.block.data?.media?.source === "embed")

function patch(values: Record<string, unknown>) {
  emit("update", { ...props.block.data, ...values })
}

function onSelect({ media, previewUrl, name }: { media: any; previewUrl?: string; name?: string }) {
  // The chosen picture is shown at once, before the page is saved.
  if (previewUrl) {
    emit("preview", { media, url: previewUrl, name })
  }
  patch({ media })
}

// Dragging the banner picture chooses which part of it stays in frame.
function reposition(event: PointerEvent) {
  const frame = heroImage.value?.getBoundingClientRect()
  if (!frame || !isRepositioning.value) {
    return
  }
  const x = Math.round(Math.min(100, Math.max(0, ((event.clientX - frame.left) / frame.width) * 100)))
  const y = Math.round(Math.min(100, Math.max(0, ((event.clientY - frame.top) / frame.height) * 100)))
  patch({ focus: { x, y } })
}

function startReposition(event: PointerEvent) {
  if (!isRepositioning.value) {
    return
  }
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  reposition(event)
}

function nudge(event: KeyboardEvent) {
  const keys: Record<string, [number, number]> = {
    ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5],
  }
  const step = keys[event.key]
  if (!step || !isRepositioning.value) {
    return
  }
  event.preventDefault()
  const point = props.block.data?.focus ?? { x: 50, y: 50 }
  patch({
    focus: {
      x: Math.min(100, Math.max(0, (point.x ?? 50) + step[0])),
      y: Math.min(100, Math.max(0, (point.y ?? 50) + step[1])),
    },
  })
}
</script>

<template>
  <div>
    <RichTextEditor v-if="block.type === 'text'" :model-value="block.data.html ?? ''"
      placeholder="Write a title or a paragraph…" @update:model-value="patch({ html: $event })" />

    <div v-else-if="block.type === 'hero'" class="group/hero relative">
      <div ref="heroImage" :class="isRepositioning && hasMedia && 'cursor-move ring-2 ring-neutral-900'"
        @pointerdown="startReposition" @pointermove="event => event.buttons === 1 && reposition(event)">
        <BlockHero :data="block.data" :assets="assets" editing :text-hidden="!isRepositioning" />
      </div>
      <div class="pointer-events-none absolute inset-0 flex flex-col justify-end gap-2 p-6 md:p-10">
        <Input v-if="!isRepositioning" :model-value="block.data.title ?? ''" placeholder="Banner title"
          class="pointer-events-auto border-transparent bg-white/85 text-2xl font-semibold md:text-3xl"
          aria-label="Banner title" @update:model-value="patch({ title: $event })" />
        <Input v-if="!isRepositioning" :model-value="block.data.subtitle ?? ''" placeholder="Banner subtitle (optional)"
          class="pointer-events-auto border-transparent bg-white/85" aria-label="Banner subtitle"
          @update:model-value="patch({ subtitle: $event })" />
      </div>

      <!-- Picture controls sit on the picture, away from the block toolbar,
           and stay quiet until the block is hovered or holds keyboard focus. -->
      <div v-if="hasMedia"
        class="absolute left-3 top-3 flex items-center gap-0.5 rounded-md bg-neutral-900/70 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover/hero:opacity-100 group-focus-within/hero:opacity-100"
        :class="isRepositioning && 'opacity-100'">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button type="button" variant="ghost" size="icon"
              class="size-7 text-white hover:bg-white/20 hover:text-white"
              :class="isRepositioning && 'bg-white/25'" :aria-pressed="isRepositioning"
              :aria-label="isRepositioning ? 'Finish moving the picture' : 'Move the picture'"
              @click="isRepositioning = !isRepositioning" @keydown="nudge">
              <Check v-if="isRepositioning" class="size-4" />
              <Move v-else class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ isRepositioning ? "Finish moving" : "Move the picture" }}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button type="button" variant="ghost" size="icon"
              class="size-7 text-white hover:bg-white/20 hover:text-white" aria-label="Change the picture"
              @click="isPickerOpen = true">
              <ImageUp class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Change the picture</TooltipContent>
        </Tooltip>
      </div>
      <Button v-else type="button" variant="outline" size="sm" class="absolute left-3 top-3"
        @click="isPickerOpen = true">
        <ImageUp class="size-4" />Add a picture
      </Button>

      <p v-if="isRepositioning" class="mt-1 text-xs text-neutral-500">
        Drag the picture to choose what stays in frame, or use the arrow keys.
      </p>
    </div>

    <div v-else-if="block.type === 'image' || block.type === 'video'">
      <template v-if="hasMedia">
        <!-- Shown exactly as a reader sees it, but nothing inside responds. -->
        <div inert class="pointer-events-none">
          <PageBlockView :block="block" :assets="assets" :collection="collection" :generate-route="generateRoute"
            editing />
        </div>
        <Button type="button" variant="outline" size="sm" class="mt-2" @click="isPickerOpen = true">
          {{ block.type === "image" ? "Change picture" : "Change video" }}
        </Button>
      </template>
      <button v-else type="button"
        class="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-neutral-400 text-sm text-neutral-600 hover:bg-neutral-50"
        @click="isPickerOpen = true">
        <ImageUp class="size-6 text-neutral-500" />
        <span>{{ block.data?.media ? "This file is no longer available. Choose another." : block.type === "image" ? "Add a picture" : "Add a video" }}</span>
      </button>
    </div>

    <!-- Listings stay inert: an author arranges blocks, never browses them. -->
    <div v-else inert class="pointer-events-none">
      <PageBlockView :block="block" :assets="assets" :collection="collection" :generate-route="generateRoute" editing />
    </div>

    <MediaPickerDialog v-if="['image', 'video', 'hero'].includes(block.type)" v-model="isPickerOpen" :page-id="pageId"
      :kind="mediaKind" @select="onSelect" />
  </div>
</template>
