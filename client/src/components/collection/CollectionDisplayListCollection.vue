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
import { listTableClasses, listActionsClasses } from "./listStyles"
import { collectionDisplayGroup } from "@/utils/displayPreferences"
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionFavoriteButton from "@/components/collection/CollectionFavoriteButton.vue"
import CollectionDropdownActions from "@/components/collection/CollectionDropdownActions.vue"
import { RouterOutput } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import {
  createColumnHelper,
  FlexRender,
  columnVisibilityFeature,
  tableFeatures,
  useTable,
} from "@tanstack/vue-table"
import { EyeOff, Folder } from "@lucide/vue"
import { computed, ref } from "vue"
import { RouteLocationRaw } from "vue-router"

type Collection = RouterOutput["collection"]["findById"]

const props = defineProps<{
  collections: Collection[]
  generateRoute: (collection: Collection) => RouteLocationRaw
  placeholder?: string | null
}>()
const globalStore = useGlobalStore()
const features = tableFeatures({ columnVisibilityFeature })
const columnHelper = createColumnHelper<typeof features, Collection>()
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
      (globalStore.displayDetails.asset_folder?.columns ?? collectionDisplayGroup(collections.value).defaultColumns).includes(column.id!)
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

const table = useTable({
  features,
  get data() {
    return collections.value
  },
  get columns() {
    return visibleColumns.value
  },
})

</script>

<template>
  <div class="w-full min-w-0 max-w-full overflow-x-auto">
    <table class="collection-list-collections_table" :class="listTableClasses">
      <thead>
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <th v-for="header in headerGroup.headers" :key="header.id" :colSpan="header.colSpan"
            class="text-neutral-600">
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
          class="collection-list__row group">
          <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="text-body">
            <div v-if="cell.column.id === 'name'" class="collection-list-collections__name-container flex items-center gap-4">
              <CollectionCheckbox v-if="cell.row.original.numberOfFiles > 0" :label="`Select ${cell.row.original.name}`" @click="handleSelection(cell.row.original)"
                :class="[
                  'collection-list-collections__collection-selection',
                  isCollectionSelected(cell.row.original) &&
                  'collection-list-collections__collection-selection--selected',
                ]" :state="isCollectionSelected(cell.row.original) ? 'check' : false" />
              <div v-else class="size-4 shrink-0" aria-hidden="true" />

              <router-link :to="generateRoute(cell.row.original)" class="flex items-center gap-1.5 no-underline">
                <Folder class="size-5 shrink-0 text-neutral-500" />
                <div class="flex items-center gap-4 text-neutral-600 text-body">
                  {{ cell.row.original.name }}
                  <div v-if="cell.row.original.draft" class="flex items-center gap-1 text-neutral-500 font-light">
                    <EyeOff class="w-4 h-4" />
                    draft
                  </div>
                </div>
              </router-link>
            </div>
            <div v-else-if="cell.column.id === 'actions'" class="collection-list-collections__actions-container" :class="[listActionsClasses, openDropdownId === row.id && 'opacity-100']">
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
