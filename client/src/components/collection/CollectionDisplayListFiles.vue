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
import ThumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionModalGallery from "@/components/collection/CollectionModalDownloadUnique.vue"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { getFileExtension } from "@/utils/fileExtention.ts"
import { formatFileSize } from "@/utils/fileSize.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import {
  createColumnHelper,
  FlexRender,
  getCoreRowModel,
  useVueTable,
} from "@tanstack/vue-table"
import dayjs from "dayjs"
import { Star, StarOff, Trash2 } from "lucide-vue-next"
import { computed, ref } from "vue"

type File = RouterOutput["collection"]["findById"]["files"][number]

const props = defineProps<{
  files?: File[]
  collection?: RouterOutput["collection"]["findById"]
  placeholder?: string | null
}>()
const toast = useGlobalToast()
const globalStore = useGlobalStore()
const queryClient = useQueryClient()
const currentCollectionFileId = ref<string | null>(null)
const hoveredRowId = ref<string | null>(null)
const copiedCellId = ref<string | null>(null)

const haveAccessToFavorites = globalStore.user?.role !== "guest"
const { data: favorites } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => trpc.favorite.list.query(),
})

const removable = computed(
  () => props.collection?.canEdit && !props.collection.synchronized
)
const files = computed(() => props.files ?? props.collection?.files ?? [])
const selection = computed(() =>
  files.value.filter((file: File) =>
    globalStore.selection.some((item) => item.type === "file" && item.id === file.id)
  )
)

function isFileSelected(file: File) {
  return globalStore.selection.some(
    (selection) => selection.type === "file" && selection.id === file.id
  )
}

function isFavorite(file: File) {
  return favorites.value?.some((favorite) => favorite.id === file.id)
}

function toggleGlobalSelection() {
  if (selection.value.length === files.value.length) {
    globalStore.selection
      .filter((item) =>
        files.value.find((file: File) => file.id === item.id && item.type === "file")
      )
      .forEach((item) => globalStore.removeFromSelection(item))
    return
  }

  files.value
    .filter(
      (file: File) =>
        !globalStore.selection.find((item) => file.id === item.id && item.type === "file")
    )
    .forEach((file: File) => globalStore.addToSelection({ type: "file", id: file.id }))
}

function handleSelection(file: File) {
  if (isFileSelected(file)) {
    globalStore.removeFromSelection({ id: file.id, type: "file" })
    return
  }
  globalStore.addToSelection({ id: file.id, type: "file" })
}

async function addToFavorite(file: File) {
  try {
    await trpc.favorite.add.mutate({ collectionFileId: file.id })
    await queryClient.invalidateQueries({ queryKey: ["favorites"] })
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function removeFromFavorite(file: File) {
  try {
    await trpc.favorite.remove.mutate({ collectionFileId: file.id })
    await queryClient.invalidateQueries({ queryKey: ["favorites"] })
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function remove(file: File) {
  if (!removable) {
    return
  }

  try {
    if (!confirm("Are you sure to delete this file?")) {
      return
    }
    await trpc.collection.removeFiles.mutate([file.id])
    await queryClient.invalidateQueries({
      queryKey: ["collection", props.collection.id],
    })
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function copyToClipboard(text: string, cellId: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedCellId.value = cellId
    setTimeout(() => {
      copiedCellId.value = null
    }, 1500)
  } catch (error) {
    console.error("Failed to copy to clipboard:", error)
  }
}

const globalAssetType = files.value.every(
  (f: File) => f.assetTypeId === files.value[0].assetTypeId
)
  ? files.value[0]?.assetType
  : null
const listDisplayItems = globalAssetType?.listDisplayItems ?? []
const columnHelper = createColumnHelper<File>()
const columns = [
  columnHelper.display({
    id: "name",
    header: "",
  }),
  columnHelper.accessor((row) => formatFileSize(row.size), {
    id: "size",
    header: "Size",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor(
    (row) =>
      row.dimensions.height || row.dimensions.width
        ? `${row.dimensions.width ?? "?"}x${row.dimensions.height ?? "?"}`
        : "",
    {
      id: "dimensions",
      header: "Dimensions",
      cell: (info) => info.getValue(),
    }
  ),
  columnHelper.accessor((row) => dayjs(row.updatedAt).format("DD/MM/YYYY"), {
    id: "updated_at",
    header: "Updated at",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => getFileExtension(row.name), {
    id: "format",
    header: "Format",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => row.license?.name, {
    id: "license",
    header: "License",
    cell: (info) => info.getValue(),
    enableHiding: true,
  }),
  ...(globalAssetType?.productAttributes.map((attribute: any) =>
    columnHelper.accessor(
      (row) =>
        row.product?.attributes?.find((current: any) => current.id === attribute.id)
          ?.value,
      {
        id: `product_attribute.${attribute.id}`,
        header: attribute.displayName || attribute.name,
        cell: (info) => info.getValue(),
        enableHiding: true,
      }
    )
  ) ?? []),
  columnHelper.display({
    id: "actions",
    header: "",
  }),
]

const getVisibleColumns = computed(() => {
  return columns.filter(column => {
    if (!column.accessorFn) return true
    return files.value.some((file: File) => column.accessorFn!(file, 0) != null && column.accessorFn!(file, 0) !== '')
  })
})

const table = useVueTable<File>({
  get data() {
    return files.value
  },
  columns: getVisibleColumns.value,
  getCoreRowModel: getCoreRowModel(),
  initialState: {
    columnOrder: ["name", ...listDisplayItems, "actions"],
    columnVisibility: Object.fromEntries(
      getVisibleColumns.value.map((column) => [
        column.id,
        ["name", "actions"].includes(column.id) || listDisplayItems.includes(column.id),
      ])
    ),
  },
})
</script>

<template>
  <div class="collection-list-files_table__wrapper w-full overflow-x-auto relative text-neutral-600">
    <table class="border-spacing-0 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-neutral-500 [&_th]:whitespace-nowrap [&_td]:text-left [&_td]:text-[13px] [&_td]:whitespace-nowrap [&_tbody_tr]:border-b [&_tbody_tr]:border-neutral-100 [&_tbody_tr:hover]:bg-neutral-50 [&_tr:hover_.visible-on-hover]:opacity-100 [&_tr:focus-within_.visible-on-hover]:opacity-100 [@media(hover:none)]:[&_.visible-on-hover]:opacity-100 collection-list-files_table w-full text-neutral-600 [&_th]:py-3 [&_th]:[min-width:80px] [&_td]:py-3 [&_td]:[min-width:80px] [&_th:not(:last-child)]:pr-5 [&_td:not(:last-child)]:pr-5 [&_th:first-child]:pr-5 [&_td:first-child]:pr-5 [&_th:last-child]:pl-4 [&_th:last-child]:pr-2 [&_th:last-child]:min-w-[100px] [&_td:last-child]:pl-4 [&_td:last-child]:pr-2 [&_td:last-child]:min-w-[100px] [&_thead]:bg-neutral-50 [&_thead]:text-neutral-500 [&_thead]:border-b [&_thead]:border-neutral-200 [&_tbody_tr:hover]:hover:bg-neutral-100">
      <thead>
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <th v-for="header in headerGroup.headers" :key="header.id" :colSpan="header.colSpan"
            class="text-neutral-500 text-sm font-normal whitespace-nowrap">
            <div v-if="header.column.id === 'name'" class="flex items-center gap-4">
              <CollectionCheckbox v-if="files.length > 0" label="Select all" @click="toggleGlobalSelection()" :state="selection.length === files.length
                ? 'check'
                : selection.length > 0
                  ? 'undetermined'
                  : false
                " />
              <div>File</div>
            </div>
            <FlexRender v-else-if="!header.isPlaceholder" :render="header.column.columnDef.header"
              :props="header.getContext()" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="table.getRowModel().rows.length" v-for="row in table.getRowModel().rows" :key="row.id"
          @mouseenter="hoveredRowId = row.id" @mouseleave="hoveredRowId = null" class="relative">
          <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="text-neutral-500 text-sm font-normal">
            <div v-if="cell.column.id === 'name'" class="flex flex-row items-center gap-4">
              <CollectionCheckbox :label="`Select ${cell.row.original.name}`" @click="handleSelection(cell.row.original)" :class="[
                'collection-list-files__file-selection',
                isFileSelected(cell.row.original) &&
                'collection-list-files__file-selection--selected',
              ]" :state="isFileSelected(cell.row.original) ? 'check' : false" />

              <div class="collection-list__file-wrapper flex items-center gap-4">
                <button type="button" :aria-label="`Preview ${cell.row.original.name}`" class="flex shrink-0 cursor-pointer"
                  @click="currentCollectionFileId = row.original.id">
                  <img v-if="cell.row.original.thumbnailURL" v-lazy="cell.row.original.thumbnailURL"
                    :src="cell.row.original.thumbnailURL" alt=""
                    class="w-20 min-w-20 h-12 object-contain bg-neutral-100" />
                  <thumbnail-placeholder v-else aria-hidden="true"
                    class="w-20 min-w-20 h-12 fill-neutral-600 bg-neutral-100" />
                </button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="relative">
                        <button
                          ref="filenameRef"
                          type="button"
                          :aria-label="`Copy ${cell.row.original.name}`"
                          class="collection-list-files__filename block max-w-[400px] truncate whitespace-nowrap overflow-hidden text-ellipsis text-left cursor-pointer"
                          @click.stop="copyToClipboard(cell.row.original.name, `${cell.row.id}-filename`)"
                        >
                          {{ cell.row.original.name }}
                        </button>
                        <div v-if="copiedCellId === `${cell.row.id}-filename`"
                             class="absolute -top-8 left-0 text-xs text-neutral-500 bg-white px-2 py-1 rounded shadow-xs border border-neutral-200 z-20 copied-indicator animate-in fade-in-0 duration-150">
                          copied
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent v-if="cell.row.original.name.length > 50" class="max-w-sm">
                      <p class="whitespace-pre-wrap break-words">{{ cell.row.original.name }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div v-if="cell.column.id === 'actions'" class="actions-cell top-0 right-0 bottom-0 [background-color:inherit] [z-index:1] flex items-center">
              <div class="collection-list-files__actions-container flex items-center justify-end [background-color:inherit] gap-2">
                <template v-if="haveAccessToFavorites">
                  <div v-if="isFavorite(cell.row.original)" class="favorite-button-container relative inline-flex items-center justify-center w-6 h-6 [&:hover_.file-is-favorite]:opacity-0 [&:hover_.star-off-button]:opacity-100">
                    <Button @click="removeFromFavorite(cell.row.original)" type="button" variant="ghost" size="icon"
                      :aria-label="`Remove ${cell.row.original.name} from favorites`"
                      class="collection-list-files__button border-0 [background:initial] opacity-0 [transition:opacity_0.2s_ease-in-out,_color_0.2s_ease-in-out] flex items-center justify-center w-6 h-6 [&.visible-on-hover]:opacity-0 [&.file-is-favorite]:opacity-100 file-is-favorite">
                      <Star class="w-5 h-5 text-[var(--dv-selection-color)] hover:text-neutral-800" />
                    </Button>
                    <button @click="removeFromFavorite(cell.row.original)" type="button" tabindex="-1" aria-hidden="true"
                      class="collection-list-files__button border-0 [background:initial] opacity-0 [transition:opacity_0.2s_ease-in-out,_color_0.2s_ease-in-out] flex items-center justify-center w-6 h-6 [&.visible-on-hover]:opacity-0 [&.file-is-favorite]:opacity-100 star-off-button absolute top-0 left-0 opacity-0 [transition:opacity_0.2s_ease-in-out] w-full h-full">
                      <StarOff class="w-5 h-5 text-[var(--dv-selection-color)] hover:text-neutral-800" />
                    </button>
                  </div>
                  <button v-else @click="addToFavorite(cell.row.original)" type="button"
                    :aria-label="`Add ${cell.row.original.name} to favorites`"
                    class="collection-list-files__button border-0 [background:initial] opacity-0 [transition:opacity_0.2s_ease-in-out,_color_0.2s_ease-in-out] flex items-center justify-center w-6 h-6 [&.visible-on-hover]:opacity-0 [&.file-is-favorite]:opacity-100 visible-on-hover favorite-hover">
                    <Star class="w-5 h-5 text-[var(--dv-selection-color)] hover:text-neutral-800" />
                  </button>
                </template>
                <Button v-if="removable" @click="remove(cell.row.original)" type="button" variant="ghost" size="icon"
                  :aria-label="`Remove ${cell.row.original.name} from collection`"
                  class="collection-list-files__button border-0 [background:initial] opacity-0 [transition:opacity_0.2s_ease-in-out,_color_0.2s_ease-in-out] flex items-center justify-center w-6 h-6 [&.visible-on-hover]:opacity-0 [&.file-is-favorite]:opacity-100 visible-on-hover">
                  <Trash2 class="w-5 h-5 text-[var(--dv-selection-color)] hover:text-neutral-800" />
                </Button>
              </div>
            </div>
            <TooltipProvider v-else-if="cell.column.id !== 'actions'">
              <Tooltip>
                <TooltipTrigger as-child>
                  <div class="relative">
                    <button
                      type="button"
                      :aria-label="`Copy ${cell.getValue() ?? ''}`"
                      class="block truncate whitespace-nowrap overflow-hidden text-ellipsis max-w-xs text-left cursor-pointer"
                      @click="copyToClipboard(String(cell.getValue() || ''), `${cell.row.id}-${cell.column.id}`)"
                    >
                      {{ cell.getValue() }}
                    </button>
                    <div v-if="copiedCellId === `${cell.row.id}-${cell.column.id}`"
                         class="absolute -top-8 left-0 text-xs text-neutral-500 bg-white px-2 py-1 rounded shadow-xs border border-neutral-200 z-20 copied-indicator animate-in fade-in-0 duration-150">
                      copied
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent v-if="String(cell.getValue() || '').length > 30" class="max-w-sm">
                  <p class="whitespace-pre-wrap break-words">{{ cell.getValue() }}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </td>
        </tr>
        <tr v-else>
          <td :colspan="table.getHeaderGroups()[0].headers.length">
            {{ placeholder }}
          </td>
        </tr>
      </tbody>
    </table>
    <span class="sr-only" role="status" aria-live="polite">{{ copiedCellId ? 'Copied to clipboard' : '' }}</span>
  </div>
  <CollectionModalGallery v-model="currentCollectionFileId" :collection="collection" :files="$props.files" />
</template>
