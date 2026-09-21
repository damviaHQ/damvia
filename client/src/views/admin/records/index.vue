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
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import Loader from "@/components/Loader.vue"
import FieldEditorDialog from "@/components/records/FieldEditorDialog.vue"
import RecordColumns from "@/components/records/RecordColumns.vue"
import RecordFilters from "@/components/records/RecordFilters.vue"
import RecordPanel, { type PanelTab } from "@/components/records/RecordPanel.vue"
import RecordsBulkBar from "@/components/records/RecordsBulkBar.vue"
import RecordsGrid, { type GridColumn, type GridField, type GridRecord, type GridSort } from "@/components/records/RecordsGrid.vue"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Pagination, PaginationEllipsis, PaginationFirst, PaginationLast, PaginationList, PaginationListItem, PaginationNext, PaginationPrev } from "@/components/ui/pagination"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { PAGE_SIZES, useRecordsGridPreferences } from "@/composables/useRecordsGridPreferences"
import { trpc, type RouterOutput } from "@/services/server"
import { filterIsComplete, operatorsFor, type RecordFilter } from "@/utils/recordFilters"
import { csvSafe, fieldLabel } from "@/utils/recordValues"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { ArrowDown, ArrowUp, Blocks, Columns3, Download, EllipsisVertical, FileUp, Filter, PackageX, Plus, Search, X } from "@lucide/vue"
import { unparse } from "papaparse"
import { toast as sonner } from "vue-sonner"
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

type Field = RouterOutput["recordAttribute"]["list"][number]
type ListResult = RouterOutput["record"]["list"]

const toast = useGlobalToast()
const recordLabel = useRecordLabel()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const preferences = useRecordsGridPreferences()
const grid = ref<InstanceType<typeof RecordsGrid> | null>(null)

const search = ref("")
const filters = ref<RecordFilter[]>([])
const filtersOpen = ref(false)
const page = ref(1)
const selected = ref<string[]>([])
const debouncedSearch = refDebounced(search, 300)
const completeFilters = computed(() => filters.value.filter(filterIsComplete))
const debouncedFilters = refDebounced(completeFilters, 300)
const narrowed = computed(() => !!debouncedSearch.value.trim() || debouncedFilters.value.length > 0)

// A new search, filter, order or page size starts again from page 1 with
// nothing selected.
watch([debouncedSearch, debouncedFilters, () => preferences.value.sort, () => preferences.value.pageSize], () => {
  page.value = 1
  selected.value = []
}, { deep: true })

const query = computed(() => ({
  search: debouncedSearch.value.trim() || undefined,
  filters: debouncedFilters.value.length ? debouncedFilters.value : undefined,
  sort: preferences.value.sort ?? undefined,
}))
const listInput = computed(() => ({ page: page.value, size: preferences.value.pageSize, ...query.value }))
const listKey = computed(() => ["records", "list", listInput.value])
const { data, status, error, isFetching } = useQuery({
  queryKey: listKey,
  queryFn: () => trpc.record.list.query(listInput.value),
  placeholderData: keepPreviousData,
})
const { data: attributes } = useQuery({ queryKey: ["records", "attributes"], queryFn: () => trpc.recordAttribute.list.query() })
const { data: undeclared } = useQuery({ queryKey: ["records", "available-attributes"], queryFn: () => trpc.recordAttribute.listAvailable.query() })

const fields = computed<GridField[]>(() => (attributes.value ?? []).map((field) => ({ id: field.id, name: field.name, displayName: field.displayName, valueType: field.valueType, options: field.options })))
const keyLabel = computed(() => data.value?.keyColumnName ?? "Key")
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / preferences.value.pageSize)))
const firstShown = computed(() => total.value ? (page.value - 1) * preferences.value.pageSize + 1 : 0)
const lastShown = computed(() => Math.min(total.value, page.value * preferences.value.pageSize))

const DEFAULT_WIDTHS: Record<string, number> = { number: 120, date: 150, long_text: 280, multi_select: 220, url: 200 }
const allColumns = computed<GridColumn[]>(() => [
  { id: "thumbnail", kind: "thumbnail", label: "Picture", width: 56 },
  { id: "key", kind: "key", label: keyLabel.value, width: 180, sortKey: "recordKey" },
  ...fields.value.map((field): GridColumn => ({ id: `field:${field.name}`, kind: "field", label: fieldLabel(field), width: DEFAULT_WIDTHS[field.valueType] ?? 180, sortKey: field.name, field })),
  { id: "files", kind: "files", label: "Files", width: 90, sortKey: "fileCount" },
  { id: "filled", kind: "filled", label: "Filled", width: 130 },
])
// The saved order first, then columns it does not know yet in their natural place.
const orderedColumns = computed(() => {
  const byId = new Map(allColumns.value.map((column) => [column.id, column]))
  const known = preferences.value.order.filter((id) => byId.has(id))
  return [...known, ...allColumns.value.map((column) => column.id).filter((id) => !known.includes(id))].map((id) => byId.get(id)!)
})
const columns = computed(() => orderedColumns.value
  .filter((column) => column.kind === "key" || !preferences.value.hidden.includes(column.id))
  .map((column) => ({ ...column, width: preferences.value.widths[column.id] ?? column.width })))
const columnChoices = computed(() => orderedColumns.value.filter((column) => column.kind !== "key").map((column) => ({ id: column.id, label: column.label, hidden: preferences.value.hidden.includes(column.id) })))
const sortLabel = computed(() => {
  const sort = preferences.value.sort
  if (!sort) return null
  return allColumns.value.find((column) => column.sortKey === sort.column)?.label ?? sort.column
})

function setOrder(ids: string[]) {
  const key = orderedColumns.value.find((column) => column.kind === "key")!
  const rest = ids.filter((id) => id !== key.id)
  const keyIndex = orderedColumns.value.indexOf(key)
  preferences.value.order = [...rest.slice(0, keyIndex), key.id, ...rest.slice(keyIndex)]
}
function toggleColumn(id: string, visible: boolean) {
  preferences.value.hidden = visible ? preferences.value.hidden.filter((item) => item !== id) : [...new Set([...preferences.value.hidden, id])]
}
function resetLayout() {
  preferences.value = { ...preferences.value, hidden: [], order: [], widths: {} }
}

const statusMessage = ref("")
function announce(message: string) {
  statusMessage.value = ""
  requestAnimationFrame(() => { statusMessage.value = message })
}

function patchCachedRow(id: string, change: (row: GridRecord) => GridRecord) {
  queryClient.setQueryData<ListResult>(listKey.value, (old) => old && { ...old, records: old.records.map((row) => row.id === id ? { ...row, ...change(row) } : row) })
}
function refreshRecord(id: string) {
  queryClient.invalidateQueries({ queryKey: ["records", "list"] })
  queryClient.invalidateQueries({ queryKey: ["records", "get", id] })
}

// A grid edit shows at once, is taken back if the server refuses it, and can
// be undone from the toast (the undo is a change of its own in the history).
async function commitCell(record: GridRecord, field: GridField, value: string) {
  const previous = queryClient.getQueryData<ListResult>(listKey.value)
  const old = record.metaData[field.name] ?? ""
  patchCachedRow(record.id, (row) => ({ ...row, metaData: { ...row.metaData, [field.name]: value } }))
  try {
    await trpc.record.patch.mutate({ id: record.id, values: { [field.name]: value }, source: "grid" })
    sonner(`${fieldLabel(field)} of ${record.recordKey} updated`, {
      action: {
        label: "Undo",
        onClick: () => trpc.record.patch.mutate({ id: record.id, values: { [field.name]: old }, source: "grid" })
          .then(() => refreshRecord(record.id))
          .catch((failure: Error) => toast.error(failure.message)),
      },
    })
  } catch (failure) {
    queryClient.setQueryData(listKey.value, previous)
    toast.error((failure as Error).message)
    throw failure
  } finally {
    refreshRecord(record.id)
  }
}

async function savePanelField(recordId: string, field: GridField, value: string) {
  await trpc.record.patch.mutate({ id: recordId, values: { [field.name]: value }, source: "panel" })
  refreshRecord(recordId)
}

async function addOption(field: GridField, option: string) {
  try {
    await trpc.recordAttribute.update.mutate({ id: field.id, options: [...field.options, option] })
    await queryClient.invalidateQueries({ queryKey: ["records", "attributes"] })
  } catch (failure) {
    toast.error((failure as Error).message)
    throw failure
  }
}

// A new record opens straight away as a card to fill in.
async function createRecord(key: string) {
  const created = await trpc.record.create.mutate({ recordKey: key })
  await queryClient.invalidateQueries({ queryKey: ["records", "list"] })
  announce(`${recordLabel.singular.value} ${created.recordKey} added`)
  openRecord(created.id, "fields")
}

async function removeRecords(ids: string[]) {
  const { removed } = await trpc.record.remove.mutate({ ids })
  selected.value = selected.value.filter((id) => !ids.includes(id))
  await queryClient.invalidateQueries({ queryKey: ["records"] })
  toast.success(`${removed} ${removed === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value} deleted`)
}

async function setFieldOnSelection(field: GridField, value: string) {
  const { updated } = await trpc.record.bulkPatch.mutate({ ids: selected.value, values: { [field.name]: value } })
  await queryClient.invalidateQueries({ queryKey: ["records"] })
  toast.success(`${fieldLabel(field)} set on ${updated} ${updated === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value}`)
}

// The selection when there is one, otherwise every record the search and
// filters find, never only the visible page.
const exporting = ref(false)
async function exportCsv() {
  exporting.value = true
  try {
    const result = await trpc.record.exportRows.mutate(selected.value.length ? { ids: selected.value, sort: query.value.sort } : query.value)
    const csv = unparse({ fields: result.columns.map(csvSafe), data: result.rows.map((row) => row.map(csvSafe)) })
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${recordLabel.lowerPlural.value}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`${result.rows.length} ${result.rows.length === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value} exported`)
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    exporting.value = false
  }
}

// The open card lives in the address, so a link to it can be shared.
const panelId = computed(() => typeof route.query.record === "string" ? route.query.record : null)
const panelTab = computed<PanelTab>(() => ["files", "history"].includes(String(route.query.tab)) ? route.query.tab as PanelTab : "fields")
function openRecord(id: string, tab: PanelTab = "fields") {
  router.replace({ query: { ...route.query, record: id, tab: tab === "fields" ? undefined : tab } })
}
function closeRecord() {
  const { record: _, tab: __, ...rest } = route.query
  router.replace({ query: rest })
}

function filterBy(column: GridColumn) {
  const name = column.kind === "key" ? "recordKey" : column.field!.name
  const type = column.kind === "key" ? "key" : column.field!.valueType
  filters.value = [...filters.value, { column: name, op: operatorsFor(type)[0], value: "", values: [] }]
  filtersOpen.value = true
}

function clearNarrowing() {
  search.value = ""
  filters.value = []
}

const fieldDialog = ref<{ open: boolean, field: Field | null }>({ open: false, field: null })
function editField(field: GridField | null) {
  fieldDialog.value = { open: true, field: field ? attributes.value?.find((item) => item.id === field.id) ?? null : null }
}

const fieldToRemove = ref<GridField | null>(null)
const fieldUsage = ref<number | null>(null)
const removingField = ref(false)
async function askRemoveField(field: GridField) {
  fieldToRemove.value = field
  fieldUsage.value = null
  fieldUsage.value = (await trpc.recordAttribute.usage.query(field.id)).filled
}
async function removeField() {
  if (!fieldToRemove.value) return
  removingField.value = true
  try {
    await trpc.recordAttribute.remove.mutate(fieldToRemove.value.id)
    await queryClient.invalidateQueries({ queryKey: ["records"] })
    toast.success(`${fieldLabel(fieldToRemove.value)} removed`)
    fieldToRemove.value = null
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    removingField.value = false
  }
}

const showRemoveAll = ref(false)
const removingAll = ref(false)
async function removeAll() {
  removingAll.value = true
  try {
    await trpc.record.removeAll.mutate()
    selected.value = []
    await queryClient.invalidateQueries({ queryKey: ["records"] })
    toast.success(`All ${recordLabel.lowerPlural.value} removed`)
    showRemoveAll.value = false
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    removingAll.value = false
  }
}

watch(() => data.value?.total, (count) => {
  if (count !== undefined) announce(`${count} ${count === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value}`)
})
</script>

<template>
  <div class="admin-page admin-resource-page admin-records">
    <AdminPageHeader :title="recordLabel.plural.value" :description="`Create, correct and complete your ${recordLabel.lowerPlural.value}. Changes save as you go and are kept in each ${recordLabel.lower.value}'s history.`">
      <Button as-child variant="outline"><router-link :to="{ name: 'admin-record-import' }"><FileUp class="size-4" />Import CSV</router-link></Button>
      <Button class="dv-button dv-button--primary" @click="grid?.focusNewRow()"><Plus class="size-4" />Add {{ recordLabel.lower.value }}</Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" aria-label="More actions"><EllipsisVertical class="size-5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem :disabled="exporting || !total" @select="exportCsv"><Download class="size-4" />Export {{ narrowed ? "matching" : "all" }} {{ recordLabel.lowerPlural.value }} (CSV)</DropdownMenuItem>
          <DropdownMenuItem @select="editField(null)"><Plus class="size-4" />Add a field</DropdownMenuItem>
          <DropdownMenuItem as-child><router-link :to="{ name: 'admin-fields' }"><Blocks class="size-4" />Manage fields</router-link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="!total && !narrowed" class="text-destructive" @select="showRemoveAll = true"><PackageX class="size-4" />Remove all {{ recordLabel.lowerPlural.value }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </AdminPageHeader>

    <div class="records-toolbar">
      <div class="records-search">
        <Search class="size-4" aria-hidden="true" />
        <Input v-model="search" type="search" :aria-label="`Search ${recordLabel.lowerPlural.value}`" :placeholder="`Search every field of every ${recordLabel.lower.value}`" />
      </div>
      <Popover v-model:open="filtersOpen">
        <PopoverTrigger as-child>
          <Button variant="outline" :aria-pressed="completeFilters.length > 0"><Filter class="size-4" />Filters<span v-if="completeFilters.length" class="record-chip">{{ completeFilters.length }}</span></Button>
        </PopoverTrigger>
        <PopoverContent align="start" class="records-popover records-popover--wide">
          <RecordFilters v-model="filters" :fields="fields" :key-label="keyLabel" />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger as-child><Button variant="outline"><Columns3 class="size-4" />Columns</Button></PopoverTrigger>
        <PopoverContent align="start" class="records-popover">
          <RecordColumns :columns="columnChoices" @order="setOrder" @toggle="toggleColumn" @reset="resetLayout" @add-field="editField(null)" />
        </PopoverContent>
      </Popover>
      <span v-if="sortLabel" class="records-sort-chip">
        <ArrowUp v-if="preferences.sort?.direction === 'asc'" class="size-3.5" aria-hidden="true" /><ArrowDown v-else class="size-3.5" aria-hidden="true" />
        Sorted by {{ sortLabel }}
        <button type="button" :aria-label="`Stop sorting by ${sortLabel}`" @click="preferences.sort = null"><X class="size-3.5" /></button>
      </span>
      <Button v-if="narrowed" variant="ghost" @click="clearNarrowing">Clear search and filters</Button>
      <span v-if="isFetching && status === 'success'" class="admin-text-secondary records-fetching">Updating…</span>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>

    <Loader v-if="status === 'pending'" :text="true" />
    <div v-else-if="status === 'error'" class="admin-error" role="alert">{{ error?.message }}</div>
    <template v-else>
      <section v-if="!total && !narrowed" class="dv-panel admin-empty">
        <h2>No {{ recordLabel.lowerPlural.value }} yet</h2>
        <p>Add a {{ recordLabel.lower.value }} by typing its {{ keyLabel }} in the last row below, or import a CSV file of your catalogue.</p>
        <Button as-child class="dv-button dv-button--primary"><router-link :to="{ name: 'admin-record-import' }"><FileUp class="size-4" />Import CSV</router-link></Button>
      </section>
      <section v-else-if="!total" class="dv-panel admin-empty">
        <h2>No {{ recordLabel.lowerPlural.value }} match</h2>
        <p>Nothing matches the search and filters.</p>
        <Button variant="outline" @click="clearNarrowing">Clear search and filters</Button>
      </section>
      <div class="dv-panel records-panel">
        <RecordsGrid ref="grid" v-model:selected="selected" :rows="data?.records ?? []" :columns="columns" :field-count="fields.length"
          :sort="preferences.sort" :record-label="recordLabel.lower.value" :key-label="keyLabel"
          :commit="commitCell" :add-option="addOption" :create="createRecord"
          @open="(row, tab) => openRecord(row.id, tab)" @sort="(sort: GridSort) => preferences.sort = sort"
          @resize="(id, width) => preferences.widths = { ...preferences.widths, [id]: width }" @hide="(id) => toggleColumn(id, false)"
          @filter="filterBy" @edit-field="editField" @remove-field="askRemoveField" />
      </div>
      <footer v-if="total" class="records-footer">
        <span class="admin-text-secondary">{{ firstShown }}–{{ lastShown }} of {{ total }}</span>
        <label class="records-page-size admin-text-secondary">Rows per page
          <select v-model.number="preferences.pageSize" class="record-native-select">
            <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
          </select>
        </label>
        <Pagination v-if="totalPages > 1" v-model:page="page" :total="total" :sibling-count="1" show-edges :items-per-page="preferences.pageSize">
          <PaginationList v-slot="{ items }" class="flex items-center gap-1">
            <PaginationFirst />
            <PaginationPrev />
            <template v-for="(item, index) in items">
              <PaginationListItem v-if="item.type === 'page'" :key="index" :value="item.value" as-child>
                <Button class="w-10 h-10 p-0" :variant="item.value === page ? 'default' : 'link'">{{ item.value }}</Button>
              </PaginationListItem>
              <PaginationEllipsis v-else :key="item.type" :index="index" />
            </template>
            <PaginationNext />
            <PaginationLast />
          </PaginationList>
        </Pagination>
      </footer>
    </template>

    <RecordsBulkBar v-if="selected.length" :count="selected.length" :fields="fields" :record-label="recordLabel.lower.value" :record-label-plural="recordLabel.lowerPlural.value"
      :set-field="setFieldOnSelection" :remove="() => removeRecords(selected)" @export="exportCsv" @clear="selected = []" />

    <RecordPanel :record-id="panelId" :tab="panelTab" :fields="fields" :record-label="recordLabel.lower.value"
      :save="savePanelField" :add-option="addOption" :remove="(id) => removeRecords([id])"
      @close="closeRecord" @update:tab="(tab) => openRecord(panelId!, tab)" @edit-field="editField" @add-field="editField(null)" />

    <FieldEditorDialog v-model:open="fieldDialog.open" :field="fieldDialog.field" :suggestions="(undeclared ?? []).filter((name) => name !== keyLabel && !fields.some((field) => field.name === name))" />

    <AlertDialog :open="!!fieldToRemove" @update:open="(open) => { if (!open && !removingField) fieldToRemove = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {{ fieldToRemove ? fieldLabel(fieldToRemove) : "" }}?</AlertDialogTitle>
          <AlertDialogDescription>
            <template v-if="fieldUsage === null">Counting the values…</template>
            <template v-else>{{ fieldUsage }} {{ fieldUsage === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value }} hold a value in this field.</template>
            The field and its values are removed from every {{ recordLabel.lower.value }}; each one keeps the value it lost in its history. A later CSV import with this column adds it back as text.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="removingField">Cancel</AlertDialogCancel>
          <Button variant="destructive" :disabled="removingField" @click="removeField">{{ removingField ? "Removing…" : "Remove field" }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="showRemoveAll" @update:open="(open) => { if (!removingAll) showRemoveAll = open }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove all {{ recordLabel.lowerPlural.value }}?</AlertDialogTitle>
          <AlertDialogDescription>This removes every {{ recordLabel.lower.value }}, including those outside the current search and filters. Their values stay in the history and linked files wait, listed as dangling, until the keys exist again.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="removingAll">Cancel</AlertDialogCancel>
          <Button variant="destructive" :disabled="removingAll" @click="removeAll">{{ removingAll ? "Removing…" : `Remove all ${recordLabel.lowerPlural.value}` }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
