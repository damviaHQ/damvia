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
import PageEditorBlock from "@/components/page-editor/PageEditorBlock.vue"
import PageEditorDialog from "@/components/page-editor/PageEditorDialog.vue"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import { cloneDeep, filter, groupBy, map, maxBy, minBy, sortBy, sumBy } from "lodash"
import { Plus } from "lucide-vue-next"
import { computed, ref } from "vue"

export type Page = RouterOutput["collection"]["findById"]["page"]
export type Collection = RouterOutput["collection"]["findById"]
export type BlockType =
  | "collections"
  | "files"
  | "text"
  | "image"
  | "video"
  | "last_files"
export type Block =
  | {
    id: string
    pageId: string
    width: number
    row: number
    column: number
    type: "collections"
    data?: { layout?: string; title?: string; collectionsId?: string[] }
  }
  | {
    id: string
    pageId: string
    width: number
    row: number
    column: number
    type: "files"
    data?: { layout?: string; title?: string; collectionId?: string }
  }
  | {
    id: string
    pageId: string
    width: number
    row: number
    column: number
    type: "last_files"
    data?: { layout?: string; title?: string }
  }
  | {
    id: string
    pageId: string
    width: number
    row: number
    column: number
    type: "text"
    data: string
  }
  | {
    id: string
    pageId: string
    width: number
    row: number
    column: number
    type: "image"
    data: { url?: string; presignedUrl: string; external?: boolean }
  }
  | {
    id: string
    pageId: string
    width: number
    row: number
    column: number
    type: "video"
    data: { presignedUrl: string }
  }

const props = defineProps<{ page: Page; collection?: Collection }>()
const queryClient = useQueryClient()
const isBlockSelectorOpen = ref(false)
const rows = computed(() => {
  return sortBy(
    Object.entries(groupBy(props.page.blocks ?? [], (block: Block) => block.row)),
    ([value]: [string]) => parseInt(value, 10)
  ).map(([value, blocks]: any) => ({
    value: parseInt(value, 10),
    columns: sortBy(blocks, "column"),
  }))
})
const minRowValue = computed(
  () => minBy(props.page.blocks, (block: Block) => block.row)?.row ?? 0
)
const maxRowValue = computed(
  () => maxBy(props.page.blocks, (block: Block) => block.row)?.row ?? 0
)
const draggingBlockId = ref<string | undefined>(undefined)
const hoveredDropzone = ref<string | null>(null)

function getBlockStyle(blocks: Block[], block: Block) {
  return {
    width: `${(block.width / sumBy(blocks, "width")) * 100}%`,
    resize: "horizontal",
  }
}

function handleDragStart(event: DragEvent, block: Block) {
  event.dataTransfer?.setData("application/json", JSON.stringify(block))
  draggingBlockId.value = block.id

  if (event.target instanceof HTMLElement) {
    const rect = event.target.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const scaleFactor = 0.4
    const container = document.createElement("div")
    container.style.width = `${width}px`
    container.style.height = `${height}px`
    container.style.overflow = "hidden"
    const clone = event.target.cloneNode(true) as HTMLElement
    clone.style.transform = `scale(${scaleFactor})`
    clone.style.transformOrigin = "top left"
    clone.style.width = `${width / scaleFactor}px`
    clone.style.height = `${height / scaleFactor}px`
    container.appendChild(clone)
    document.body.appendChild(container)
    event.dataTransfer?.setDragImage(container, 0, 0)

    setTimeout(() => {
      document.body.removeChild(container)
    }, 0)
  }
}

function computeColumnMinValue(blocks: Block[]) {
  return minBy(blocks, (block) => block.column)?.column ?? 0
}

function handleRowDrop(event: DragEvent, row: number, column: number) {
  const data = event.dataTransfer?.getData("application/json")
  if (!data) {
    return
  }

  const block = JSON.parse(data) as Block
  hoveredDropzone.value = null
  draggingBlockId.value = undefined
  if (block.row === row && block.column === column) {
    return
  }

  const pageBlocks = filter(
    cloneDeep(props.page.blocks ?? []),
    (current) => current.id !== block.id
  )
  const blocksPayload = [
    { id: block.id, width: 100, row, column },
    ...map(pageBlocks, (current) => ({
      id: current.id,
      width: current.row === block.row || current.row === row ? 100 : current.width,
      column: current.column,
      row: current.row >= row ? current.row + 1 : current.row,
    })),
  ]
  trpc.page.updateLayout
    .mutate({ pageId: props.page.id, blocks: blocksPayload })
    .then(async () => {
      if (props.collection) {
        await queryClient.invalidateQueries({
          queryKey: ["collection", props.collection.id],
        })
      }
      await queryClient.invalidateQueries({ queryKey: ["pages", props.page.id] })
    })
}

function handleColDrop(event: DragEvent, row: number, column: number) {
  const data = event.dataTransfer?.getData("application/json")
  if (!data) {
    return
  }

  const block = JSON.parse(data) as Block
  hoveredDropzone.value = null
  draggingBlockId.value = undefined
  if (block.row === row && block.column === column) {
    return
  }

  const pageBlocks = filter(
    cloneDeep(props.page.blocks ?? []),
    (current) => current.id !== block.id
  )
  const blocksPayload = [
    { id: block.id, width: 100, row, column },
    ...map(pageBlocks, (current) => ({
      id: current.id,
      width: current.row === block.row || current.row === row ? 100 : current.width,
      column: current.column >= column ? current.column + 1 : current.column,
      row: current.row,
    })),
  ]
  trpc.page.updateLayout
    .mutate({ pageId: props.page.id, blocks: blocksPayload })
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
  <div class="page-editor__root">
    <div :class="[
      'page-editor__row-dropzone',
      draggingBlockId && 'page-editor__row-dropzone--active',
      hoveredDropzone === `row-${minRowValue}` && 'page-editor__dropzone--hovered',
    ]" @drop="handleRowDrop($event, minRowValue, 1)" @dragover.prevent="hoveredDropzone = `row-${minRowValue}`"
      @dragleave="hoveredDropzone = null" />
    <template v-for="row in rows" :key="row.value">
      <div class="page-editor__row">
        <div :class="[
          'page-editor__col-dropzone',
          draggingBlockId && 'page-editor__col-dropzone--active',
          hoveredDropzone ===
          `col-${row.value}-${computeColumnMinValue(row.columns)}` &&
          'page-editor__dropzone--hovered',
        ]" @drop="handleColDrop($event, row.value, computeColumnMinValue(row.columns))" @dragover.prevent="
          hoveredDropzone = `col-${row.value}-${computeColumnMinValue(row.columns)}`
          " @dragleave="hoveredDropzone = null" />
        <template v-for="block in row.columns" :key="block.id">
          <PageEditorBlock :class="[
            'cursor-grab border border-transparent border-spacing-1 p-[0.5rem]',
            { 'opacity-50': draggingBlockId === block.id },
          ]" :page="page" :block="block" :dragging-block-id="draggingBlockId" :collection="$props.collection"
            :style="getBlockStyle(row.columns, block)" :generate-route="() => ({})" draggable="true" @dragover.prevent
            @dragstart="handleDragStart($event, block)" @dragend="draggingBlockId = undefined" edit-mode />
          <div :class="[
            'page-editor__col-dropzone',
            draggingBlockId && 'page-editor__col-dropzone--active',
            hoveredDropzone === `col-${row.value}-${block.column + 1}` &&
            'page-editor__dropzone--hovered',
          ]" @drop="handleColDrop($event, row.value, block.column + 1)"
            @dragover.prevent="hoveredDropzone = `col-${row.value}-${block.column + 1}`"
            @dragleave="hoveredDropzone = null" />
        </template>
      </div>
      <div :class="[
        'page-editor__row-dropzone',
        draggingBlockId && 'page-editor__row-dropzone--active',
        hoveredDropzone === `row-${row.value + 1}` && 'page-editor__dropzone--hovered',
      ]" @drop="handleRowDrop($event, row.value + 1, 1)" @dragover.prevent="hoveredDropzone = `row-${row.value + 1}`"
        @dragleave="hoveredDropzone = null" />
    </template>
    <div class="mx-9">
      <button type="button"
        class="editor__plus-button flex items-center justify-center w-full border border-dashed border-neutral-400 rounded-md cursor-pointer p-1"
        @click="isBlockSelectorOpen = true">
        <Plus class="w-6 h-6 text-neutral-400" />
      </button>
    </div>
  </div>

  <PageEditorDialog v-model="isBlockSelectorOpen" :page="page" :collection="$props.collection"
    :max-row-value="maxRowValue" />
</template>

<style scoped>
.page-editor__root {
  display: flex;
  flex-direction: column;
}

.page-editor__row {
  display: flex;
}

.page-editor__col-dropzone {
  margin: 0 8px;
  width: 32px;
  content: " ";
}

.page-editor__col-dropzone--active {
  @apply border border-dashed border-neutral-400;
}

.page-editor__col-dropzone--hovered {
  @apply bg-neutral-100;
}

.page-editor__row-dropzone {
  height: 32px;
  margin: 8px 0;
  width: 100%;
  content: " ";
}

.page-editor__row-dropzone--active {
  @apply border border-dashed border-neutral-400;
}

.page-editor__row-dropzone--hovered {
  @apply bg-neutral-100;
}

.page-editor__dropzone--hovered {
  @apply bg-neutral-200;
}
</style>
