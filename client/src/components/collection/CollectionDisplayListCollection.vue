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
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionFavoriteButton from "@/components/collection/CollectionFavoriteButton.vue"
import CollectionDropdownActions from "@/components/collection/CollectionDropdownActions.vue"
import { RouterOutput } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import {
  createColumnHelper,
  FlexRender,
  getCoreRowModel,
  useVueTable,
} from "@tanstack/vue-table"
import { EyeOff, Folder } from "lucide-vue-next"
import { computed, ref } from "vue"
import { RouteLocationRaw } from "vue-router"

type Collection = RouterOutput["collection"]["findById"]

const props = defineProps<{
  collections: Collection[]
  generateRoute: (collection: Collection) => RouteLocationRaw
  placeholder?: string | null
}>()
const globalStore = useGlobalStore()
const columnHelper = createColumnHelper<Collection>()
const hoveredRowId = ref<string | null>(null)
const openDropdownId = ref<string | null>(null)

const collections = computed(() => props.collections ?? [])
const selection = computed(() =>
  collections.value.filter((collection: Collection) =>
    globalStore.selection.some(
      (item) => item.type === "collection" && item.id === collection.id
    )
  )
)

const visibleColumns = computed(() => {
  return [
    columnHelper.display({
      id: "name",
      header: "",
    }),
    ...[
      columnHelper.accessor((row) => row.description, {
        id: "description",
        header: "Description",
      }),
      columnHelper.accessor((row) => row.numberOfFiles, {
        id: "numberOfFiles",
        header: "Files",
      }),
    ].filter(column =>
      collections.value.some(collection => {
        const value = column.accessorFn?.(collection, 0)
        return value !== undefined && value !== null && value !== ''
      })
    ),
    columnHelper.display({
      id: "actions",
      header: "",
    }),
  ]
})

function toggleGlobalSelection() {
  if (selection.value.length === collections.value.length) {
    globalStore.selection
      .filter((item) =>
        collections.value.find(
          (collection: Collection) =>
            collection.id === item.id && item.type === "collection"
        )
      )
      .forEach((item) => globalStore.removeFromSelection(item))
    return
  }

  collections.value
    .filter(
      (collection: Collection) =>
        !globalStore.selection.find(
          (item) => collection.id === item.id && item.type === "collection"
        )
    )
    .forEach((collection: Collection) =>
      globalStore.addToSelection({ type: "collection", id: collection.id })
    )
}

function isCollectionSelected(collection: Collection) {
  return globalStore.selection.some(
    (item) => item.id === collection.id && item.type === "collection"
  )
}

function handleSelection(collection: Collection) {
  if (isCollectionSelected(collection)) {
    globalStore.removeFromSelection({ id: collection.id, type: "collection" })
    return
  }
  globalStore.addToSelection({ id: collection.id, type: "collection" })
}

const table = useVueTable({
  get data() {
    return collections.value
  },
  get columns() {
    return visibleColumns.value
  },
  getCoreRowModel: getCoreRowModel(),
})

</script>

<template>
  <div>
    <table class="border-spacing-0 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-neutral-500 [&_th]:whitespace-nowrap [&_td]:text-left [&_td]:text-[13px] [&_td]:whitespace-nowrap [&_tbody_tr]:border-b [&_tbody_tr]:border-neutral-100 [&_tbody_tr:hover]:bg-neutral-50 [&_tr:hover_.visible-on-hover]:opacity-100 collection-list-collections_table w-full text-neutral-600 [&_th:not(:last-child)]:pr-5 [&_td:not(:last-child)]:pr-5 [&_th:first-child]:pr-4 [&_th:first-child]:min-w-[200px] [&_td:first-child]:pr-4 [&_td:first-child]:min-w-[200px] [&_th:last-child]:pl-4 [&_th:last-child]:pr-2 [&_td:last-child]:pl-4 [&_td:last-child]:pr-2 [&_thead]:bg-neutral-50 [&_thead]:text-neutral-500 [&_thead]:border-b [&_thead]:border-neutral-200 [&_tbody_tr.hovered]:hover:bg-neutral-100 [&_tbody_tr.hovered_.collection-list-collections\_\_actions-container]:opacity-100 [&_tbody_tr:focus-within_.collection-list-collections\_\_actions-container]:opacity-100 [@media(hover:none)]:[&_.collection-list-collections\_\_actions-container]:opacity-100">
      <thead>
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <th v-for="header in headerGroup.headers" :key="header.id" :colSpan="header.colSpan"
            class="text-neutral-500 text-sm font-normal whitespace-nowrap">
            <div v-if="header.column.id === 'name'" class="flex items-center gap-4">
              <CollectionCheckbox v-if="collections.length > 0" label="Select all" @click="toggleGlobalSelection()" :state="selection.length === collections.length
                ? 'check'
                : selection.length > 0
                  ? 'undetermined'
                  : false
                " />
              Collection Name
            </div>
            <template v-else-if="!header.isPlaceholder">
              <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
            </template>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="table.getRowModel().rows.length" v-for="row in table.getRowModel().rows" :key="row.id"
          @mouseenter="hoveredRowId = row.id" @mouseleave="hoveredRowId = null"
          :class="{ hovered: hoveredRowId === row.id || openDropdownId === row.id }"
          class="collection-list__row relative">
          <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="text-neutral-500 text-sm font-medium">
            <div v-if="cell.column.id === 'name'" class="collection-list-collections__name-container flex items-center gap-4">
              <CollectionCheckbox v-if="cell.row.original.numberOfFiles > 0" :label="`Select ${cell.row.original.name}`" @click="handleSelection(cell.row.original)"
                :class="[
                  'collection-list-collections__collection-selection',
                  isCollectionSelected(cell.row.original) &&
                  'collection-list-collections__collection-selection--selected',
                ]" :state="isCollectionSelected(cell.row.original) ? 'check' : false" />
              <div v-else class="w-[18px] h-[18px]" />

              <router-link :to="generateRoute(cell.row.original)" class="flex items-center gap-1.5 no-underline">
                <Folder class="fill-neutral-500 text-neutral-500" />
                <div class="flex items-center gap-4 text-neutral-500 text-sm">
                  {{ cell.row.original.name }}
                  <div v-if="cell.row.original.draft" class="flex items-center gap-1 text-neutral-500 font-light">
                    <EyeOff class="w-4 h-4" />
                    draft
                  </div>
                </div>
              </router-link>
            </div>
            <div v-if="cell.column.id === 'actions'" class="collection-list-collections__actions-container pr-2 flex items-center justify-end gap-2 absolute top-0 right-0 bottom-0 [background-color:inherit] opacity-0 [transition:opacity_0.2s_ease-in-out]">
              <CollectionFavoriteButton :collection="cell.row.original" />
              <CollectionDropdownActions :collection="cell.row.original"
                @update:open="(isOpen) => (openDropdownId = isOpen ? row.id : null)" />
            </div>
            <FlexRender v-else :render="cell.column.columnDef.cell" :props="cell.getContext()" />
          </td>
        </tr>
        <tr v-else>
          <td :colspan="table.getHeaderGroups()[0].headers.length">
            {{ placeholder }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
