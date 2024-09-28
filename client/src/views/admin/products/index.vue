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
import Loader from "@/components/Loader.vue"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Pagination,
  PaginationEllipsis,
  PaginationFirst,
  PaginationLast,
  PaginationList,
  PaginationListItem,
  PaginationNext,
  PaginationPrev,
} from "@/components/ui/pagination"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { trpc } from "@/services/server.ts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { getCoreRowModel, useVueTable } from "@tanstack/vue-table"
import { onClickOutside } from "@vueuse/core"
import {
  Blocks,
  EllipsisVertical,
  FileUp,
  Filter,
  FilterX,
  PackageX,
} from "lucide-vue-next"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"

const toast = useGlobalToast()
const sortingOrder = ref<{ [key: string]: "asc" | "desc" | null }>({})
const currentPage = ref(1)
const pageSize = ref(200)
const queryClient = useQueryClient()
const isDeleting = ref(false)
const editingCell = ref<{ row: number; column: string } | null>(null)
const cellValue = ref<string>("")
const originalCellValue = ref<string>("")
const editingCellRef = ref<HTMLElement | null>(null)
const isEditing = ref(false)
const isSaving = ref(false)
const inputElement = ref<HTMLElement | null>(null)
const columnFilters = ref<{ [key: string]: string }>({})
const activeFilter = ref<{ column: string; value: string } | null>(null)
const isDropdownOpen = ref(false)
const enlargedImage = ref<{ src: string; top: number; left: number } | null>(null)

const { status, data, error, refetch } = useQuery({
  queryKey: ["products", currentPage, pageSize, activeFilter],
  queryFn: () =>
    trpc.pim.listProducts.query({
      page: currentPage.value,
      size: pageSize.value,
      columnFilter: activeFilter.value || undefined,
    }),
})

const totalItems = computed(() => data.value?.total || 0)
const totalPages = computed(() => {
  return data.value ? Math.ceil(data.value.total / pageSize.value) : 1
})
const sortedData = computed(() => {
  let sorted = [...(data.value?.products || [])].map((item, index) => ({
    ...item,
    originalIndex: index,
  }))
  for (const [key, order] of Object.entries(sortingOrder.value)) {
    if (order) {
      sorted.sort((a, b) => {
        const aValue = getNestedValue(a, key)
        const bValue = getNestedValue(b, key)
        if (aValue < bValue) return order === "asc" ? -1 : 1
        if (aValue > bValue) return order === "asc" ? 1 : -1
        return a.originalIndex - b.originalIndex
      })
    }
  }
  return sorted
})

const tableColumns = computed(() => {
  if (data.value && data.value.products.length > 0) {
    const primaryKey = data.value.products[0].primaryKeyName
    return [
      {
        header: "Picture",
        accessorKey: "thumbnailURL",
        cell: (info) => `<img src="${info.getValue()}" alt="Product Image" />`,
      },
      {
        header: data.value.products[0].primaryKeyName,
        accessorKey: "productKey",
        sortable: true,
      },
      ...Object.keys(data.value.products[0].metaData)
        .filter((key) => key !== primaryKey)
        .map((key) => ({
          header: key,
          accessorKey: `metaData.${key}`,
          sortable: true,
        })),
    ]
  }
  return []
})

const clearEditingState = () => {
  editingCell.value = null
  isEditing.value = false
  cellValue.value = ""
  originalCellValue.value = ""
}

watch(currentPage, () => {
  clearEditingState()
  refetch()
})

function changePage(newPage: number) {
  clearEditingState()
  currentPage.value = newPage
}

function toggleSorting(column: string) {
  if (!sortingOrder.value[column]) {
    sortingOrder.value[column] = "asc"
  } else if (sortingOrder.value[column] === "asc") {
    sortingOrder.value[column] = "desc"
  } else {
    sortingOrder.value[column] = null
  }
}

const table = useVueTable({
  get data() {
    return sortedData.value || []
  },
  get columns() {
    return tableColumns.value
  },
  getCoreRowModel: getCoreRowModel(),
})

const removeAllProducts = useMutation({
  mutationFn: () => {
    if (confirm("Are you sure you want to remove all products?")) {
      return trpc.pim.removeAllProducts.mutate()
    }
    return Promise.reject(new Error("Operation cancelled by user."))
  },
  onMutate: () => {
    isDeleting.value = true
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["products"] })
    toast.success("All products removed successfully")
  },
  onSettled: () => {
    isDeleting.value = false
  },
})

function getNestedValue(obj: any, path: string) {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj)
}

function handleCellClick(rowIndex: number, column: string) {
  if (!isEditableCell(column)) return
  editingCell.value = { row: rowIndex, column }
  cellValue.value = getNestedValue(sortedData.value[rowIndex], column)
  originalCellValue.value = cellValue.value
  isEditing.value = false
  nextTick(() => {
    if (editingCellRef.value) {
      const cellElement = document.getElementById(`cell-${rowIndex}-${column}`)
      if (cellElement) {
        const rect = cellElement.getBoundingClientRect()
        const tableRect = cellElement.closest("table")?.getBoundingClientRect()

        if (tableRect) {
          const top = rect.top - tableRect.top
          const left = rect.left - tableRect.left

          editingCellRef.value.style.top = `${top}px`
          editingCellRef.value.style.left = `${left}px`
          editingCellRef.value.style.width = `${rect.width}px`
          editingCellRef.value.style.minHeight = `${rect.height}px`
        }
      }
    }
  })
}

function handleCellDblClick(rowIndex: number, column: string) {
  if (isSaving.value || !isEditableCell(column)) return
  handleCellClick(rowIndex, column)
  isEditing.value = true
  nextTick(() => {
    if (editingCellRef.value) {
      const currentWidth = parseFloat(editingCellRef.value.style.width)
      const currentHeight = parseFloat(editingCellRef.value.style.minHeight)

      editingCellRef.value.style.width = `${currentWidth * 1.5}px`
      editingCellRef.value.style.minHeight = `${currentHeight * 2}px`
      editingCellRef.value.style.maxHeight = "400px"
      editingCellRef.value.focus()

      const range = document.createRange()
      range.selectNodeContents(editingCellRef.value)
      range.collapse(false)

      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  })
}

async function saveCellValue() {
  if (!editingCell.value || isSaving.value || !isEditing.value) return
  if (cellValue.value === originalCellValue.value) {
    cancelEditing()
    return
  }

  const { row, column } = editingCell.value
  const product = sortedData.value[row]
  const metaDataKey = column.replace("metaData.", "")
  const newValue = cellValue.value

  try {
    isSaving.value = true
    await trpc.pim.updateProduct.mutate({
      id: product.id,
      metaData: {
        ...product.metaData,
        [metaDataKey]: newValue,
      },
    })
    toast.success("Product updated successfully")
  } catch (error) {
    console.error("Error updating product:", error)
    toast.error("Failed to update product")
  } finally {
    isSaving.value = false
    editingCell.value = null
    isEditing.value = false
    queryClient.invalidateQueries({ queryKey: ["products"] })
  }
}

function cancelEditing() {
  editingCell.value = null
  isEditing.value = false
  cellValue.value = originalCellValue.value
}

watch(editingCell, () => {
  inputElement.value = editingCell.value
    ? document.getElementById(
      `input-${editingCell.value.row}-${editingCell.value.column}`
    )
    : null
})

onClickOutside(inputElement, (event) => {
  if (editingCell.value && !event.target.contains(inputElement.value)) {
    cancelEditing()
  }
})

function isEditableCell(accessorKey: string) {
  return accessorKey !== "thumbnailURL" && accessorKey !== "productKey"
}

function applyColumnFilter(column: string, value: string) {
  columnFilters.value[column] = value
  clearEditingState()
}

function handleFilterKeydown(event: KeyboardEvent, column: string) {
  if (event.key === "Enter") {
    activeFilter.value = { column, value: columnFilters.value[column] || "" }
    currentPage.value = 1
    refetch()
    clearEditingState()
  }
}

const showFilters = ref(false)

function toggleFilters() {
  showFilters.value = !showFilters.value
}

function clearFilters() {
  columnFilters.value = {}
  activeFilter.value = null
  refetch()
}

function handleImageClick(event: MouseEvent, src: string) {
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  enlargedImage.value = {
    src,
    top: rect.top,
    left: rect.left,
  }
}

function closeEnlargedImage(event: MouseEvent) {
  if (enlargedImage.value && !event.target.closest(".enlarged-image")) {
    enlargedImage.value = null
  }
}

onMounted(() => {
  document.addEventListener("click", closeEnlargedImage)
})

onUnmounted(() => {
  document.removeEventListener("click", closeEnlargedImage)
})
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="h-full overflow-auto flex flex-col">
    <div class="pages__top flex items-center justify-between gap-5 px-8 pt-6 pb-2">
      <div class="flex items-center gap-5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage> Products </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <router-link :to="{ name: 'admin-product-attributes' }">
          <Button type="button" variant="link" class="flex px-0 gap-2 text-neutral-600 hover:text-neutral-900">
            <Blocks class="w-5 h-5" />
            Manage Attributes
          </Button>
        </router-link>
        <Button variant="link" type="button" @click="toggleFilters"
          class="flex px-0 gap-2 text-neutral-600 hover:text-neutral-900">
          <Filter class="w-5 h-5" />
          {{ showFilters ? "Hide Filters" : "Show Filters" }}
        </Button>
        <Button v-if="Object.keys(columnFilters).length > 0" variant="link" type="button" @click="clearFilters"
          class="flex px-0 gap-2 text-neutral-600 hover:text-neutral-900">
          <FilterX class="w-5 h-5" />
          Clear Filters
        </Button>
        <router-link :to="{ name: 'admin-product-import' }">
          <Button type="button" variant="link"
            class="flex p</router-link>x-0 gap-2 text-neutral-600 hover:text-neutral-900">
            <FileUp class="w-5 h-5" />
            Import Products from CSV
          </Button>
        </router-link>
        <DropdownMenu v-model:open="isDropdownOpen">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <EllipsisVertical class="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <Button variant="link" class="flex px-0 gap-2 text-red-500 hover:text-red-600"
                @click="removeAllProducts.mutate">
                <PackageX class="mr-2 h-4 w-4" />
                <span>Remove All Products</span>
              </Button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Pagination v-if="data && data.products.length" :total="totalItems" :sibling-count="1" show-edges
        :default-page="currentPage" v-model:page="currentPage" :items-per-page="pageSize">
        <PaginationList v-slot="{ items }" class="flex items-center gap-1">
          <PaginationFirst @click="changePage(1)" />
          <PaginationPrev @click="changePage(currentPage - 1)" />
          <template v-for="(item, index) in items">
            <PaginationListItem v-if="item.type === 'page'" :key="index" :value="item.value" as-child>
              <Button class="w-10 h-10 p-0" :variant="item.value === currentPage ? 'default' : 'link'"
                @click="changePage(item.value)">
                {{ item.value }}
              </Button>
            </PaginationListItem>
            <PaginationEllipsis v-else :key="item.type" :index="index" />
          </template>

          <PaginationNext @click="changePage(currentPage + 1)" />
          <PaginationLast @click="changePage(totalPages)" />
        </PaginationList>
      </Pagination>
    </div>
    <div class="w-full overflow-x-auto flex-grow">
      <div class="relative">
        <table class="comparison-table h-full">
          <thead>
            <tr>
              <th v-for="column in tableColumns" :key="column.accessorKey">
                <div class="flex items-center justify-between">
                  <span @click="toggleSorting(column.accessorKey)">
                    {{ column.header }}
                    <span v-if="sortingOrder[column.accessorKey] === 'asc'">▲</span>
                    <span v-if="sortingOrder[column.accessorKey] === 'desc'">▼</span>
                  </span>
                </div>
              </th>
            </tr>
            <tr v-show="showFilters">
              <th v-for="column in tableColumns" :key="column.accessorKey">
                <input v-if="column.accessorKey !== 'thumbnailURL'" type="text" :placeholder="`Filter`"
                  v-model="columnFilters[column.accessorKey]"
                  @input="applyColumnFilter(column.accessorKey, $event.target.value)"
                  @keydown="(event) => handleFilterKeydown(event, column.accessorKey)"
                  class="w-full p-1 text-sm border placeholder:text-neutral-400 placeholder:font-normal placeholder:text-sm" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!data || !data.products.length">
              <td class="text-neutral-500 flex justify-center"> <!-- Updated classes -->
                No Product database found. Import a CSV file to get started.
              </td>
            </tr>
            <tr v-else v-for="(row, rowIndex) in table.getRowModel().rows" :key="rowIndex">
              <td v-for="column in tableColumns" :key="column.accessorKey"
                @click="handleCellClick(rowIndex, column.accessorKey)"
                @dblclick="handleCellDblClick(rowIndex, column.accessorKey)" :class="{
                  'editable-cell': isEditableCell(column.accessorKey),
                  'image-cell': column.accessorKey === 'thumbnailURL',
                }">
                <div v-if="isEditableCell(column.accessorKey)" :id="`cell-${rowIndex}-${column.accessorKey}`"
                  :contenteditable="editingCell &&
                    editingCell.row === rowIndex &&
                    editingCell.column === column.accessorKey
                    " @blur="saveCellValue" @keydown.enter.prevent="saveCellValue" @keydown.esc="cancelEditing" :class="{
                      'editing-content':
                        editingCell &&
                        editingCell.row === rowIndex &&
                        editingCell.column === column.accessorKey,
                    }">
                  {{ getNestedValue(row.original, column.accessorKey) }}
                </div>
                <template v-else>
                  <img v-if="column.accessorKey === 'thumbnailURL'"
                    :src="getNestedValue(row.original, column.accessorKey)" @click.stop="
                      handleImageClick(
                        $event,
                        getNestedValue(row.original, column.accessorKey)
                      )
                      " />
                  <span v-else>
                    {{ getNestedValue(row.original, column.accessorKey) }}
                  </span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="editingCell" ref="editingCellRef" :contenteditable="isEditing"
          @input="isEditing && (cellValue = $event.target.textContent)" @blur="saveCellValue"
          @keydown.enter.prevent="saveCellValue" @keydown.esc="cancelEditing"
          @dblclick="handleCellDblClick(editingCell.row, editingCell.column)" class="editing-overlay"
          :class="{ 'editing-mode': isEditing }">
          {{ cellValue }}
        </div>
      </div>
    </div>
  </div>
  <Teleport to="body">
    <div v-if="enlargedImage" class="enlarged-image" :style="{
      top: `${enlargedImage.top}px`,
      left: `${enlargedImage.left}px`,
    }">
      <img :src="enlargedImage.src" alt="Enlarged product image" />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
table {
  table-layout: fixed;
  width: 100%;
  height: 100%;
  border-collapse: separate;
  border-spacing: 0;
  cursor: default;

  thead {
    position: sticky;
    top: 0;
    z-index: 1;

    tr {
      height: 40px;

      &:nth-child(2) {
        height: auto;
      }
    }

    th {
      @apply font-medium text-sm text-neutral-600 cursor-pointer bg-neutral-100;
      padding: 0 8px;

      &:first-child {
        z-index: 2;
      }
    }
  }
}

th,
td {
  @apply text-left;
  border: none;
  border-bottom: 1px solid #e5e7eb;
  cursor: default;
}

tr {
  @apply bg-white hover:bg-neutral-50;
  height: 32px;
}

.editable-cell {
  cursor: default;
}

td {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  padding: 0;
  height: 32px;
  position: relative;

  &.image-cell {
    width: 60px;
    padding: 0;
  }

  img {
    max-width: 100%;
    max-height: 32px;
    width: auto;
    height: auto;
    object-fit: contain;
    vertical-align: middle;
  }

  >* {
    padding: 0 8px;
    height: 100%;
    display: flex;
    align-items: center;
  }

  div[contenteditable] {
    width: 100%;
    outline: none;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
  }
}

.table-wrapper {
  border: none;
  padding: 0;
  height: 100%;
  overflow: auto;
}

.relative {
  position: relative;
}

.editing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  min-height: 32px;
  max-height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  z-index: 10;
  background-color: #ffffff;
  box-shadow: 0 0 0 2px #4285f4, 0 4px 8px rgba(0, 0, 0, 0.1);
  padding: 8px;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  cursor: default;

  &.editing-mode {
    box-shadow: 0 0 0 2px #4285f4, 0 4px 8px rgba(0, 0, 0, 0.2);
    cursor: text;
    z-index: 20;
    max-height: 400px;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
  }

  &::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
}

.editable-cell:focus {
  @apply outline outline-2 outline-blue-500;
}

.enlarged-image {
  position: fixed;
  z-index: 1000;
  background-color: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  transform: translate(25%, 0);

  img {
    max-width: 300px;
    max-height: 300px;
    width: auto;
    height: auto;
    object-fit: contain;
  }
}
</style>
