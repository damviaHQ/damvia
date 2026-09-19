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
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import Loader from "@/components/Loader.vue"
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
import { createColumnHelper, getCoreRowModel, useVueTable } from "@tanstack/vue-table"
import { onClickOutside, onKeyStroke } from "@vueuse/core"
import {
  Blocks,
  EllipsisVertical,
  FileUp,
  Filter,
  FilterX,
  PackageX,
  ChevronDown,
  ChevronUp,
} from "lucide-vue-next"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"

const toast = useGlobalToast()
const currentPage = ref(1)
const pageSize = ref(200)
const queryClient = useQueryClient()
const isDeleting = ref(false)
const showDeleteDialog = ref(false)
const deleteError = ref('')
const activeCell = ref<{ rowIndex: number; columnId: string } | null>(null)
const editingValue = ref<string>("")
const columnFilters = ref<{ [key: string]: string }>({})
const activeFilter = ref<{ column: string; value: string } | null>(null)
const isDropdownOpen = ref(false)
const enlargedImage = ref<{ src: string; top: number; left: number } | null>(null)
const showFilters = ref(false)
const isSaving = ref(false)
const editorPosition = ref<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

// Query to fetch products data
const { status, data, error, refetch } = useQuery({
  queryKey: ["products", currentPage, pageSize, activeFilter],
  queryFn: () =>
    trpc.pim.listProducts.query({
      page: currentPage.value,
      size: pageSize.value,
      columnFilter: activeFilter.value || undefined,
    }),
})

// Pagination computed properties
const totalItems = computed(() => data.value?.total || 0)
const totalPages = computed(() => {
  return data.value ? Math.ceil(data.value.total / pageSize.value) : 1
})

// Handle data changes when changing pages
watch(currentPage, () => {
  activeCell.value = null
  refetch()
})

function changePage(newPage: number) {
  activeCell.value = null
  currentPage.value = newPage
}

// Function to access nested object properties
function getNestedValue(obj: any, path: string) {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj)
}

// Function to check if a cell is editable
function isEditableCell(columnId: string) {
  return columnId !== "thumbnailURL" && columnId !== "productKey"
}

// Create column helper for TanStack Table
const columnHelper = createColumnHelper<any>()

// Define columns for the table
const columns = computed(() => {
  if (!data.value || !data.value.products.length) return []

  const primaryKey = data.value.products[0].primaryKeyName
  const result = [
    columnHelper.accessor("thumbnailURL", {
      header: "Picture",
      id: "thumbnailURL",
      cell: (info) => ({
        type: "image",
        value: info.getValue(),
      }),
    }),
    columnHelper.accessor("productKey", {
      header: data.value.products[0].primaryKeyName,
      id: "productKey",
    }),
  ]

  // Add metadata columns
  Object.keys(data.value.products[0].metaData)
    .filter((key) => key !== primaryKey)
    .forEach((key) => {
      result.push(
        columnHelper.accessor(`metaData.${key}`, {
          header: key,
          id: `metaData.${key}`,
          cell: (info) => ({
            type: "text",
            value: info.getValue(),
          }),
        })
      )
    })

  return result
})

// Setup tanstack table
const table = useVueTable({
  get data() {
    return data.value?.products || []
  },
  get columns() {
    return columns.value
  },
  getCoreRowModel: getCoreRowModel(),
})

// Save cell value after editing
function saveCellValue() {
  if (!activeCell.value || isSaving.value) return

  const { rowIndex, columnId } = activeCell.value
  const row = table.getRowModel().rows[rowIndex]
  if (!row) return

  const product = row.original
  const metaDataKey = columnId.replace("metaData.", "")
  const oldValue = getNestedValue(product, columnId)

  // Skip if no changes
  if (editingValue.value === oldValue) {
    activeCell.value = null
    editorPosition.value = null
    return
  }

  try {
    isSaving.value = true
    trpc.pim.updateProduct.mutate({
      id: product.id,
      metaData: {
        ...product.metaData,
        [metaDataKey]: editingValue.value,
      },
    }).then(() => {
      toast.success("Record updated successfully")
      queryClient.invalidateQueries({ queryKey: ["products"] })
    }).catch((error) => {
      console.error("Error updating product:", error)
      toast.error("Failed to update record")
    }).finally(() => {
      isSaving.value = false
      activeCell.value = null
      editorPosition.value = null
    })
  } catch (error) {
    console.error("Error updating product:", error)
    toast.error("Failed to update record")
    isSaving.value = false
    activeCell.value = null
    editorPosition.value = null
  }
}

// Cancel cell editing
function cancelEditing() {
  activeCell.value = null
  editorPosition.value = null
}

// Handle cell click to prepare for editing
function handleCellClick(rowIndex: number, columnId: string) {
  if (!isEditableCell(columnId)) return
  
  const row = table.getRowModel().rows[rowIndex]
  if (!row) return

  editingValue.value = getNestedValue(row.original, columnId) || ""
  activeCell.value = { rowIndex, columnId }
  
  // Calculate editor position
  nextTick(() => {
    const cellEl = document.querySelector(`[data-cell="${rowIndex}-${columnId}"]`) as HTMLElement
    if (cellEl) {
      const rect = cellEl.getBoundingClientRect()
      const tableEl = document.querySelector('.spreadsheet-table') as HTMLElement
      const tableRect = tableEl?.getBoundingClientRect()
      
      if (tableRect) {
        // Check if cell is close to the right edge of the window
        const distanceToRightEdge = window.innerWidth - rect.right
        const idealEditorWidth = Math.max(rect.width, 250) // Minimum editor width for comfort
        const isNearRightEdge = distanceToRightEdge < idealEditorWidth - rect.width
        
        // Calculate optimal left position
        let leftPos = rect.left - tableRect.left
        let editorWidth = idealEditorWidth
        
        // If near right edge, adjust position to expand to the left
        if (isNearRightEdge) {
          // Calculate how much we can expand to the left
          const availableSpace = Math.min(rect.right - 20, window.innerWidth - 20)
          editorWidth = Math.min(idealEditorWidth, availableSpace)
          leftPos = rect.right - tableRect.left - editorWidth
        }
        
        // Position the editor
        editorPosition.value = {
          top: rect.top - tableRect.top,
          left: leftPos,
          width: editorWidth,
          maxHeight: Math.min(400, window.innerHeight - rect.top - 50) // Allow more height but limit by window
        }
        
        // Focus input in the next tick after editor is rendered
        setTimeout(() => {
          const textareaEl = document.getElementById(`cell-input-${rowIndex}-${columnId}`) as HTMLTextAreaElement
          if (textareaEl) {
            textareaEl.focus()
            // Place cursor at the end of the text
            const len = editingValue.value.length
            textareaEl.selectionStart = len
            textareaEl.selectionEnd = len
            
            // Auto-adjust height
            adjustTextareaHeight(textareaEl)
          }
        }, 10)
      }
    }
  })
}

// Function to adjust textarea height based on content
function adjustTextareaHeight(textarea: HTMLTextAreaElement) {
  // Reset height to ensure proper calculation
  textarea.style.height = 'auto'
  
  // Get the scrollHeight (content height) and set it as the textarea height
  const newHeight = Math.max(32, Math.min(textarea.scrollHeight, parseInt(editorPosition.value?.maxHeight.toString() || '400')))
  textarea.style.height = `${newHeight}px`
}

// Watch for changes in editing value to adjust height
watch(editingValue, () => {
  nextTick(() => {
    if (activeCell.value) {
      const textareaEl = document.getElementById(`cell-input-${activeCell.value.rowIndex}-${activeCell.value.columnId}`) as HTMLTextAreaElement
      if (textareaEl) {
        adjustTextareaHeight(textareaEl)
      }
    }
  })
})

// Handle filtering
function applyColumnFilter(column: string, value: string) {
  columnFilters.value[column] = value
  activeCell.value = null
}

function handleFilterKeydown(event: KeyboardEvent, column: string) {
  if (event.key === "Enter") {
    activeFilter.value = { column, value: columnFilters.value[column] || "" }
    currentPage.value = 1
    refetch()
  }
}

function toggleFilters() {
  showFilters.value = !showFilters.value
}

function clearFilters() {
  columnFilters.value = {}
  activeFilter.value = null
  refetch()
}

// Mutation to remove all products
const removeAllProducts = useMutation({
  mutationFn: () => trpc.pim.removeAllProducts.mutate(),
  onError: (error: Error) => { deleteError.value = error.message },
  onMutate: () => {
    isDeleting.value = true
    deleteError.value = ''
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["products"] })
    toast.success("All records removed successfully")
    showDeleteDialog.value = false
  },
  onSettled: () => {
    isDeleting.value = false
  },
})

// Image preview functionality
function handleImageClick(event: MouseEvent, src: string) {
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  enlargedImage.value = {
    src,
    top: rect.top,
    left: rect.left,
  }
}

function closeEnlargedImage(event: MouseEvent) {
  if (enlargedImage.value && event.target instanceof Element && !event.target.closest(".enlarged-image")) {
    enlargedImage.value = null
  }
}

// Handle keyboard navigation for spreadsheet-like experience
onKeyStroke(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape'], (e) => {
  if (!activeCell.value) return
  
  const { rowIndex, columnId } = activeCell.value
  const columnIndex = table.getAllFlatColumns().findIndex(col => col.id === columnId)
  const rowsCount = table.getRowModel().rows.length
  const columnsCount = table.getAllFlatColumns().length
  
  if (e.key === 'Escape') {
    cancelEditing()
    e.preventDefault()
    return
  }
  
  if (e.key === 'Enter') {
    if (e.shiftKey) { 
      // Previous row
      if (rowIndex > 0) {
        saveCellValue()
        nextTick(() => handleCellClick(rowIndex - 1, columnId))
      }
    } else {
      // Next row
      if (rowIndex < rowsCount - 1) {
        saveCellValue()
        nextTick(() => handleCellClick(rowIndex + 1, columnId))
      } else {
        saveCellValue()
      }
    }
    e.preventDefault()
    return
  }
  
  if (e.key === 'Tab') {
    if (e.shiftKey) { 
      // Previous column
      if (columnIndex > 0) {
        let prevColIndex = columnIndex - 1
        // Skip non-editable columns
        while (prevColIndex >= 0 && !isEditableCell(table.getAllFlatColumns()[prevColIndex].id || '')) {
          prevColIndex--
        }
        if (prevColIndex >= 0) {
          saveCellValue()
          nextTick(() => handleCellClick(rowIndex, table.getAllFlatColumns()[prevColIndex].id || ''))
        }
      }
    } else {
      // Next column
      if (columnIndex < columnsCount - 1) {
        let nextColIndex = columnIndex + 1
        // Skip non-editable columns
        while (nextColIndex < columnsCount && !isEditableCell(table.getAllFlatColumns()[nextColIndex].id || '')) {
          nextColIndex++
        }
        if (nextColIndex < columnsCount) {
          saveCellValue()
          nextTick(() => handleCellClick(rowIndex, table.getAllFlatColumns()[nextColIndex].id || ''))
        }
      }
    }
    e.preventDefault()
    return
  }
  
  if (e.key === 'ArrowUp' && rowIndex > 0) {
    saveCellValue()
    nextTick(() => handleCellClick(rowIndex - 1, columnId))
    e.preventDefault()
  }
  
  if (e.key === 'ArrowDown' && rowIndex < rowsCount - 1) {
    saveCellValue()
    nextTick(() => handleCellClick(rowIndex + 1, columnId))
    e.preventDefault()
  }
  
  if (e.key === 'ArrowLeft' && columnIndex > 0) {
    let prevColIndex = columnIndex - 1
    while (prevColIndex >= 0 && !isEditableCell(table.getAllFlatColumns()[prevColIndex].id || '')) {
      prevColIndex--
    }
    if (prevColIndex >= 0) {
      saveCellValue()
      nextTick(() => handleCellClick(rowIndex, table.getAllFlatColumns()[prevColIndex].id || ''))
      e.preventDefault()
    }
  }
  
  if (e.key === 'ArrowRight' && columnIndex < columnsCount - 1) {
    let nextColIndex = columnIndex + 1
    while (nextColIndex < columnsCount && !isEditableCell(table.getAllFlatColumns()[nextColIndex].id || '')) {
      nextColIndex++
    }
    if (nextColIndex < columnsCount) {
      saveCellValue()
      nextTick(() => handleCellClick(rowIndex, table.getAllFlatColumns()[nextColIndex].id || ''))
      e.preventDefault()
    }
  }
})

// Setup event listeners
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
  <div v-else-if="status === 'error'" class="admin-error">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="admin-page admin-resource-page admin-products">
    <div class="admin-product-toolbar">
      <div class="flex items-center gap-5">
        <div class="admin-heading"><h1>Records</h1></div>
        <Button as-child variant="outline"><router-link :to="{ name: 'admin-product-attributes' }"><Blocks class="w-4 h-4 mr-2" />Attributes</router-link></Button>
        <Button v-if="data.products.length || Object.keys(columnFilters).length" variant="outline" type="button" :aria-expanded="showFilters" @click="toggleFilters"
          class="flex px-0 gap-2 admin-text-secondary admin-text-primary-hover">
          <Filter class="w-5 h-5" />
          {{ showFilters ? "Hide Filters" : "Show Filters" }}
        </Button>
        <Button v-if="Object.keys(columnFilters).length > 0" variant="link" type="button" @click="clearFilters"
          class="flex px-0 gap-2 admin-text-secondary admin-text-primary-hover">
          <FilterX class="w-5 h-5" />
          Clear Filters
        </Button>
        <Button as-child class="dv-button dv-button--primary"><router-link :to="{ name: 'admin-product-import' }"><FileUp />Import CSV</router-link></Button>
        <DropdownMenu v-model:open="isDropdownOpen">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Record actions">
              <EllipsisVertical class="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem :disabled="!data.products.length" @select="deleteError = ''; showDeleteDialog = true">
              <PackageX class="mr-2 h-4 w-4" /><span>Remove all records</span>
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
    
    <section v-if="!data.products.length" class="dv-panel admin-empty">
      <h2>{{ Object.keys(columnFilters).length ? 'No matching records' : 'No records yet' }}</h2>
      <p>{{ Object.keys(columnFilters).length ? 'Clear the filters to see your record list.' : 'Import a CSV file to add your records.' }}</p>
      <Button v-if="Object.keys(columnFilters).length" variant="outline" @click="clearFilters">Clear filters</Button>
      <Button v-else as-child class="dv-button dv-button--primary"><router-link :to="{ name: 'admin-product-import' }"><FileUp />Import CSV</router-link></Button>
    </section>
    <div v-else class="dv-panel w-full overflow-x-auto flex-grow">
      <div class="data-grid">
        <table class="spreadsheet-table">
          <thead>
            <tr>
              <th v-for="column in table.getFlatHeaders()" :key="column.id" :class="{ 'sortable': column.id !== 'thumbnailURL' }">
                <div class="flex items-center justify-between gap-1">
                  <span>{{ column.column.columnDef.header as string }}</span>
                  <div class="flex flex-col">
                    <ChevronUp class="sort-icon w-3 h-3" />
                    <ChevronDown class="sort-icon w-3 h-3" />
                  </div>
                </div>
              </th>
            </tr>
            <tr v-show="showFilters">
              <th v-for="column in table.getFlatHeaders()" :key="column.id">
                <input 
                  v-if="column.id !== 'thumbnailURL'" 
                  type="text" 
                  :placeholder="`Filter`"
                  :aria-label="`Filter ${column.column.columnDef.header}`"
                  v-model="columnFilters[column.id || '']"
                  @input="(e) => e.target instanceof HTMLInputElement && applyColumnFilter(column.id || '', e.target.value)"
                  @keydown="(e) => handleFilterKeydown(e, column.id || '')"
                  class="filter-input" 
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!data || !data.products.length">
              <td colspan="100%" class="admin-text-secondary text-center p-4">
                No Product database found. Import a CSV file to get started.
              </td>
            </tr>
            <template v-else>
              <tr 
                v-for="(row, rowIndex) in table.getRowModel().rows" 
                :key="rowIndex"
                :class="{ 'row-active': activeCell?.rowIndex === rowIndex }"
              >
                <td 
                  v-for="cell in row.getVisibleCells()" 
                  :key="cell.id"
                  :data-cell="`${rowIndex}-${cell.column.id}`"
                  :class="{
                    'cell-editable': isEditableCell(cell.column.id || ''),
                    'cell-active': activeCell?.rowIndex === rowIndex && activeCell?.columnId === cell.column.id,
                    'cell-image': cell.column.id === 'thumbnailURL'
                  }"
                  @click="handleCellClick(rowIndex, cell.column.id || '')"
                >
                  <!-- Image cell -->
                  <template v-if="cell.column.id === 'thumbnailURL'">
                    <img 
                      v-if="cell.getValue()" 
                      :src="cell.getValue() as string" 
                      alt="Product image"
                      @click.stop="handleImageClick($event, cell.getValue() as string)" 
                      class="product-thumbnail"
                    />
                  </template>
                  
                  <!-- Editable cell -->
                  <template v-else-if="isEditableCell(cell.column.id || '')">
                    <!-- Display -->
                    <div class="cell-content">
                      {{ getNestedValue(row.original, cell.column.id || '') }}
                    </div>
                  </template>
                  
                  <!-- Non-editable cell -->
                  <template v-else>
                    <div class="cell-content">
                      {{ cell.getValue() }}
                    </div>
                  </template>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        
        <!-- Floating editor for active cell -->
        <div 
          v-if="activeCell && editorPosition" 
          class="floating-cell-editor"
          :style="{
            top: `${editorPosition.top}px`,
            left: `${editorPosition.left}px`,
            width: `${editorPosition.width}px`,
            maxHeight: `${editorPosition.maxHeight}px`
          }"
        >
          <textarea
            :id="`cell-input-${activeCell.rowIndex}-${activeCell.columnId}`"
            v-model="editingValue"
            @input="adjustTextareaHeight($event.target as HTMLTextAreaElement)"
            @blur="saveCellValue"
            @keydown.enter.exact.prevent="saveCellValue"
            @keydown.esc.prevent="cancelEditing"
            class="floating-cell-input"
            rows="1"
            :style="{
              minHeight: '32px'
            }"
          ></textarea>
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
  <AlertDialog :open="showDeleteDialog" @update:open="open => { if (!isDeleting) showDeleteDialog = open }">
    <AlertDialogContent @escape-key-down="event => { if (isDeleting) event.preventDefault() }">
      <AlertDialogHeader><AlertDialogTitle>Remove all records?</AlertDialogTitle><AlertDialogDescription>This removes all records, including records outside the current filters. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
      <p v-if="deleteError" role="alert" class="admin-form-error">{{ deleteError }}</p>
      <AlertDialogFooter><AlertDialogCancel :disabled="isDeleting">Cancel</AlertDialogCancel><Button variant="destructive" :disabled="isDeleting" @click="removeAllProducts.mutate()">{{ isDeleting ? 'Removing…' : 'Remove all products' }}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<style scoped>.data-grid {
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
}

.spreadsheet-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 14px;
  table-layout: fixed;
}
.spreadsheet-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--dv-surface-canvas);
}
.spreadsheet-table thead tr:first-child th {
  height: 36px;
  border-bottom: 1px solid var(--dv-color-line);
  background: var(--dv-surface-canvas);
  padding: 0 8px;
  font-weight: 500;
  color: var(--dv-text-secondary);
  text-align: left;
}
.spreadsheet-table thead tr:first-child th.sortable {
  cursor: pointer;
}
.spreadsheet-table thead tr:first-child th.sortable:hover {
  background-color: var(--dv-surface-canvas);
}
.spreadsheet-table thead tr:first-child th .sort-icon {
  color: var(--dv-text-secondary);
  opacity: 0.5;
}
.spreadsheet-table thead tr:first-child th .sort-icon:hover {
  opacity: 1;
}
.spreadsheet-table thead tr:nth-child(2) th {
  padding: 4px 8px;
  background-color: var(--dv-surface-canvas);
  border-bottom: 1px solid var(--dv-color-line);
}
.spreadsheet-table thead tr:nth-child(2) th .filter-input {
  width: 100%;
  border: 1px solid var(--dv-color-line);
  border-radius: 0;
  padding: 4px 8px;
  font-size: 12px;
}
.spreadsheet-table thead tr:nth-child(2) th .filter-input:focus {
  outline: none;
  border-color: var(--dv-action-primary);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.2);
}
.spreadsheet-table tbody tr {
  height: 32px;
  background-color: white;
  transition: background-color 0.1s ease;
}
.spreadsheet-table tbody tr:hover {
  background-color: var(--dv-surface-canvas);
}
.spreadsheet-table tbody tr.row-active {
  background-color: var(--dv-surface-canvas);
}
.spreadsheet-table tbody td {
  border-bottom: 1px solid var(--dv-color-line);
  position: relative;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  height: 32px;
}
.spreadsheet-table tbody td.cell-editable {
  cursor: pointer;
}
.spreadsheet-table tbody td.cell-editable:hover {
  background-color: rgba(37, 99, 235, 0.05);
}
.spreadsheet-table tbody td.cell-active {
  border: 2px solid var(--dv-action-primary);
  padding: 0;
  z-index: 1;
}
.spreadsheet-table tbody td.cell-image {
  width: 60px;
  text-align: center;
}
.spreadsheet-table tbody td.cell-image .product-thumbnail {
  max-width: 32px;
  max-height: 32px;
  width: auto;
  height: auto;
  object-fit: contain;
  cursor: pointer;
}
.spreadsheet-table tbody td .cell-content {
  padding: 0 8px;
  height: 100%;
  display: flex;
  align-items: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spreadsheet-table tbody td .cell-editor {
  height: 100%;
  width: 100%;
  z-index: 2;
  display: flex;
  align-items: stretch;
  padding: 0;
  margin: 0;
}
.spreadsheet-table tbody td .cell-editor .cell-input {
  width: 100%;
  height: 100%;
  border: none;
  padding: 0 8px;
  background-color: white;
  outline: none;
  font-size: 14px;
  margin: 0;
  box-sizing: border-box;
  min-height: 32px;
  line-height: 32px;
  display: block;
}

.enlarged-image {
  position: fixed;
  z-index: 1000;
  background-color: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 8px;
  border-radius: var(--dv-radius-graphic);
  transition: all 0.3s ease;
  transform: translate(25%, 0);
}
.enlarged-image img {
  max-width: 300px;
  max-height: 300px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.floating-cell-editor {
  position: absolute;
  z-index: 100;
  background-color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 2px solid var(--dv-action-primary);
  border-radius: 0;
  overflow: visible;
}
.floating-cell-editor .floating-cell-input {
  width: 100%;
  resize: none;
  border: none;
  padding: 4px 8px;
  outline: none;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  margin: 0;
  box-sizing: border-box;
  overflow-y: auto;
  display: block;
  transition: height 0.1s ease;
}
.floating-cell-editor .floating-cell-input:focus {
  outline: none;
}
.floating-cell-editor .floating-cell-input::-webkit-scrollbar {
  width: 6px;
}
.floating-cell-editor .floating-cell-input::-webkit-scrollbar-track {
  background: #f5f5f5;
}
.floating-cell-editor .floating-cell-input::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 0;
}</style>
