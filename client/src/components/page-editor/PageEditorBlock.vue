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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { Block, Collection, Page } from "@/layouts/LayoutPageEditor.vue"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Settings, Trash2 } from "lucide-vue-next"
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
  canMove?: { up: boolean; down: boolean; left: boolean; right: boolean }
}>()
const emit = defineEmits<{ move: [direction: "up" | "down" | "left" | "right"] }>()
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
  <div :class="['block__root relative [&.block\_\_root--editable:hover]:border [&.block\_\_root--editable:hover]:border-dashed [&.block\_\_root--editable:hover]:border-spacing-1 [&.block\_\_root--editable:hover]:border-neutral-400 [&.block\_\_root--editable:hover]:p-2 [&.block\_\_root--editable_.block\_\_content]:pointer-events-none [&:hover_.block\_\_action-container]:block [&:focus-within_.block\_\_action-container]:block', editMode && 'block__root--editable']"
    :data-block-id="block.id">
    <div v-if="editMode && draggingBlockId !== block.id"
      class="block__action-container hidden absolute top-[-20px] left-1/2 bg-white z-10 border border-dashed border-neutral-400">
      <template v-if="canMove">
        <Button class="block__action" data-block-action="up" :disabled="!canMove.up" @click="emit('move', 'up')"
          variant="ghost" size="icon" type="button" aria-label="Move block up">
          <ArrowUp class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
        </Button>
        <Button class="block__action" data-block-action="down" :disabled="!canMove.down" @click="emit('move', 'down')"
          variant="ghost" size="icon" type="button" aria-label="Move block down">
          <ArrowDown class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
        </Button>
        <Button class="block__action" data-block-action="left" :disabled="!canMove.left" @click="emit('move', 'left')"
          variant="ghost" size="icon" type="button" aria-label="Move block left">
          <ArrowLeft class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
        </Button>
        <Button class="block__action" data-block-action="right" :disabled="!canMove.right"
          @click="emit('move', 'right')" variant="ghost" size="icon" type="button" aria-label="Move block right">
          <ArrowRight class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
        </Button>
      </template>
      <Button class="block__action" @click="isEditModalOpen = true" variant="ghost" size="icon" type="button"
        aria-label="Edit block settings">
        <Settings class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger as-child>
          <Button class="block__action" variant="ghost" size="icon" type="button" aria-label="Delete block">
            <Trash2 class="w-5 h-5 text-neutral-600 hover:text-neutral-800" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this block?</AlertDialogTitle>
            <AlertDialogDescription>The block is removed from the page. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction @click="remove">Delete block</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    <div class="block__content" :inert="editMode || undefined">
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
        <div class="block__text [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:pb-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:pb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:pb-2 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:pb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:pb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:pb-2 [&_.ql-align-center]:text-center [&_.ql-align-right]:text-right [&_.ql-align-left]:text-left [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:py-1 [&_blockquote]:pl-4 [&_pre]:bg-slate-100 [&_pre]:p-4 [&_pre]:mb-2 [&_pre]:rounded-lg [&_a]:text-blue-600 [&_a]:hover:text-blue-700 [&_a]:underline" v-html="block.data" />
      </template>
      <template v-else-if="block.type === 'image'">
        <component :is="block.data.url ? 'a' : 'div'" :href="block.data.url"
          :target="block.data.external ? '_blank' : '_self'">
          <img :src="block.data.presignedUrl" alt="" class="w-full" />
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
