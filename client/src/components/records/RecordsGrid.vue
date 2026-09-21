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
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { moveForKey, moveInGrid, startsTyping, type GridMove, type GridPosition } from "@/composables/useGridNavigation"
import { fillDownPlan, fillPlan, inRange, pastePlan, parseClipboard, rangeOf, rangeSize, toClipboard, type CellWrite, type GridRange } from "@/utils/gridRange"
import { VALUE_TYPE_LABELS, type ValueField } from "@/utils/recordValues"
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Filter, Maximize2, PencilLine, Plus, Trash2 } from "@lucide/vue"
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import RecordCellEditor, { type EditorMove } from "./RecordCellEditor.vue"
import RecordCellValue from "./RecordCellValue.vue"

export type GridField = ValueField & { id: string }
export type GridRecord = { id: string, recordKey: string, metaData: Record<string, string>, thumbnailURL: string | null, fileCount: number, filledCount: number }
export type GridColumn = { id: string, kind: "thumbnail" | "key" | "field" | "files" | "filled", label: string, width: number, sortKey?: string, field?: GridField }
export type GridSort = { column: string, direction: "asc" | "desc" } | null
export type GridWrite = { record: GridRecord, field: GridField, value: string }

const props = defineProps<{
  rows: GridRecord[]
  columns: GridColumn[]
  fieldCount: number
  wrap?: boolean
  sort: GridSort
  selected: string[]
  recordLabel: string
  keyLabel: string
  commit: (record: GridRecord, field: GridField, value: string) => Promise<void>
  commitMany: (writes: GridWrite[], skipped: number) => Promise<void>
  addOption: (field: GridField, option: string) => Promise<void>
  create: (key: string) => Promise<void>
}>()
const emit = defineEmits<{
  "update:selected": [ids: string[]]
  open: [record: GridRecord, tab?: "fields" | "files" | "history"]
  sort: [sort: GridSort]
  resize: [columnId: string, width: number]
  hide: [columnId: string]
  filter: [column: GridColumn]
  editField: [field: GridField]
  removeField: [field: GridField]
}>()

const root = ref<HTMLElement | null>(null)
const newKeyInput = ref<HTMLInputElement | null>(null)
const focused = ref<GridPosition>({ row: 0, column: 0 })
const editing = ref<{ row: number, column: number, initial: string, typed?: string, draft?: string } | null>(null)
// The selected range runs from the focused cell to "head"; null is the focused
// cell alone. "copied" keeps the dashed outline of the last copy.
const head = ref<GridPosition | null>(null)
const copied = ref<GridRange | null>(null)
const fillTo = ref<number | null>(null)
const range = computed(() => rangeOf(focused.value, head.value ?? focused.value))
const multi = computed(() => !!head.value && (head.value.row !== focused.value.row || head.value.column !== focused.value.column))
const fillRange = computed(() => fillTo.value === null ? null : { ...range.value, top: Math.min(range.value.top, fillTo.value), bottom: Math.max(range.value.bottom, fillTo.value) })
const rangeMessage = ref("")
// The table is exactly as wide as its columns, so a long value never widens one.
const tableWidth = computed(() => 40 + props.columns.reduce((total, column) => total + column.width, 0))
const newKey = ref("")
const newKeyError = ref("")
const creating = ref(false)

const shape = computed(() => ({
  rows: props.rows.length,
  columns: props.columns.length,
  editable: (column: number) => props.columns[column]?.kind === "field",
}))
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((row) => props.selected.includes(row.id)))
const someSelected = computed(() => props.rows.some((row) => props.selected.includes(row.id)))

function cellElement(position: GridPosition): HTMLElement | null {
  return root.value?.querySelector(`[data-cell="${position.row}-${position.column}"]`) ?? null
}

function focusCell(position: GridPosition) {
  focused.value = position
  nextTick(() => cellElement(position)?.focus())
}

function valueAt(position: GridPosition): string {
  const column = props.columns[position.column]
  const row = props.rows[position.row]
  if (!column || !row) return ""
  if (column.kind === "key") return row.recordKey
  if (column.kind === "field" && column.field) return row.metaData[column.field.name] ?? ""
  return ""
}

function startEdit(position: GridPosition, typed?: string) {
  if (!shape.value.editable(position.column) || isEditing(position)) return
  focused.value = position
  editing.value = { ...position, initial: valueAt(position), typed }
}

function activate(position: GridPosition) {
  const column = props.columns[position.column]
  const row = props.rows[position.row]
  if (!column || !row) return
  if (column.kind === "field") startEdit(position)
  else if (column.kind === "files" || column.kind === "thumbnail") emit("open", row, "files")
  else emit("open", row)
}

async function save(position: GridPosition, value: string) {
  const column = props.columns[position.column]
  const row = props.rows[position.row]
  if (!column?.field || !row || value === (row.metaData[column.field.name] ?? "")) return
  try {
    await props.commit(row, column.field, value)
  } catch {
    // The parent said why; the admin gets the rejected text back to fix it.
    editing.value = { ...position, initial: value }
  }
}

function onCommit(value: string, move?: EditorMove) {
  const edit = editing.value
  if (!edit) return
  editing.value = null
  const position = { row: edit.row, column: edit.column }
  const moves: Record<EditorMove, GridMove> = { down: "down", up: "up", next: "next", previous: "previous" }
  focusCell(move ? moveInGrid(position, moves[move], shape.value) : position)
  save(position, value)
}

function onCancel() {
  const edit = editing.value
  editing.value = null
  if (edit) focusCell({ row: edit.row, column: edit.column })
}

function onKeydown(event: KeyboardEvent) {
  if (editing.value || !(event.target as HTMLElement).matches("[data-cell]")) return
  const position = focused.value
  const move = moveForKey(event)
  if (move && event.shiftKey && move !== "next" && move !== "previous") {
    event.preventDefault()
    extendTo(moveInGrid(head.value ?? position, move, shape.value))
    return
  }
  if (move) {
    head.value = null
    const next = moveInGrid(position, move, shape.value)
    if ((move === "next" || move === "previous") && next.row === position.row && next.column === position.column) return
    event.preventDefault()
    focusCell(next)
    return
  }
  const shortcut = event.ctrlKey || event.metaKey
  if (event.key === "Escape" && (multi.value || copied.value)) { head.value = null; copied.value = null; rangeMessage.value = "" }
  else if (event.key === "Enter" || event.key === "F2") { head.value = null; activate(position) }
  else if (event.key === "Delete" || event.key === "Backspace") {
    const writes: CellWrite[] = []
    for (let row = range.value.top; row <= range.value.bottom; row++) {
      for (let column = range.value.left; column <= range.value.right; column++) if (shape.value.editable(column)) writes.push({ row, column, value: "" })
    }
    if (writes.length) writeCells(writes)
  }
  else if (shortcut && event.key.toLowerCase() === "a") select({ row: 0, column: 0 }, { row: shape.value.rows - 1, column: shape.value.columns - 1 })
  else if (shortcut && event.key.toLowerCase() === "d") {
    const writes = fillDownPlan(range.value, valueAt)
    if (writes.length) writeCells(writes)
  }
  // Space opens the value to continue it; any other key replaces it.
  else if (event.key === " " && !shortcut && shape.value.editable(position.column)) { head.value = null; startEdit(position) }
  else if (startsTyping(event) && shape.value.editable(position.column)) { head.value = null; startEdit(position, event.key) }
  else return
  event.preventDefault()
}

function isEditing(position: GridPosition) {
  return editing.value?.row === position.row && editing.value?.column === position.column
}

function select(anchor: GridPosition, to: GridPosition | null) {
  focusCell(anchor)
  head.value = to
  const size = rangeSize(rangeOf(anchor, to ?? anchor))
  rangeMessage.value = size.rows * size.columns > 1 ? `${size.rows} rows by ${size.columns} columns selected` : ""
}

function extendTo(position: GridPosition) {
  head.value = position
  const size = rangeSize(range.value)
  rangeMessage.value = `${size.rows} rows by ${size.columns} columns selected`
  nextTick(() => cellElement(position)?.scrollIntoView({ block: "nearest", inline: "nearest" }))
}

function rangeValues(target: GridRange): string[][] {
  const block: string[][] = []
  for (let row = target.top; row <= target.bottom; row++) {
    const line: string[] = []
    for (let column = target.left; column <= target.right; column++) line.push(valueAt({ row, column }))
    block.push(line)
  }
  return block
}

// Writes to read-only cells (key, picture, counts) are dropped and counted.
async function writeCells(writes: CellWrite[]) {
  const accepted: GridWrite[] = []
  for (const write of writes) {
    const column = props.columns[write.column]
    const row = props.rows[write.row]
    if (column?.kind === "field" && column.field && row) accepted.push({ record: row, field: column.field, value: write.value })
  }
  const skipped = writes.length - accepted.length
  if (accepted.length === 1 && !skipped) {
    const only = writes[0]
    return save({ row: only.row, column: only.column }, only.value)
  }
  await props.commitMany(accepted, skipped)
}

function onCopy(event: ClipboardEvent) {
  if (editing.value || !(event.target as HTMLElement).matches("[data-cell]")) return
  event.preventDefault()
  event.clipboardData?.setData("text/plain", toClipboard(rangeValues(range.value)))
  copied.value = { ...range.value }
  const size = rangeSize(range.value)
  rangeMessage.value = `${size.rows * size.columns === 1 ? "Cell" : `${size.rows * size.columns} cells`} copied`
}

function onPaste(event: ClipboardEvent) {
  if (editing.value || !(event.target as HTMLElement).matches("[data-cell]")) return
  const text = event.clipboardData?.getData("text/plain")
  if (text == null || text === "") return
  event.preventDefault()
  const writes = pastePlan(parseClipboard(text), range.value, shape.value)
  if (!writes.length) return
  const last = writes[writes.length - 1]
  if (writes.length > 1) select({ row: writes[0].row, column: writes[0].column }, { row: last.row, column: last.column })
  copied.value = null
  writeCells(writes)
}

function applyFill(toRow: number) {
  const plan = fillPlan(range.value, toRow, valueAt)
  if (!plan.writes.length) return
  select({ row: plan.range.top, column: plan.range.left }, { row: plan.range.bottom, column: plan.range.right })
  writeCells(plan.writes)
}

function startFill(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  fillTo.value = range.value.bottom
  const onMove = (move: PointerEvent) => {
    const cell = document.elementFromPoint(move.clientX, move.clientY)?.closest<HTMLElement>("[data-cell]")
    if (cell && root.value?.contains(cell)) fillTo.value = Number(cell.dataset.cell!.split("-")[0])
  }
  const onUp = () => {
    handle.removeEventListener("pointermove", onMove)
    handle.removeEventListener("pointerup", onUp)
    const to = fillTo.value
    fillTo.value = null
    if (to !== null) applyFill(to)
  }
  handle.addEventListener("pointermove", onMove)
  handle.addEventListener("pointerup", onUp)
}

function edgeClass(target: GridRange | null, prefix: string, r: number, c: number): string[] {
  if (!target || !inRange(target, r, c)) return []
  const edges = [prefix]
  if (r === target.top) edges.push(`${prefix}-top`)
  if (r === target.bottom) edges.push(`${prefix}-bottom`)
  if (c === target.left) edges.push(`${prefix}-left`)
  if (c === target.right) edges.push(`${prefix}-right`)
  return edges
}

function cellClasses(r: number, c: number): string[] {
  return [
    ...(multi.value ? edgeClass(range.value, "in-range", r, c) : []),
    ...edgeClass(copied.value, "copied", r, c),
    ...(fillRange.value && !inRange(range.value, r, c) ? edgeClass(fillRange.value, "fill", r, c) : []),
  ]
}

const showFillHandle = (r: number, c: number) => !editing.value && r === range.value.bottom && c === range.value.right && props.columns[c]?.kind === "field"

// Dragging across cells selects a range.
let dragging = false
function stopDragging() { dragging = false }
window.addEventListener("mouseup", stopDragging)
onBeforeUnmount(() => window.removeEventListener("mouseup", stopDragging))
function onCellMouseenter(position: GridPosition, event: MouseEvent) {
  if (!dragging || !(event.buttons & 1)) return
  extendTo(position)
}

watch(() => props.rows.map((row) => row.id).join(), () => {
  head.value = null
  copied.value = null
  if (focused.value.row >= props.rows.length) focused.value = { row: Math.max(0, props.rows.length - 1), column: focused.value.column }
})

// A cell takes focus on mouse down, before its click: whether it already had
// focus is read then, so the first click selects and the second edits.
// Shift+click stretches the range instead.
let focusedBeforeClick = false
let extendedByClick = false
function onCellMousedown(position: GridPosition, event: MouseEvent) {
  extendedByClick = false
  if (event.button !== 0 || isEditing(position)) return
  if (event.shiftKey) {
    event.preventDefault()
    extendTo(position)
    extendedByClick = true
    return
  }
  focusedBeforeClick = focused.value.row === position.row && focused.value.column === position.column && document.activeElement === cellElement(position) && !multi.value
  head.value = null
  rangeMessage.value = ""
  dragging = true
}

function onCellClick(position: GridPosition) {
  if (extendedByClick) { extendedByClick = false; return }
  if (isEditing(position)) return
  if (focusedBeforeClick) activate(position)
  else if (!multi.value || !inRange(range.value, position.row, position.column) || document.activeElement !== cellElement(position)) {
    head.value = null
    focusCell(position)
  }
  focusedBeforeClick = false
}

function toggleRow(id: string, checked: boolean) {
  emit("update:selected", checked ? [...new Set([...props.selected, id])] : props.selected.filter((item) => item !== id))
}

function toggleAll(checked: boolean) {
  const ids = props.rows.map((row) => row.id)
  emit("update:selected", checked ? [...new Set([...props.selected, ...ids])] : props.selected.filter((id) => !ids.includes(id)))
}

function ariaSort(column: GridColumn) {
  if (!column.sortKey || props.sort?.column !== column.sortKey) return undefined
  return props.sort.direction === "asc" ? "ascending" : "descending"
}

function startResize(event: PointerEvent, column: GridColumn) {
  const startX = event.clientX
  const startWidth = column.width
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const onMove = (move: PointerEvent) => emit("resize", column.id, Math.min(800, Math.max(60, startWidth + move.clientX - startX)))
  const onUp = () => {
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
  }
  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
}

function resizeByKey(event: KeyboardEvent, column: GridColumn) {
  const delta = event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0
  if (!delta) return
  event.preventDefault()
  emit("resize", column.id, Math.min(800, Math.max(60, column.width + delta)))
}

async function submitNewKey() {
  const key = newKey.value.trim()
  if (!key || creating.value) return
  creating.value = true
  newKeyError.value = ""
  try {
    await props.create(key)
    newKey.value = ""
  } catch (error) {
    newKeyError.value = (error as Error).message
  } finally {
    creating.value = false
  }
}

defineExpose({
  focusNewRow: () => {
    newKeyInput.value?.scrollIntoView({ block: "nearest" })
    newKeyInput.value?.focus()
  },
})
</script>

<template>
  <div ref="root" class="records-grid-wrap">
    <p class="sr-only" role="status" aria-live="polite">{{ rangeMessage }}</p>
    <table class="records-grid" :class="{ 'is-wrapped': wrap }" :style="{ width: `${tableWidth}px` }" role="grid" aria-multiselectable="true" :aria-label="`${recordLabel} list`" :aria-rowcount="rows.length + 1">
      <colgroup>
        <col style="width: 40px" />
        <col v-for="column in columns" :key="column.id" :style="{ width: `${column.width}px` }" />
      </colgroup>
      <thead>
        <tr>
          <th class="records-grid-select" scope="col">
            <Checkbox :model-value="allSelected ? true : someSelected ? 'indeterminate' : false" :aria-label="`Select every ${recordLabel} on this page`"
              :disabled="!rows.length" @update:model-value="(value) => toggleAll(value === true)" />
          </th>
          <th v-for="column in columns" :key="column.id" scope="col" :aria-sort="ariaSort(column)"
            :class="{ 'is-sticky-key': column.kind === 'key', 'is-thumbnail': column.kind === 'thumbnail' }">
            <div class="records-grid-heading">
              <span v-if="column.kind === 'thumbnail'" class="sr-only">{{ column.label }}</span>
              <DropdownMenu v-else>
                <DropdownMenuTrigger as-child>
                  <button type="button" class="records-grid-heading-button" :title="column.field ? VALUE_TYPE_LABELS[column.field.valueType] : undefined">
                    <span class="truncate">{{ column.label }}</span>
                    <ArrowUp v-if="ariaSort(column) === 'ascending'" class="size-3.5 shrink-0" aria-hidden="true" />
                    <ArrowDown v-else-if="ariaSort(column) === 'descending'" class="size-3.5 shrink-0" aria-hidden="true" />
                    <ChevronDown class="size-3.5 shrink-0 records-grid-heading-chevron" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <template v-if="column.sortKey">
                    <DropdownMenuItem @select="emit('sort', { column: column.sortKey!, direction: 'asc' })"><ArrowUp class="size-4" />Sort ascending</DropdownMenuItem>
                    <DropdownMenuItem @select="emit('sort', { column: column.sortKey!, direction: 'desc' })"><ArrowDown class="size-4" />Sort descending</DropdownMenuItem>
                  </template>
                  <DropdownMenuItem v-if="column.kind === 'field' || column.kind === 'key'" @select="emit('filter', column)"><Filter class="size-4" />Filter by this field</DropdownMenuItem>
                  <DropdownMenuItem v-if="column.kind !== 'key'" @select="emit('hide', column.id)"><EyeOff class="size-4" />Hide</DropdownMenuItem>
                  <template v-if="column.field">
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @select="emit('editField', column.field!)"><PencilLine class="size-4" />Edit field</DropdownMenuItem>
                    <DropdownMenuItem @select="emit('removeField', column.field!)"><Trash2 class="size-4" />Remove field</DropdownMenuItem>
                  </template>
                </DropdownMenuContent>
              </DropdownMenu>
              <span v-if="column.kind !== 'thumbnail'" role="separator" aria-orientation="vertical" tabindex="0" class="records-grid-resize"
                :aria-label="`Resize ${column.label}`" :aria-valuenow="column.width" aria-valuemin="60" aria-valuemax="800"
                @pointerdown.prevent="startResize($event, column)" @keydown="resizeByKey($event, column)" />
            </div>
          </th>
        </tr>
      </thead>
      <tbody @keydown="onKeydown" @copy="onCopy" @paste="onPaste">
        <tr v-for="(row, r) in rows" :key="row.id" :aria-selected="selected.includes(row.id)" :class="{ 'is-selected': selected.includes(row.id) }">
          <td class="records-grid-select">
            <Checkbox :model-value="selected.includes(row.id)" :aria-label="`Select ${row.recordKey}`" @update:model-value="(value) => toggleRow(row.id, value === true)" />
          </td>
          <td v-for="(column, c) in columns" :key="column.id" role="gridcell" :data-cell="`${r}-${c}`"
            :tabindex="focused.row === r && focused.column === c ? 0 : -1"
            :aria-readonly="column.kind !== 'field' || undefined"
            :aria-selected="multi && inRange(range, r, c) ? true : undefined"
            :class="[cellClasses(r, c), {
              'is-editable': column.kind === 'field',
              'is-editing': editing?.row === r && editing?.column === c,
              'is-sticky-key': column.kind === 'key',
              'is-thumbnail': column.kind === 'thumbnail',
            }]"
            @mousedown="onCellMousedown({ row: r, column: c }, $event)" @mouseenter="onCellMouseenter({ row: r, column: c }, $event)" @click="onCellClick({ row: r, column: c })" @dblclick="startEdit({ row: r, column: c })" @focus="focused = { row: r, column: c }">
            <template v-if="column.kind === 'thumbnail'">
              <button type="button" tabindex="-1" class="records-grid-thumbnail" :aria-label="`Files of ${row.recordKey}`" @click.stop="emit('open', row, 'files')">
                <img v-if="row.thumbnailURL" :src="row.thumbnailURL" alt="" loading="lazy" decoding="async" /><ThumbnailPlaceholder v-else class="record-placeholder" aria-hidden="true" />
              </button>
            </template>
            <div v-else-if="column.kind === 'key'" class="records-grid-key">
              <span class="truncate">{{ row.recordKey }}</span>
              <button type="button" tabindex="-1" class="records-grid-open" :aria-label="`Open ${row.recordKey}`" @click.stop="emit('open', row)"><Maximize2 class="size-3.5" /></button>
            </div>
            <template v-else-if="column.kind === 'field' && column.field">
              <RecordCellEditor v-if="editing?.row === r && editing?.column === c" :field="column.field" :initial="editing.initial" :typed="editing.typed"
                :add-option="(option) => addOption(column.field!, option)" @commit="onCommit" @cancel="onCancel" @draft="(value) => editing && (editing.draft = value)" />
              <RecordCellValue :class="{ 'is-hidden-behind-editor': editing?.row === r && editing?.column === c && column.field.valueType !== 'single_select' && column.field.valueType !== 'multi_select' && column.field.valueType !== 'long_text' }" :field="column.field" :value="isEditing({ row: r, column: c }) && editing?.draft !== undefined ? editing.draft : row.metaData[column.field.name]" />
            </template>
            <button v-else-if="column.kind === 'files'" type="button" tabindex="-1" class="records-grid-count" @click.stop="emit('open', row, 'files')">
              {{ row.fileCount }}<span class="sr-only"> files</span>
            </button>
            <span v-else-if="column.kind === 'filled'" class="records-grid-filled" :title="`${row.filledCount} of ${fieldCount} fields filled`">
              <span class="records-grid-meter" aria-hidden="true"><span :style="{ width: `${fieldCount ? Math.round(row.filledCount / fieldCount * 100) : 0}%` }" /></span>
              {{ row.filledCount }}/{{ fieldCount }}
            </span>
            <span v-if="showFillHandle(r, c)" class="records-grid-fill-handle" aria-hidden="true" title="Drag to fill, double-click to fill to the last row"
              @mousedown.stop.prevent @click.stop @pointerdown.stop.prevent="startFill" @dblclick.stop="applyFill(rows.length - 1)" />
          </td>
        </tr>
        <tr class="records-grid-new">
          <td class="records-grid-select"><Plus class="size-4 mx-auto admin-text-secondary" aria-hidden="true" /></td>
          <td :colspan="columns.length">
            <form class="records-grid-new-form" @submit.prevent="submitNewKey">
              <input ref="newKeyInput" v-model="newKey" type="text" :disabled="creating" :aria-invalid="!!newKeyError || undefined"
                :aria-describedby="newKeyError ? 'new-record-error' : undefined" :aria-label="`${keyLabel} of a new ${recordLabel}`"
                :placeholder="`Add a ${recordLabel}: type its ${keyLabel} and press Enter`" @input="newKeyError = ''" />
              <span v-if="newKeyError" id="new-record-error" role="alert" class="admin-form-error">{{ newKeyError }}</span>
            </form>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
