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
import RecordColumns, { FROZEN_LINE, type ColumnChoice } from "@/components/records/RecordColumns.vue"
import RecordFieldsSheet from "@/components/records/RecordFieldsSheet.vue"
import RecordFilters from "@/components/records/RecordFilters.vue"
import RecordPanel, { type PanelTab } from "@/components/records/RecordPanel.vue"
import RecordsBulkBar from "@/components/records/RecordsBulkBar.vue"
import RecordsGrid, { type GridColumn, type GridField, type GridRecord, type GridSort, type GridWrite } from "@/components/records/RecordsGrid.vue"
import RecordTableTabs, { type RecordTableTab } from "@/components/records/RecordTableTabs.vue"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { useRecordsGridPreferences } from "@/composables/useRecordsGridPreferences"
import { trpc, type RouterOutput } from "@/services/server"
import { filterIsComplete, operatorsFor, type RecordFilter } from "@/utils/recordFilters"
import { csvSafe, fieldLabel, normaliseValue } from "@/utils/recordValues"
import { useQueries, useQuery, useQueryClient } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { ArrowDown, ArrowUp, Blocks, Columns3, Download, EllipsisVertical, FileUp, Filter, PackageX, Plus, Search, X } from "@lucide/vue"
import { unparse } from "papaparse"
import { toast as sonner } from "vue-sonner"
import { computed, nextTick, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

type Field = RouterOutput["recordAttribute"]["list"][number]
type ListResult = RouterOutput["record"]["list"]

// Rows load by blocks as the grid scrolls; search, filters and sort run on
// the server over the whole table.
const CHUNK = 200

const toast = useGlobalToast()
const recordLabel = useRecordLabel()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const grid = ref<InstanceType<typeof RecordsGrid> | null>(null)

// The open table lives in the address; the first one otherwise.
const { data: tables, error: tablesError } = useQuery({ queryKey: ["records", "tables"], queryFn: () => trpc.recordTable.list.query() })
const activeTableId = computed<string | null>(() => {
  const list = tables.value ?? []
  const wanted = typeof route.query.table === "string" ? route.query.table : null
  return list.find((table) => table.id === wanted)?.id ?? list[0]?.id ?? null
})
const activeTable = computed(() => tables.value?.find((table) => table.id === activeTableId.value) ?? null)
const otherTables = computed(() => (tables.value ?? []).filter((table) => table.id !== activeTableId.value))
const preferences = useRecordsGridPreferences(activeTableId)

const search = ref("")
const filters = ref<RecordFilter[]>([])
const filtersOpen = ref(false)
const selected = ref<string[]>([])
const debouncedSearch = refDebounced(search, 300)
const completeFilters = computed(() => filters.value.filter(filterIsComplete))
const debouncedFilters = refDebounced(completeFilters, 300)
const narrowed = computed(() => !!debouncedSearch.value.trim() || debouncedFilters.value.length > 0)

const query = computed(() => ({
  tableId: activeTableId.value ?? undefined,
  search: debouncedSearch.value.trim() || undefined,
  filters: debouncedFilters.value.length ? debouncedFilters.value : undefined,
  sort: preferences.value.sort ?? undefined,
}))
const listKey = computed(() => JSON.stringify(query.value))

// The blocks asked for since the list last changed stay loaded, so a range
// selected across them can still be written.
const visible = ref<[number, number]>([0, 0])
const requested = ref<number[]>([0])
watch(visible, ([start, end]) => {
  const wanted = new Set(requested.value)
  for (let chunk = Math.floor(start / CHUNK); chunk <= Math.floor(end / CHUNK); chunk++) wanted.add(chunk)
  if (wanted.size !== requested.value.length) requested.value = [...wanted].sort((a, b) => a - b)
})
watch(listKey, () => {
  selected.value = []
  requested.value = [0]
  grid.value?.scrollToTop()
})
const chunkKey = (chunk: number) => ["records", "list", query.value, chunk]
const chunkQueries = useQueries({
  queries: computed(() => requested.value.map((chunk) => ({
    queryKey: chunkKey(chunk),
    queryFn: () => trpc.record.list.query({ ...query.value, offset: chunk * CHUNK, limit: CHUNK }),
    enabled: !!activeTableId.value,
  }))),
})
const chunkResults = computed(() => requested.value.map((chunk, index) => ({ chunk, result: chunkQueries.value[index] })))
const firstChunk = computed(() => chunkResults.value.find((item) => item.chunk === 0)?.result)
// The count stays while a new search loads, so the grid does not jump.
const lastTotal = ref<number | null>(null)
const total = computed(() => chunkResults.value.find((item) => item.result?.data)?.result?.data?.total ?? lastTotal.value ?? 0)
watch(() => firstChunk.value?.data?.total, (count) => { if (count !== undefined) lastTotal.value = count })
const keyColumnName = computed(() => chunkResults.value.find((item) => item.result?.data)?.result?.data?.keyColumnName ?? null)
const rows = computed<(GridRecord | null)[]>(() => {
  const list: (GridRecord | null)[] = new Array(total.value).fill(null)
  for (const { chunk, result } of chunkResults.value) {
    result?.data?.records.forEach((record, index) => {
      if (chunk * CHUNK + index < list.length) list[chunk * CHUNK + index] = record
    })
  }
  return list
})
const status = computed(() => {
  if (tablesError.value || firstChunk.value?.error) return "error"
  if (!tables.value || (lastTotal.value === null && !firstChunk.value?.data)) return "pending"
  return "success"
})
const error = computed(() => tablesError.value ?? firstChunk.value?.error ?? null)
const isFetching = computed(() => chunkQueries.value.some((result) => result.isFetching))

const { data: attributes } = useQuery({ queryKey: ["records", "attributes"], queryFn: () => trpc.recordAttribute.list.query() })
const { data: undeclared } = useQuery({ queryKey: ["records", "available-attributes"], queryFn: () => trpc.recordAttribute.listAvailable.query() })

const toGridField = (field: Field): GridField => ({ id: field.id, name: field.name, displayName: field.displayName, valueType: field.valueType, options: field.options })
const allFields = computed<GridField[]>(() => (attributes.value ?? []).map(toGridField))
// The fields the open table shows, in its order.
const fields = computed<GridField[]>(() => {
  const byId = new Map(allFields.value.map((field) => [field.id, field]))
  return (activeTable.value?.fieldIds ?? []).map((id) => byId.get(id)).filter((field): field is GridField => !!field)
})
const keyLabel = computed(() => keyColumnName.value ?? "Key")

const DEFAULT_WIDTHS: Record<string, number> = { number: 120, date: 150, long_text: 280, multi_select: 220, url: 200 }
const allColumns = computed<GridColumn[]>(() => [
  { id: "thumbnail", kind: "thumbnail", label: "Picture", width: 56 },
  { id: "key", kind: "key", label: keyLabel.value, width: 180, sortKey: "recordKey" },
  ...fields.value.map((field): GridColumn => ({ id: `field:${field.name}`, kind: "field", label: fieldLabel(field), width: DEFAULT_WIDTHS[field.valueType] ?? 180, sortKey: field.name, field })),
  { id: "files", kind: "files", label: "Files", width: 90, sortKey: "fileCount" },
  { id: "filled", kind: "filled", label: "Filled", width: 130 },
])
// The saved order first, then columns it does not know yet in their natural
// place. The frozen line sits in the order too: columns above it stay in place
// when the grid scrolls sideways; by default it follows the key.
const orderedIds = computed(() => {
  const ids = new Set(allColumns.value.map((column) => column.id))
  const known = preferences.value.order.filter((id) => ids.has(id) || id === FROZEN_LINE)
  const order = [...known, ...[...ids].filter((id) => !known.includes(id))]
  if (!order.includes(FROZEN_LINE)) order.splice(order.indexOf("key") + 1, 0, FROZEN_LINE)
  return order
})
const orderedColumns = computed(() => {
  const byId = new Map(allColumns.value.map((column) => [column.id, column]))
  return orderedIds.value.filter((id) => id !== FROZEN_LINE).map((id) => byId.get(id)!)
})
const isVisible = (column: GridColumn) => column.kind === "key" || !preferences.value.hidden.includes(column.id)
const columns = computed(() => orderedColumns.value
  .filter(isVisible)
  .map((column) => ({ ...column, width: preferences.value.widths[column.id] ?? column.width })))
const frozenCount = computed(() => orderedIds.value.slice(0, orderedIds.value.indexOf(FROZEN_LINE))
  .filter((id) => { const column = orderedColumns.value.find((item) => item.id === id); return column && isVisible(column) }).length)
const columnChoices = computed<ColumnChoice[]>(() => orderedIds.value.map((id) => {
  if (id === FROZEN_LINE) return { id, label: "Frozen", hidden: false, divider: true }
  const column = orderedColumns.value.find((item) => item.id === id)!
  return { id, label: column.label, hidden: !isVisible(column), locked: column.kind === "key" }
}))
const sortLabel = computed(() => {
  const sort = preferences.value.sort
  if (!sort) return null
  return allColumns.value.find((column) => column.sortKey === sort.column)?.label ?? sort.column
})

function setOrder(ids: string[]) {
  preferences.value.order = ids
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

type ListSnapshot = [readonly unknown[], ListResult | undefined][]
function snapshotList(): ListSnapshot {
  return queryClient.getQueriesData<ListResult>({ queryKey: ["records", "list"] })
}
function restoreList(snapshot: ListSnapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data)
}
function patchCachedRow(id: string, change: (row: GridRecord) => GridRecord) {
  queryClient.setQueriesData<ListResult>({ queryKey: ["records", "list"] }, (old) => old && { ...old, records: old.records.map((row) => row.id === id ? { ...row, ...change(row) } : row) })
}
// Refetches the block holding the record, not every block loaded.
function refreshRecord(id: string) {
  const holder = chunkResults.value.find((item) => item.result?.data?.records.some((row) => row.id === id))
  queryClient.invalidateQueries({ queryKey: holder ? chunkKey(holder.chunk) : ["records", "list"] })
  queryClient.invalidateQueries({ queryKey: ["records", "get", id] })
}
function refreshAll() {
  return queryClient.invalidateQueries({ queryKey: ["records"] })
}

// A grid edit shows at once, is taken back if the server refuses it, and can
// be undone from the toast (the undo is a change of its own in the history).
async function commitCell(record: GridRecord, field: GridField, value: string) {
  const previous = snapshotList()
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
    restoreList(previous)
    toast.error((failure as Error).message)
    throw failure
  } finally {
    refreshRecord(record.id)
  }
}

// A pasted, filled or cleared range: every value is checked first, the cells
// show at once, and the whole range is saved, undone or refused together.
async function commitCells(writes: GridWrite[], skipped: number) {
  const changes = new Map<string, { record: GridRecord, values: Record<string, string>, old: Record<string, string> }>()
  let cells = 0
  for (const write of writes) {
    const checked = normaliseValue(write.field, write.value)
    if ("error" in checked) {
      toast.error(`${write.record.recordKey}: ${checked.error}`)
      return
    }
    const old = write.record.metaData[write.field.name] ?? ""
    if (checked.value === old) continue
    const change = changes.get(write.record.id) ?? { record: write.record, values: {}, old: {} }
    change.values[write.field.name] = checked.value
    change.old[write.field.name] = old
    changes.set(write.record.id, change)
    cells++
  }
  const readOnly = skipped ? ` ${skipped} read-only ${skipped === 1 ? "cell was" : "cells were"} left as they are.` : ""
  if (!cells) {
    if (skipped) sonner(`Nothing changed.${readOnly}`)
    return
  }
  const previous = snapshotList()
  for (const change of changes.values()) patchCachedRow(change.record.id, (row) => ({ ...row, metaData: { ...row.metaData, ...change.values } }))
  const payload = (key: "values" | "old") => [...changes.values()].map((change) => ({ id: change.record.id, values: change[key] }))
  try {
    await trpc.record.patchMany.mutate({ changes: payload("values") })
    sonner(`${cells} ${cells === 1 ? "cell" : "cells"} updated on ${changes.size} ${changes.size === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value}.${readOnly}`, {
      action: {
        label: "Undo",
        onClick: () => trpc.record.patchMany.mutate({ changes: payload("old") })
          .then(() => refreshAll())
          .catch((failure: Error) => toast.error(failure.message)),
      },
    })
  } catch (failure) {
    restoreList(previous)
    toast.error((failure as Error).message)
  } finally {
    queryClient.invalidateQueries({ queryKey: ["records", "list"] })
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

// A new record goes to the open table and opens straight away as a card.
async function createRecord(key: string) {
  const created = await trpc.record.create.mutate({ recordKey: key, tableId: activeTableId.value ?? undefined })
  await refreshAll()
  announce(`${recordLabel.singular.value} ${created.recordKey} added`)
  openRecord(created.id, "fields")
}

// Jumps to an existing record and shows its row: its table opens, and search
// and filters that leave it out are cleared first. When they change, the
// record is located again once the list follows.
const pendingKey = ref<string | null>(null)
const target = ref<{ id: string, position: number } | null>(null)
async function revealRecord(recordKey: string) {
  try {
    const located = await trpc.record.locate.query({ recordKey, ...query.value })
    if (located.tableId !== activeTableId.value) {
      pendingKey.value = recordKey
      selectTable(located.tableId)
      toast.info(`${recordKey} is in the ${tables.value?.find((table) => table.id === located.tableId)?.name ?? "other"} table`)
    } else if (located.position === null) {
      pendingKey.value = recordKey
      clearNarrowing()
      toast.info(`Search and filters cleared to show ${recordKey}`)
    } else {
      target.value = { id: located.id, position: located.position }
      grid.value?.scrollToRow(located.position)
    }
  } catch (failure) {
    toast.error((failure as Error).message)
  }
}
watch(listKey, () => {
  const key = pendingKey.value
  if (!key || search.value.trim() !== debouncedSearch.value.trim() || completeFilters.value.length !== debouncedFilters.value.length) return
  pendingKey.value = null
  nextTick(() => revealRecord(key))
})
watch([rows, target], () => {
  const wanted = target.value
  if (!wanted || !rows.value[wanted.position]) return
  target.value = null
  nextTick(() => grid.value?.revealRow(wanted.id))
})

async function removeRecords(ids: string[]) {
  const { removed } = await trpc.record.remove.mutate({ ids })
  selected.value = selected.value.filter((id) => !ids.includes(id))
  await refreshAll()
  toast.success(`${removed} ${removed === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value} deleted`)
}

async function setFieldOnSelection(field: GridField, value: string) {
  const { updated } = await trpc.record.bulkPatch.mutate({ ids: selected.value, values: { [field.name]: value } })
  await refreshAll()
  toast.success(`${fieldLabel(field)} set on ${updated} ${updated === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value}`)
}

async function moveSelection(tableId: string) {
  const { moved } = await trpc.record.moveToTable.mutate({ ids: selected.value, tableId })
  selected.value = []
  await refreshAll()
  toast.success(`${moved} ${moved === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value} moved to ${tables.value?.find((table) => table.id === tableId)?.name ?? "the table"}`)
}

// The selection when there is one, otherwise every record of the table the
// search and filters find, never only the rows loaded.
const exporting = ref(false)
async function exportCsv() {
  exporting.value = true
  try {
    const result = await trpc.record.exportRows.mutate(selected.value.length ? { tableId: query.value.tableId, ids: selected.value, sort: query.value.sort } : query.value)
    const csv = unparse({ fields: result.columns.map(csvSafe), data: result.rows.map((row) => row.map(csvSafe)) })
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${(activeTable.value?.name ?? recordLabel.lowerPlural.value).replace(/[^\p{L}\p{N}_-]+/gu, "-")}-${new Date().toISOString().slice(0, 10)}.csv`
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

// The fields panel keeps ?fields=1 so the old Fields page can land on it.
const fieldsOpen = computed({
  get: () => route.query.fields === "1",
  set: (open: boolean) => {
    const { fields: _, ...rest } = route.query
    router.replace({ query: open ? { ...rest, fields: "1" } : rest })
  },
})

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

// Each table starts with its own search and filters.
function selectTable(id: string) {
  if (id === activeTableId.value) return
  clearNarrowing()
  lastTotal.value = null
  const { record: _, tab: __, ...rest } = route.query
  router.replace({ query: { ...rest, table: id } })
}

async function createTable(name: string) {
  try {
    const table = await trpc.recordTable.create.mutate({ name })
    await queryClient.invalidateQueries({ queryKey: ["records", "tables"] })
    selectTable(table.id)
    if (table.name !== name) toast.info(`A table named ${name} exists; this one is ${table.name}`)
  } catch (failure) {
    toast.error((failure as Error).message)
  }
}
async function renameTable(id: string, name: string) {
  try {
    queryClient.setQueryData(["records", "tables"], await trpc.recordTable.rename.mutate({ id, name }))
  } catch (failure) {
    toast.error((failure as Error).message)
  }
}
async function reorderTables(ids: string[]) {
  const byId = new Map((tables.value ?? []).map((table) => [table.id, table]))
  queryClient.setQueryData(["records", "tables"], ids.map((id) => byId.get(id)).filter(Boolean))
  try {
    queryClient.setQueryData(["records", "tables"], await trpc.recordTable.reorder.mutate({ ids }))
  } catch (failure) {
    toast.error((failure as Error).message)
    queryClient.invalidateQueries({ queryKey: ["records", "tables"] })
  }
}

const tableToRemove = ref<RecordTableTab | null>(null)
const moveRecordsTo = ref("")
const removingTable = ref(false)
function askRemoveTable(table: RecordTableTab) {
  tableToRemove.value = table
  moveRecordsTo.value = (tables.value ?? []).find((item) => item.id !== table.id)?.id ?? ""
}
async function removeTable() {
  const table = tableToRemove.value
  if (!table) return
  removingTable.value = true
  try {
    await trpc.recordTable.remove.mutate({ id: table.id, moveTo: table.recordCount ? moveRecordsTo.value : undefined })
    if (table.recordCount) selectTable(moveRecordsTo.value)
    await refreshAll()
    toast.success(`${table.name} deleted`)
    tableToRemove.value = null
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    removingTable.value = false
  }
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
    await refreshAll()
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
    await trpc.record.removeAll.mutate({ tableId: activeTableId.value ?? undefined })
    selected.value = []
    await refreshAll()
    toast.success(`All ${recordLabel.lowerPlural.value} of ${activeTable.value?.name ?? "the table"} removed`)
    showRemoveAll.value = false
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    removingAll.value = false
  }
}

const countLabel = (count: number) => `${count.toLocaleString()} ${count === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value}`
watch(() => firstChunk.value?.data?.total, (count) => {
  if (count !== undefined) announce(countLabel(count))
})
</script>

<template>
  <div class="admin-page admin-resource-page admin-records">
    <AdminPageHeader :title="recordLabel.plural.value" :description="`Create, correct and complete your ${recordLabel.lowerPlural.value}. Changes save as you go and are kept in each ${recordLabel.lower.value}'s history.`">
      <Button as-child variant="outline"><router-link :to="{ name: 'admin-record-import', query: activeTableId ? { table: activeTableId } : {} }"><FileUp class="size-4" />Import</router-link></Button>
      <Button class="dv-button dv-button--primary" @click="grid?.focusNewRow()"><Plus />Add {{ recordLabel.lower.value }}</Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" aria-label="More actions"><EllipsisVertical class="size-5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem :disabled="exporting || !total" @select="exportCsv"><Download />Export {{ narrowed ? "matching" : "all" }} {{ recordLabel.lowerPlural.value }} of this table (CSV)</DropdownMenuItem>
          <DropdownMenuItem @select="editField(null)"><Plus />Add a field</DropdownMenuItem>
          <DropdownMenuItem @select="fieldsOpen = true"><Blocks />Manage fields</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="!total && !narrowed" variant="destructive" @select="showRemoveAll = true"><PackageX />Remove all {{ recordLabel.lowerPlural.value }} of this table</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </AdminPageHeader>

    <div class="records-bar">
    <RecordTableTabs v-if="tables" :tables="tables" :active="activeTableId" @select="selectTable" @create="createTable" @rename="renameTable" @remove="askRemoveTable" @reorder="reorderTables" />

    <div class="records-toolbar">
      <div class="records-search">
        <Search class="size-4" aria-hidden="true" />
        <Input v-model="search" type="search" :aria-label="`Search ${recordLabel.lowerPlural.value}`" :placeholder="`Search ${recordLabel.lowerPlural.value}`" :title="`Searches every field of every ${recordLabel.lower.value} of this table`" />
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
          <label class="records-wrap-switch"><Switch v-model="preferences.wrap" />Wrap text</label>
          <RecordColumns :columns="columnChoices" @order="setOrder" @toggle="toggleColumn" @reset="resetLayout" @add-field="editField(null)" />
        </PopoverContent>
      </Popover>
      <span v-if="sortLabel" class="records-sort-chip">
        <ArrowUp v-if="preferences.sort?.direction === 'asc'" class="size-3.5" aria-hidden="true" /><ArrowDown v-else class="size-3.5" aria-hidden="true" />
        Sorted by {{ sortLabel }}
        <button type="button" :aria-label="`Stop sorting by ${sortLabel}`" @click="preferences.sort = null"><X class="size-3.5" /></button>
      </span>
      <Button v-if="narrowed" variant="ghost" aria-label="Clear search and filters" title="Clear search and filters" @click="clearNarrowing"><X class="size-4" />Clear</Button>
    </div>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>

    <Loader v-if="status === 'pending'" :text="true" />
    <div v-else-if="status === 'error'" class="admin-error" role="alert">{{ error?.message }}</div>
    <template v-else>
      <section v-if="!total && !narrowed && !isFetching" class="dv-panel admin-empty">
        <h2>No {{ recordLabel.lowerPlural.value }} in {{ activeTable?.name ?? "this table" }} yet</h2>
        <p>Add a {{ recordLabel.lower.value }} by typing its {{ keyLabel }} in the last row below, import a CSV or Excel file, or move {{ recordLabel.lowerPlural.value }} here from another table.</p>
        <Button as-child class="dv-button dv-button--primary"><router-link :to="{ name: 'admin-record-import', query: activeTableId ? { table: activeTableId } : {} }"><FileUp class="size-4" />Import</router-link></Button>
      </section>
      <section v-else-if="!total && !isFetching" class="dv-panel admin-empty">
        <h2>No {{ recordLabel.lowerPlural.value }} match</h2>
        <p>Nothing in {{ activeTable?.name ?? "this table" }} matches the search and filters.</p>
        <Button variant="outline" @click="clearNarrowing">Clear search and filters</Button>
      </section>
      <div class="dv-panel records-panel">
        <RecordsGrid ref="grid" v-model:selected="selected" :rows="rows" :list-key="listKey" :columns="columns" :field-count="fields.length" :frozen="frozenCount" :wrap="preferences.wrap"
          :sort="preferences.sort" :record-label="recordLabel.lower.value" :key-label="keyLabel"
          :commit="commitCell" :commit-many="commitCells" :add-option="addOption" :create="createRecord"
          @open="(row, tab) => openRecord(row.id, tab)" @sort="(sort: GridSort) => preferences.sort = sort"
          @resize="(id, width) => preferences.widths = { ...preferences.widths, [id]: width }" @hide="(id) => toggleColumn(id, false)"
          @filter="filterBy" @edit-field="editField" @remove-field="askRemoveField" @reveal="revealRecord" @range="(start, end) => visible = [start, end]" />
      </div>
      <footer class="records-footer admin-text-secondary">
        <span v-if="narrowed && activeTable">{{ total.toLocaleString() }} of {{ countLabel(activeTable.recordCount) }} match</span>
        <span v-else>{{ countLabel(total) }}</span>
        <span v-if="selected.length">· {{ selected.length.toLocaleString() }} selected</span>
        <span v-if="isFetching" class="records-fetching">Updating…</span>
      </footer>
    </template>

    <RecordsBulkBar v-if="selected.length" :count="selected.length" :fields="fields" :record-label="recordLabel.lower.value" :record-label-plural="recordLabel.lowerPlural.value"
      :tables="otherTables" :move="moveSelection"
      :set-field="setFieldOnSelection" :remove="() => removeRecords(selected)" @export="exportCsv" @clear="selected = []" />

    <RecordPanel :record-id="panelId" :tab="panelTab" :fields="fields" :all-fields="allFields" :record-label="recordLabel.lower.value"
      :save="savePanelField" :add-option="addOption" :remove="(id) => removeRecords([id])"
      @close="closeRecord" @update:tab="(tab) => openRecord(panelId!, tab)" @edit-field="editField" @add-field="editField(null)" />

    <RecordFieldsSheet v-model:open="fieldsOpen" :fields="attributes ?? []" :tables="tables ?? []" :record-label="recordLabel.singular.value"
      @add="editField(null)" @edit="editField" @remove="askRemoveField" />
    <FieldEditorDialog v-model:open="fieldDialog.open" :field="fieldDialog.field" :table-id="activeTableId"
      :suggestions="(undeclared ?? []).filter((name) => name !== keyLabel && !allFields.some((field) => field.name === name))" />

    <AlertDialog :open="!!fieldToRemove" @update:open="(open) => { if (!open && !removingField) fieldToRemove = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {{ fieldToRemove ? fieldLabel(fieldToRemove) : "" }}?</AlertDialogTitle>
          <AlertDialogDescription>
            <template v-if="fieldUsage === null">Counting the values…</template>
            <template v-else>{{ fieldUsage }} {{ fieldUsage === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value }} hold a value in this field.</template>
            The field and its values are removed from every {{ recordLabel.lower.value }} of every table; each one keeps the value it lost in its history. To only stop showing it here, hide the column or untick this table in Manage fields. A later import with this column adds it back as text.
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
          <AlertDialogTitle>Remove all {{ recordLabel.lowerPlural.value }} of {{ activeTable?.name }}?</AlertDialogTitle>
          <AlertDialogDescription>This removes every {{ recordLabel.lower.value }} of this table, including those outside the current search and filters. Other tables keep theirs. Their values stay in the history and linked files wait, listed as dangling, until the keys exist again.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="removingAll">Cancel</AlertDialogCancel>
          <Button variant="destructive" :disabled="removingAll" @click="removeAll">{{ removingAll ? "Removing…" : `Remove all ${recordLabel.lowerPlural.value}` }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="!!tableToRemove" @update:open="(open) => { if (!open && !removingTable) tableToRemove = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the {{ tableToRemove?.name }} table?</AlertDialogTitle>
          <AlertDialogDescription>
            <template v-if="tableToRemove?.recordCount">Its {{ countLabel(tableToRemove.recordCount) }} move to another table with their values, files and history.</template>
            <template v-else>It holds no {{ recordLabel.lower.value }}.</template>
            Fields stay in the catalogue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div v-if="tableToRemove?.recordCount" class="flex flex-col gap-2">
          <Label for="remove-table-move">Move them to</Label>
          <select id="remove-table-move" v-model="moveRecordsTo" class="record-native-select">
            <option v-for="table in (tables ?? []).filter((item) => item.id !== tableToRemove?.id)" :key="table.id" :value="table.id">{{ table.name }}</option>
          </select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="removingTable">Cancel</AlertDialogCancel>
          <Button variant="destructive" :disabled="removingTable || (!!tableToRemove?.recordCount && !moveRecordsTo)" @click="removeTable">{{ removingTable ? "Deleting…" : "Delete table" }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
