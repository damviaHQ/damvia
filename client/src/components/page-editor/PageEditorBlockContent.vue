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
import { ImageUp } from "@lucide/vue"
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
const emit = defineEmits<{ (e: "update", data: any): void; (e: "preview", payload: { s3key: string; url: string }): void }>()

const isPickerOpen = ref(false)
const mediaKind = computed<"image" | "video">(() => (props.block.type === "video" ? "video" : "image"))
const hasMedia = computed(() => !!resolveMedia(props.block.data?.media, props.assets) || props.block.data?.media?.source === "embed")

function patch(values: Record<string, unknown>) {
  emit("update", { ...props.block.data, ...values })
}

function onSelect({ media, previewUrl }: { media: any; previewUrl?: string }) {
  if (media.source === "upload" && previewUrl) {
    emit("preview", { s3key: media.s3key, url: previewUrl })
  }
  patch({ media })
}
</script>

<template>
  <div>
    <RichTextEditor v-if="block.type === 'text'" :model-value="block.data.html ?? ''"
      placeholder="Write a title or a paragraph…" @update:model-value="patch({ html: $event })" />

    <div v-else-if="block.type === 'hero'" class="relative">
      <BlockHero :data="block.data" :assets="assets" editing />
      <div class="pointer-events-none absolute inset-0 flex flex-col justify-end gap-2 p-6 md:p-10">
        <Input :model-value="block.data.title ?? ''" placeholder="Banner title"
          class="pointer-events-auto border-transparent bg-white/85 text-2xl font-semibold md:text-3xl"
          aria-label="Banner title" @update:model-value="patch({ title: $event })" />
        <Input :model-value="block.data.subtitle ?? ''" placeholder="Banner subtitle (optional)"
          class="pointer-events-auto border-transparent bg-white/85" aria-label="Banner subtitle"
          @update:model-value="patch({ subtitle: $event })" />
      </div>
      <Button type="button" variant="outline" size="sm" class="pointer-events-auto absolute right-3 top-3"
        @click="isPickerOpen = true">
        <ImageUp class="size-4" />{{ hasMedia ? "Change picture" : "Add a picture" }}
      </Button>
    </div>

    <div v-else-if="block.type === 'image' || block.type === 'video'">
      <template v-if="hasMedia">
        <PageBlockView :block="block" :assets="assets" :collection="collection" :generate-route="generateRoute" editing />
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

    <PageBlockView v-else :block="block" :assets="assets" :collection="collection" :generate-route="generateRoute"
      editing />

    <MediaPickerDialog v-if="['image', 'video', 'hero'].includes(block.type)" v-model="isPickerOpen" :page-id="pageId"
      :kind="mediaKind" @select="onSelect" />
  </div>
</template>
