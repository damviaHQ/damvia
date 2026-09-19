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
import cloneDeep from "lodash/cloneDeep"
import filter from "lodash/filter"
import groupBy from "lodash/groupBy"
import map from "lodash/map"
import maxBy from "lodash/maxBy"
import minBy from "lodash/minBy"
import sortBy from "lodash/sortBy"
import sumBy from "lodash/sumBy"
import { Plus } from "@lucide/vue"
import { computed, nextTick, ref } from "vue"

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
const moveAnnouncement = ref("")

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

  moveToRow(block, row, column)
}

function moveToRow(block: Block, row: number, column: number) {
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
  return updateLayout(blocksPayload)
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

  moveToColumn(block, row, column)
}

function moveToColumn(block: Block, row: number, column: number) {
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
  return updateLayout(blocksPayload)
}

function updateLayout(blocks: { id: string; width: number; row: number; column: number }[]) {
  return trpc.page.updateLayout
    .mutate({ pageId: props.page.id, blocks })
    .then(async () => {
      if (props.collection) {
        await queryClient.invalidateQueries({
          queryKey: ["collection", props.collection.id],
        })
      }
      await queryClient.invalidateQueries({ queryKey: ["pages", props.page.id] })
    })
}

function getMoveState(rowIndex: number, columnIndex: number) {
  const columns = rows.value[rowIndex].columns
  const isAlone = columns.length === 1
  return {
    up: !isAlone || rowIndex > 0,
    down: !isAlone || rowIndex < rows.value.length - 1,
    left: columnIndex > 0,
    right: columnIndex < columns.length - 1,
  }
}

async function handleMove(block: Block, rowIndex: number, columnIndex: number, direction: "up" | "down" | "left" | "right") {
  const row = rows.value[rowIndex]
  const isAlone = row.columns.length === 1
  if (direction === "up") {
    await moveToRow(block, isAlone ? rows.value[rowIndex - 1].value : row.value, 1)
  } else if (direction === "down") {
    await moveToRow(block, isAlone ? rows.value[rowIndex + 1].value + 1 : row.value + 1, 1)
  } else if (direction === "left") {
    await moveToColumn(block, row.value, row.columns[columnIndex - 1].column)
  } else {
    await moveToColumn(block, row.value, row.columns[columnIndex + 1].column + 1)
  }

  await nextTick()
  const position = rows.value.flatMap((current) => current.columns).findIndex((current: Block) => current.id === block.id) + 1
  moveAnnouncement.value = `Block moved to position ${position}`
  const blockElement = document.querySelector(`[data-block-id="${block.id}"]`)
  const button =
    blockElement?.querySelector<HTMLButtonElement>(`[data-block-action="${direction}"]:not(:disabled)`) ??
    blockElement?.querySelector<HTMLButtonElement>(".block__action:not(:disabled)")
  button?.focus()
}
</script>

<template>
  <div class="page-editor__root flex flex-col">
    <div class="sr-only" role="status">{{ moveAnnouncement }}</div>
    <div :class="[
      'page-editor__row-dropzone h-8 [margin:8px_0] w-full [content:var(--dv-empty-content)]',
      draggingBlockId && 'page-editor__row-dropzone--active border border-dashed border-neutral-400',
      hoveredDropzone === `row-${minRowValue}` && 'page-editor__dropzone--hovered bg-neutral-200',
    ]" @drop="handleRowDrop($event, minRowValue, 1)" @dragover.prevent="hoveredDropzone = `row-${minRowValue}`"
      @dragleave="hoveredDropzone = null" />
    <template v-for="(row, rowIndex) in rows" :key="row.value">
      <div class="page-editor__row flex">
        <div :class="[
          'page-editor__col-dropzone [margin:0_8px] w-8 [content:var(--dv-empty-content)]',
          draggingBlockId && 'page-editor__col-dropzone--active border border-dashed border-neutral-400',
          hoveredDropzone ===
          `col-${row.value}-${computeColumnMinValue(row.columns)}` &&
          'page-editor__dropzone--hovered bg-neutral-200',
        ]" @drop="handleColDrop($event, row.value, computeColumnMinValue(row.columns))" @dragover.prevent="
          hoveredDropzone = `col-${row.value}-${computeColumnMinValue(row.columns)}`
          " @dragleave="hoveredDropzone = null" />
        <template v-for="(block, columnIndex) in row.columns" :key="block.id">
          <PageEditorBlock :class="[
            'cursor-grab border border-transparent border-spacing-1 p-[0.5rem]',
            { 'opacity-50': draggingBlockId === block.id },
          ]" :page="page" :block="block" :dragging-block-id="draggingBlockId" :collection="$props.collection"
            :style="getBlockStyle(row.columns, block)" :generate-route="() => ({})" draggable="true" @dragover.prevent
            @dragstart="handleDragStart($event, block)" @dragend="draggingBlockId = undefined" edit-mode
            :can-move="getMoveState(rowIndex, columnIndex)"
            @move="handleMove(block, rowIndex, columnIndex, $event)" />
          <div :class="[
            'page-editor__col-dropzone [margin:0_8px] w-8 [content:var(--dv-empty-content)]',
            draggingBlockId && 'page-editor__col-dropzone--active border border-dashed border-neutral-400',
            hoveredDropzone === `col-${row.value}-${block.column + 1}` &&
            'page-editor__dropzone--hovered bg-neutral-200',
          ]" @drop="handleColDrop($event, row.value, block.column + 1)"
            @dragover.prevent="hoveredDropzone = `col-${row.value}-${block.column + 1}`"
            @dragleave="hoveredDropzone = null" />
        </template>
      </div>
      <div :class="[
        'page-editor__row-dropzone h-8 [margin:8px_0] w-full [content:var(--dv-empty-content)]',
        draggingBlockId && 'page-editor__row-dropzone--active border border-dashed border-neutral-400',
        hoveredDropzone === `row-${row.value + 1}` && 'page-editor__dropzone--hovered bg-neutral-200',
      ]" @drop="handleRowDrop($event, row.value + 1, 1)" @dragover.prevent="hoveredDropzone = `row-${row.value + 1}`"
        @dragleave="hoveredDropzone = null" />
    </template>
    <div class="mx-9">
      <button type="button"
        aria-label="Add content block"
        class="editor__plus-button flex items-center justify-center w-full border border-dashed border-neutral-400 rounded-md cursor-pointer p-1"
        @click="isBlockSelectorOpen = true">
        <Plus class="w-6 h-6 text-neutral-500" />
      </button>
    </div>
  </div>

  <PageEditorDialog v-model="isBlockSelectorOpen" :page="page" :collection="$props.collection"
    :max-row-value="maxRowValue" />
</template>
