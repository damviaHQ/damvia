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
import { fitToLine, moveItem, spanClass } from "@/components/page-renderer/layout"
import type { Collection, EditorBlock, PageAssets, PageData } from "@/components/page-renderer/types"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import type { BlockSize } from "server/src/page-blocks/schema"
import { Check, ChevronLeft, FilePenLine } from "@lucide/vue"
import cloneDeep from "lodash/cloneDeep"
import isEqual from "lodash/isEqual"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { onBeforeRouteLeave, useRouter } from "vue-router"
import draggable from "vuedraggable"
import PageEditorBlockContent from "./PageEditorBlockContent.vue"
import PageEditorBlockFrame from "./PageEditorBlockFrame.vue"
import PageEditorLibrary from "./PageEditorLibrary.vue"

const props = defineProps<{
  page: PageData
  collection?: Collection
  title: string
  exitTo: { name: string; params?: Record<string, string> }
}>()

const router = useRouter()
const toast = useGlobalToast()
const queryClient = useQueryClient()

// The editor owns the page while it is open; nothing is written until Save.
const blocks = ref<EditorBlock[]>(toEditorBlocks(props.page))
const assets = ref<PageAssets>(cloneDeep(props.page.assets) as PageAssets)
const saved = ref<EditorBlock[]>(cloneDeep(blocks.value))
const isSaving = ref(false)
const isLeaveDialogOpen = ref(false)
const announcement = ref("")
let confirmedLeave = false

const isDirty = computed(() => !isEqual(blocks.value, saved.value))

function toEditorBlocks(page: PageData): EditorBlock[] {
  return (page.blocks ?? []).map((block) => ({
    id: block.id,
    type: block.type,
    size: block.size as BlockSize,
    data: cloneDeep(block.data),
  }))
}

watch(() => props.page.id, () => {
  blocks.value = toEditorBlocks(props.page)
  assets.value = cloneDeep(props.page.assets) as PageAssets
  saved.value = cloneDeep(blocks.value)
})

function guardUnload(event: BeforeUnloadEvent) {
  if (isDirty.value) {
    event.preventDefault()
  }
}
onMounted(() => window.addEventListener("beforeunload", guardUnload))
onBeforeUnmount(() => window.removeEventListener("beforeunload", guardUnload))

onBeforeRouteLeave(() => {
  if (!isDirty.value || confirmedLeave) {
    return true
  }
  isLeaveDialogOpen.value = true
  return false
})

function addBlock(block: EditorBlock) {
  blocks.value = [...blocks.value, block]
  nextTick(() => {
    document.querySelector(`[data-block-index="${blocks.value.length - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  })
}

function updateData(index: number, data: any) {
  blocks.value = blocks.value.map((block, current) => (current === index ? { ...block, data } : block))
}

function resize(index: number, size: BlockSize) {
  blocks.value = blocks.value.map((block, current) => (current === index ? { ...block, size } : block))
}

function duplicate(index: number) {
  const copy = { ...cloneDeep(blocks.value[index]), id: undefined }
  blocks.value = [...blocks.value.slice(0, index + 1), copy, ...blocks.value.slice(index + 1)]
}

function remove(index: number) {
  blocks.value = blocks.value.filter((_, current) => current !== index)
}

async function move(index: number, direction: "up" | "down") {
  const to = direction === "up" ? index - 1 : index + 1
  blocks.value = moveItem(blocks.value, index, to)
  await nextTick()
  announcement.value = `Block moved to position ${to + 1} of ${blocks.value.length}`
  document.querySelector<HTMLButtonElement>(`[data-block-index="${to}"] [data-block-action="${direction}"]:not(:disabled)`)?.focus()
}

// A picture chosen in the editor has no resolved address until the page is
// saved and read back, so the one just obtained is kept locally and the block
// shows it straight away.
function rememberPreview({ media, url, name }: { media: any; url: string; name?: string }) {
  const base = normalizeAssets(assets.value)
  if (media?.source === "upload") {
    base.uploads[media.s3key] = url
  } else if (media?.source === "file") {
    base.files[media.fileId] = { name: name ?? "", mimeType: "", thumbnailURL: url, fileURL: url }
  }
  assets.value = base
}

function normalizeAssets(source: PageAssets): any {
  return {
    files: { ...(source?.files ?? {}) },
    collections: { ...(source?.collections ?? {}) },
    pages: { ...(source?.pages ?? {}) },
    uploads: { ...(source?.uploads ?? {}) },
  }
}

// Keep the local previews on top of what the server just resolved, so a
// picture does not blink out between the save and the next read.
function mergeAssets(fresh: PageAssets, local: PageAssets): PageAssets {
  const merged = normalizeAssets(fresh)
  const previous = normalizeAssets(local)
  merged.uploads = { ...previous.uploads, ...merged.uploads }
  merged.files = { ...previous.files, ...merged.files }
  return merged
}

// Dropping a block beside a narrower one makes it take the room that is left,
// instead of falling onto a line of its own.
function onDrop(event: any) {
  const index = event?.added?.newIndex ?? event?.moved?.newIndex
  if (index === undefined || index === null) {
    return
  }
  const sizes = blocks.value.map((block) => block.size)
  const fitted = fitToLine(sizes, index, sizes[index])
  if (fitted !== sizes[index]) {
    resize(index, fitted)
  }
}

async function save() {
  if (isSaving.value) {
    return
  }
  isSaving.value = true
  try {
    const result = await trpc.page.save.mutate({
      pageId: props.page.id,
      blocks: blocks.value.map((block) => ({ id: block.id ?? null, type: block.type, size: block.size, data: block.data })),
    })
    blocks.value = toEditorBlocks(result as PageData)
    assets.value = mergeAssets(result.assets as PageAssets, assets.value)
    saved.value = cloneDeep(blocks.value)
    if (props.collection) {
      await queryClient.invalidateQueries({ queryKey: ["collection", props.collection.id] })
    }
    await queryClient.invalidateQueries({ queryKey: ["pages", props.page.id] })
    toast.success("Page saved")
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally {
    isSaving.value = false
  }
}

function discard() {
  blocks.value = cloneDeep(saved.value)
}

function exit() {
  router.push(props.exitTo)
}

function leaveWithoutSaving() {
  confirmedLeave = true
  isLeaveDialogOpen.value = false
  router.push(props.exitTo)
}
</script>

<template>
  <div class="flex h-dvh flex-col bg-neutral-50">
    <div class="sr-only" role="status">{{ announcement }}</div>
    <header class="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
      <FilePenLine class="size-5 text-neutral-500" aria-hidden="true" />
      <h1 class="min-w-0 truncate text-sm font-semibold text-neutral-900">Editing {{ title }}</h1>
      <span v-if="isDirty" class="flex items-center gap-1.5 text-xs text-amber-700">
        <span aria-hidden="true" class="size-1.5 rounded-full bg-amber-500" />Unsaved changes
      </span>
      <span v-else class="flex items-center gap-1 text-xs text-neutral-500"><Check class="size-3.5" />Saved</span>
      <div class="ml-auto flex items-center gap-2">
        <Button type="button" variant="outline" :disabled="!isDirty || isSaving" @click="discard">Discard</Button>
        <Button type="button" :disabled="!isDirty || isSaving" @click="save">{{ isSaving ? "Saving…" : "Save" }}</Button>
        <Button type="button" variant="ghost" @click="exit"><ChevronLeft class="size-4" />Exit</Button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <aside class="w-64 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-4 max-md:hidden">
        <PageEditorLibrary @add="addBlock" />
      </aside>
      <main class="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
        <div class="mx-auto max-w-5xl rounded-md bg-white p-4 md:p-6">
          <draggable v-model="blocks" group="page-blocks" handle=".block-handle" item-key="id" :animation="150"
            class="grid grid-cols-1 gap-4 md:grid-cols-6 md:items-start" @change="onDrop">
            <template #item="{ element, index }">
              <div :class="spanClass(element.size)">
                <PageEditorBlockFrame :block="element" :index="index" :count="blocks.length"
                  @update="updateData(index, $event)" @resize="resize(index, $event)" @move="move(index, $event)"
                  @duplicate="duplicate(index)" @remove="remove(index)">
                  <PageEditorBlockContent :block="element" :page-id="page.id" :assets="assets" :collection="collection"
                    :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })"
                    @update="updateData(index, $event)" @preview="rememberPreview" />
                </PageEditorBlockFrame>
              </div>
            </template>
          </draggable>
          <p v-if="!blocks.length" class="py-16 text-center text-sm text-neutral-500">
            This page is empty. Drag a block from the left, or click one to add it.
          </p>
        </div>
      </main>
    </div>

    <AlertDialog v-model:open="isLeaveDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>Your changes to this page will be lost.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction @click="leaveWithoutSaving">Leave without saving</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
