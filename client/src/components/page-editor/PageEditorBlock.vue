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
import PageEditorBlockCollections from "@/components/page-editor/PageEditorBlockCollections.vue"
import PageEditorBlockFiles from "@/components/page-editor/PageEditorBlockFiles.vue"
import PageEditorBlockLatestFiles from "@/components/page-editor/PageEditorBlockLatestFiles.vue"
import PageEditorDialog from "@/components/page-editor/PageEditorDialog.vue"
import { Button } from "@/components/ui/button"
import type { Block, Collection, Page } from "@/layouts/LayoutPageEditor.vue"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import { Settings, Trash2 } from "lucide-vue-next"
import { ref } from "vue"
import { RouteLocationRaw } from "vue-router"

type File = RouterOutput["collection"]["findById"]["files"][number]

const props = defineProps<{
  collection?: Collection
  page: Page
  block: Block
  editMode?: boolean
  draggingBlockId?: string
  generateRoute: (collection: Collection) => RouteLocationRaw
}>()
const queryClient = useQueryClient()
const isEditModalOpen = ref(false)
const globalAssetType = props.collection?.files?.every(
  (f: File) => f.assetTypeId === props.collection.files[0].assetTypeId
)
  ? props.collection.files[0]?.assetType
  : null

function remove() {
  trpc.page.removeBlock
    .mutate({ pageId: props.page.id, blockId: props.block.id })
    .then(async () => {
      if (props.collection) {
        await queryClient.invalidateQueries({
          queryKey: ["collection", props.collection.id],
        })
      }
      await queryClient.invalidateQueries({ queryKey: ["pages", props.page.id] })
    })
}
</script>

<template>
  <div :class="['block__root', editMode && 'block__root--editable']">
    <div v-if="editMode && draggingBlockId !== block.id"
      class="block__action-container hidden absolute top-[-20px] left-1/2 bg-white z-10 border border-dashed border-neutral-400">
      <Button class="block__action" @click="isEditModalOpen = true" variant="ghost" size="icon" type="button">
        <Settings class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
      </Button>
      <Button class="block__action" @click="remove" variant="ghost" size="icon" type="button">
        <Trash2 class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
      </Button>
    </div>

    <div class="block__content">
      <template v-if="block.type === 'collections'">
        <PageEditorBlockCollections :title="block.data?.title || 'Collections'" :sub-collections="collection?.children"
          :collections-id="block.data?.collectionsId" :generate-route="generateRoute" :edit-mode="editMode ?? false"
          :force-view="['list', 'grid'].includes(block.data?.layout!) ? (block.data as any).layout : null" />
      </template>
      <template v-else-if="block.type === 'files'">
        <PageEditorBlockFiles :title="(block.data?.title || globalAssetType?.name) ?? 'Files'"
          :collection-id="block.data?.collectionId || collection?.id" :edit-mode="editMode ?? false"
          :force-view="['list', 'grid'].includes(block.data?.layout!) ? (block.data as any).layout : null" />
      </template>
      <template v-else-if="block.type === 'text'">
        <div class="block__text" v-html="block.data" />
      </template>
      <template v-else-if="block.type === 'image'">
        <component :is="block.data.url ? 'a' : 'div'" :href="block.data.url"
          :target="block.data.external ? '_blank' : '_self'">
          <img :src="block.data.presignedUrl" class="w-full" />
        </component>
      </template>
      <template v-else-if="block.type === 'video'">
        <video :src="block.data.presignedUrl" class="w-full" controls />
      </template>
      <template v-else-if="block.type === 'last_files'">
        <PageEditorBlockLatestFiles :title="block.data?.title || 'Latest files'" :collection-id="collection?.id"
          :edit-mode="editMode ?? false"
          :force-view="['list', 'grid'].includes(block.data?.layout!) ? (block.data as any).layout : null" />
      </template>
    </div>

    <PageEditorDialog v-model="isEditModalOpen" :collection="$props.collection" :page="page" :block="block" />
  </div>
</template>

<style scoped>
.block__root {
  @apply relative;
}

.block__root.block__root--editable:hover {
  @apply border border-dashed border-spacing-1 border-neutral-400 p-2;
}

.block__root.block__root--editable .block__content {
  pointer-events: none;
}

.block__root:hover .block__action-container {
  display: block;
}
</style>

<style>
.block__text h1 {
  @apply text-3xl font-semibold pb-2;
}

.block__text h2 {
  @apply text-2xl font-semibold pb-2;
}

.block__text h3 {
  @apply text-xl font-semibold pb-2;
}

.block__text h4 {
  @apply text-lg font-semibold pb-2;
}

.block__text ul {
  @apply list-disc pl-6 pb-2;
}

.block__text ol {
  @apply list-decimal pl-6 pb-2;
}

.block__text .ql-align-center {
  @apply text-center;
}

.block__text .ql-align-right {
  @apply text-right;
}

.block__text .ql-align-left {
  @apply text-left;
}

.block__text blockquote {
  @apply border-l-4 border-slate-200 py-1 pl-4;
}

.block__text pre {
  @apply bg-slate-100 p-4 mb-2 rounded-lg;
}

.block__text a {
  @apply text-blue-600 hover:text-blue-700 underline;
}
</style>
