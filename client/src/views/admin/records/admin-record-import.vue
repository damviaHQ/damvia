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
import RecordImportReview from "@/components/records/RecordImportReview.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc, type RouterOutput } from "@/services/server.ts"
import { buildRows, defaultTargets, mappingErrors, readCsv, readWorkbook, REVIEW_GROUP_OF, sampleValues, uniqueTableName, type ColumnTargets, type CsvFile } from "@/utils/recordImport"
import { fieldLabel, VALUE_TYPE_LABELS } from "@/utils/recordValues"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CircleCheck, FileSpreadsheet, FileText, Upload } from "@lucide/vue"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"

type Comparison = RouterOutput["record"]["compareCsv"]
type Result = RouterOutput["record"]["importCsv"]
type Step = "file" | "tables" | "columns" | "review" | "done"
// A CSV file, or one sheet of a workbook, and the table it goes to: an
// existing one, or a new one created right before its import.
type Source = {
  name: string
  csv: CsvFile | null
  error: string | null
  include: boolean
  target: string
  newName: string
  tableId: string | null
  tableName: string | null
  result: Result | null
  leftOut: number
}
const NEW_TABLE = "new"

const recordLabel = useRecordLabel()
const queryClient = useQueryClient()
const route = useRoute()
const { data: fields, status: fieldsStatus } = useQuery({ queryKey: ["records", "attributes"], queryFn: () => trpc.recordAttribute.list.query() })
const { data: tables, status: tablesStatus } = useQuery({ queryKey: ["records", "tables"], queryFn: () => trpc.recordTable.list.query() })
const { data: catalogue, status: catalogueStatus } = useQuery({ queryKey: ["records", "import-context"], queryFn: () => trpc.record.list.query({ offset: 0, limit: 1 }) })
const catalogueKey = computed(() => catalogue.value?.keyColumnName ?? null)
const openTable = computed(() => tables.value?.find((table) => table.id === route.query.table) ?? tables.value?.[0] ?? null)

const step = ref<Step>("file")
const STEPS: { id: Step, label: string }[] = [{ id: "file", label: "File" }, { id: "tables", label: "Tables" }, { id: "columns", label: "Columns" }, { id: "review", label: "Review" }]
const stepIndex = computed(() => STEPS.findIndex((entry) => entry.id === step.value))

// File
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const fileError = ref("")
const fileName = ref("")
const workbook = ref(false)
const sources = ref<Source[]>([])
const reading = ref(false)

// New tables are named after their sheet, numbered when the name is taken by
// a table or by another sheet of the file.
function nameNewTables() {
  const taken = (tables.value ?? []).map((table) => table.name)
  for (const source of sources.value) {
    if (source.target !== NEW_TABLE || source.tableId) continue
    source.newName = uniqueTableName(source.newName.trim() || source.name, taken)
    taken.push(source.newName)
  }
}

async function open(file: File | undefined) {
  if (!file) return
  fileError.value = ""
  const isWorkbook = /\.xlsx$/i.test(file.name)
  if (/\.(xls|xlsm|xlsb|ods|numbers)$/i.test(file.name)) {
    fileError.value = `${file.name} cannot be read. Save it as an Excel workbook (.xlsx) or as CSV (UTF-8) and choose it again.`
    return
  }
  if (!isWorkbook && !/\.(csv|tsv|txt)$/i.test(file.name)) {
    fileError.value = `${file.name} is not a CSV or Excel file.`
    return
  }
  reading.value = true
  try {
    const read = isWorkbook ? await readWorkbook(file) : [{ name: file.name.replace(/\.[^.]+$/, ""), csv: await readCsv(file), error: null }]
    sources.value = read.map((sheet) => ({
      ...sheet,
      include: !!sheet.csv,
      // A CSV goes to the open table; each sheet of a workbook to a new table.
      target: isWorkbook || !openTable.value ? NEW_TABLE : openTable.value.id,
      newName: sheet.name,
      tableId: null,
      tableName: null,
      result: null,
      leftOut: 0,
    }))
    nameNewTables()
  } catch (failure) {
    fileError.value = `${file.name} could not be read: ${(failure as Error).message}`
    return
  } finally {
    reading.value = false
  }
  if (!sources.value.some((source) => source.csv)) {
    fileError.value = `${file.name} has no sheet with a header row and data under it.`
    return
  }
  fileName.value = file.name
  workbook.value = isWorkbook
  step.value = "tables"
}
function onDrop(event: DragEvent) {
  dragging.value = false
  open(event.dataTransfer?.files?.[0])
}
function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  open(input.files?.[0])
  input.value = ""
}

// Tables
const included = computed(() => sources.value.filter((source) => source.include && source.csv))
const current = ref(0)
const source = computed(() => included.value[current.value] ?? null)
const csv = computed(() => source.value?.csv ?? null)
const tableNameOf = (item: Source) => item.target === NEW_TABLE ? item.tableName ?? item.newName : tables.value?.find((table) => table.id === item.target)?.name ?? ""
const tablesError = computed(() => {
  if (!included.value.length) return "Choose at least one sheet to import."
  const names = included.value.filter((item) => item.target === NEW_TABLE).map((item) => item.newName.trim().toLowerCase())
  if (names.some((name) => !name)) return "Give each new table a name."
  if (new Set(names).size !== names.length) return "Two new tables have the same name."
  if (names.some((name) => (tables.value ?? []).some((table) => table.name.toLowerCase() === name))) return "A new table has the name of an existing table. Rename it, or import into the existing table."
  return ""
})

function startSource(index: number) {
  current.value = index
  const columns = csv.value?.columns ?? []
  keyColumn.value = catalogueKey.value && columns.includes(catalogueKey.value) ? catalogueKey.value : columns[0]
  targets.value = defaultTargets(columns, fields.value)
  keepStored.value = "keep"
  compareError.value = ""
  comparison.value = null
  step.value = "columns"
}

// Columns
const keyColumn = ref("")
const targets = ref<ColumnTargets>({})
const keepStored = ref<"keep" | "clear">("keep")
const keyLocked = computed(() => !!catalogueKey.value && !!csv.value?.columns.includes(catalogueKey.value))
const keyLabel = computed(() => catalogueKey.value ?? keyColumn.value ?? "Key")
const fieldNames = computed(() => new Set((fields.value ?? []).map((field) => field.name)))
const dataColumns = computed(() => (csv.value?.columns ?? []).filter((column) => column !== keyColumn.value))
const errors = computed(() => mappingErrors(targets.value, keyColumn.value, catalogueKey.value))
const importedColumns = computed(() => dataColumns.value.filter((column) => targets.value[column]))
const samples = computed(() => Object.fromEntries(dataColumns.value.map((column) => [column, sampleValues(csv.value?.rows ?? [], column)])))
const missingKeys = computed(() => (csv.value?.rows ?? []).filter((row) => !row[keyColumn.value]?.trim()).length)
const labels = computed(() => Object.fromEntries((fields.value ?? []).map((field) => [field.name, fieldLabel(field)])))

// Review
const comparison = ref<Comparison | null>(null)
const sent = ref<Record<string, string>[]>([])
const comparing = ref(false)
const compareError = ref("")
const selected = ref<Record<string, boolean>>({})

async function compare() {
  if (!csv.value || !source.value || Object.keys(errors.value).length) return
  comparing.value = true
  compareError.value = ""
  try {
    sent.value = buildRows(csv.value, keyColumn.value, targets.value, keepStored.value === "keep")
    const tableId = source.value.target === NEW_TABLE ? source.value.tableId ?? undefined : source.value.target
    comparison.value = await trpc.record.compareCsv.mutate({ tableId, keyColumnName: keyColumn.value, data: sent.value })
    // Every change is applied unless unticked.
    selected.value = Object.fromEntries(comparison.value.rows.filter((row) => row.status === "changed").map((row) => [row.key, true]))
    step.value = "review"
  } catch (failure) {
    compareError.value = (failure as Error).message
  } finally {
    comparing.value = false
  }
}

const rowsToImport = computed(() => (comparison.value?.rows ?? []).flatMap((row, index) =>
  row.status === "new" || (row.status === "changed" && selected.value[row.key]) ? [sent.value[index]] : []))
const counts = computed(() => {
  const rows = comparison.value?.rows ?? []
  const changed = rows.filter((row) => row.status === "changed")
  return {
    create: rows.filter((row) => row.status === "new").length,
    update: changed.filter((row) => selected.value[row.key]).length,
    changed: changed.length,
    skipped: rows.filter((row) => REVIEW_GROUP_OF[row.status] === "skipped").length,
    elsewhere: rows.filter((row) => row.otherTable && (row.status === "changed" || row.status === "unchanged")).length,
  }
})

// Import: a new table is created just before its rows go in, once.
const importing = ref(false)
const importError = ref("")

async function runImport() {
  const item = source.value
  if (!item || !rowsToImport.value.length) return
  importing.value = true
  importError.value = ""
  try {
    if (item.target === NEW_TABLE && !item.tableId) {
      const table = await trpc.recordTable.create.mutate({ name: item.newName.trim() })
      item.tableId = table.id
      item.tableName = table.name
      await queryClient.invalidateQueries({ queryKey: ["records", "tables"] })
    }
    const tableId = item.target === NEW_TABLE ? item.tableId! : item.target
    item.result = await trpc.record.importCsv.mutate({ tableId, keyColumnName: keyColumn.value, data: rowsToImport.value })
    item.leftOut = counts.value.skipped + counts.value.changed - counts.value.update
    await queryClient.invalidateQueries({ queryKey: ["records"] })
    next()
  } catch (failure) {
    importError.value = (failure as Error).message
  } finally {
    importing.value = false
  }
}

// On to the next sheet, or to the summary after the last.
function next() {
  if (current.value + 1 < included.value.length) startSource(current.value + 1)
  else step.value = "done"
}

const imported = computed(() => included.value.filter((item) => item.result))
const firstTableId = computed(() => {
  const item = imported.value[0]
  return item ? (item.target === NEW_TABLE ? item.tableId : item.target) : null
})

function restart() {
  sources.value = []
  comparison.value = null
  current.value = 0
  step.value = "file"
}

watch(step, () => window.scrollTo({ top: 0 }))
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
</script>

<template>
  <div class="admin-page admin-resource-page admin-record-import" :class="{ 'is-review': step === 'review' && comparison }">
    <AdminPageHeader :title="`Import ${recordLabel.lowerPlural.value}`"
      :description="`Create and update ${recordLabel.lowerPlural.value} from a CSV or Excel file. Each sheet of a workbook becomes a table. You see every change before anything is saved.`" />

    <ol v-if="step !== 'done'" class="import-steps">
      <li v-for="(entry, index) in STEPS" :key="entry.id" :class="{ 'is-done': index < stepIndex, 'is-current': index === stepIndex }"
        :aria-current="index === stepIndex ? 'step' : undefined">
        <span class="import-step-number" aria-hidden="true">{{ index + 1 }}</span>{{ entry.label }}
      </li>
    </ol>

    <Loader v-if="fieldsStatus === 'pending' || catalogueStatus === 'pending' || tablesStatus === 'pending'" :text="true" />

    <!-- 1. File -->
    <section v-else-if="step === 'file'" class="dv-panel import-panel">
      <div class="import-drop" :class="{ 'is-dragging': dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
        <Upload class="size-6" aria-hidden="true" />
        <p><strong>Drop a CSV or Excel file here</strong> or</p>
        <Button variant="outline" :disabled="reading" @click="fileInput?.click()">{{ reading ? "Reading…" : "Choose a file" }}</Button>
        <input ref="fileInput" type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="sr-only" tabindex="-1" aria-label="Choose a CSV or Excel file" @change="onPick" />
      </div>
      <p v-if="fileError" class="admin-error" role="alert">{{ fileError }}</p>
      <ul class="import-tips">
        <li>The first row names the columns, and each row after it is one {{ recordLabel.lower.value }}.</li>
        <li>One column holds the {{ catalogueKey ?? "key" }} of each {{ recordLabel.lower.value }}. Rows with a {{ catalogueKey ?? "key" }} already stored update that {{ recordLabel.lower.value }}; the others create one.</li>
        <li>An Excel workbook (.xlsx) brings every sheet at once: each sheet goes to a table of its own, named after the sheet. Fields are shared, so a Color column in two sheets fills the same Color field.</li>
        <li>A CSV file goes to the table open on the {{ recordLabel.lowerPlural.value }} page, or to another one you choose. Commas, semicolons and tabs all work.</li>
        <li>To update what is stored, start from <router-link :to="{ name: 'admin-records' }">Export</router-link> on the {{ recordLabel.lowerPlural.value }} page.</li>
      </ul>
    </section>

    <!-- 2. Tables -->
    <section v-else-if="step === 'tables'" class="dv-panel import-panel">
      <div class="import-file">
        <component :is="workbook ? FileSpreadsheet : FileText" class="size-5" aria-hidden="true" />
        <div><strong>{{ fileName }}</strong><span class="admin-text-secondary">{{ workbook ? plural(sources.length, "sheet", "sheets") : plural(sources[0]?.csv?.rows.length ?? 0, "row", "rows") }}</span></div>
        <Button variant="ghost" size="sm" @click="restart">Choose another file</Button>
      </div>
      <table class="import-table import-sheets">
        <thead>
          <tr><th v-if="workbook"><span class="sr-only">Import</span></th><th>{{ workbook ? "Sheet" : "File" }}</th><th>Rows</th><th>Import into</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in sources" :key="item.name" :class="{ 'is-off': !item.include }">
            <td v-if="workbook"><Checkbox v-model="item.include" :disabled="!item.csv" :aria-label="`Import the sheet ${item.name}`" /></td>
            <td class="import-key">{{ item.name }}</td>
            <td>
              <template v-if="item.csv">{{ item.csv.rows.length }}</template>
              <span v-else class="admin-text-secondary">{{ item.error }}</span>
            </td>
            <td>
              <div v-if="item.csv" class="import-target">
                <select v-model="item.target" class="record-native-select" :disabled="!item.include" :aria-label="`Table for ${item.name}`" @change="nameNewTables">
                  <option :value="NEW_TABLE">New table</option>
                  <optgroup v-if="tables?.length" label="Existing tables">
                    <option v-for="table in tables" :key="table.id" :value="table.id">{{ table.name }}</option>
                  </optgroup>
                </select>
                <input v-if="item.target === NEW_TABLE" v-model="item.newName" class="record-native-select" :disabled="!item.include" maxlength="100" :aria-label="`Name of the new table for ${item.name}`" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="tablesError" class="admin-form-error" role="alert">{{ tablesError }}</p>
      <footer class="import-footer">
        <span class="admin-text-secondary">{{ included.length > 1 ? `The ${included.length} sheets are imported one after the other; each gets its own column check and review.` : "" }}</span>
        <Button class="dv-button dv-button--primary" :disabled="!!tablesError" @click="startSource(0)">Choose the columns</Button>
      </footer>
    </section>

    <!-- 3. Columns -->
    <section v-else-if="step === 'columns' && csv && source" class="dv-panel import-panel">
      <div class="import-file">
        <component :is="workbook ? FileSpreadsheet : FileText" class="size-5" aria-hidden="true" />
        <div>
          <strong>{{ workbook ? source.name : fileName }}</strong>
          <span class="admin-text-secondary">
            <template v-if="included.length > 1">Sheet {{ current + 1 }} of {{ included.length }} · </template>{{ plural(csv.rows.length, "row", "rows") }} · {{ plural(csv.columns.length, "column", "columns") }} · into {{ source.target === NEW_TABLE && !source.tableId ? "the new table" : "" }} <strong>{{ tableNameOf(source) }}</strong>
          </span>
        </div>
        <Button v-if="!imported.length" variant="ghost" size="sm" @click="step = 'tables'">Back to tables</Button>
        <Button v-else variant="ghost" size="sm" @click="next">Skip this sheet</Button>
      </div>

      <div class="import-setting">
        <Label for="import-key">Column holding the {{ keyLabel }}</Label>
        <select id="import-key" v-model="keyColumn" class="record-native-select" :disabled="keyLocked" aria-describedby="import-key-hint">
          <option v-for="column in csv.columns" :key="column" :value="column">{{ column }}</option>
        </select>
        <p id="import-key-hint" class="admin-text-secondary">
          <template v-if="keyLocked">{{ recordLabel.plural.value }} are identified by their {{ catalogueKey }}, and this file has that column.</template>
          <template v-else-if="catalogueKey">This file has no {{ catalogueKey }} column. The values of the column you choose are matched against the {{ catalogueKey }} of stored {{ recordLabel.lowerPlural.value }}.</template>
          <template v-else>Its values identify each {{ recordLabel.lower.value }}, so each must be unique.</template>
        </p>
        <p v-if="missingKeys" class="import-warning">{{ plural(missingKeys, "row has", "rows have") }} no value in this column and will be left out.</p>
      </div>

      <div class="import-setting">
        <span id="import-blank-label" class="import-setting-label">Empty cells</span>
        <RadioGroup v-model="keepStored" aria-labelledby="import-blank-label" class="import-radios">
          <div><RadioGroupItem id="import-blank-keep" value="keep" /><Label for="import-blank-keep">Keep the stored value</Label></div>
          <div><RadioGroupItem id="import-blank-clear" value="clear" /><Label for="import-blank-clear">Clear the stored value</Label></div>
        </RadioGroup>
      </div>

      <table class="import-table import-mapping">
        <thead>
          <tr><th>Column in the file</th><th>Sample values</th><th>Import into</th></tr>
        </thead>
        <tbody>
          <tr v-for="column in dataColumns" :key="column" :class="{ 'is-off': !targets[column] }">
            <td class="import-key">{{ column }}</td>
            <td>
              <div class="import-samples">
                <span v-for="sample in samples[column]" :key="sample" class="record-chip">{{ sample }}</span>
                <span v-if="!samples[column].length" class="admin-text-secondary">Empty</span>
              </div>
            </td>
            <td>
              <select v-model="targets[column]" class="record-native-select" :aria-label="`Import ${column} into`" :aria-invalid="!!errors[column] || undefined">
                <option value="">Don't import</option>
                <option v-if="!fieldNames.has(column)" :value="column">New text field “{{ column }}”</option>
                <optgroup v-if="fields?.length" label="Existing fields">
                  <option v-for="field in fields" :key="field.id" :value="field.name">{{ fieldLabel(field) }} · {{ VALUE_TYPE_LABELS[field.valueType] }}</option>
                </optgroup>
              </select>
              <p v-if="errors[column]" class="admin-form-error" role="alert">{{ errors[column] }}</p>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="compareError" class="admin-error" role="alert">{{ compareError }}</p>
      <footer class="import-footer">
        <span class="admin-text-secondary">{{ plural(importedColumns.length, "column", "columns") }} imported besides the {{ keyLabel }}</span>
        <Button class="dv-button dv-button--primary" :disabled="comparing || Object.keys(errors).length > 0" @click="compare">
          <Loader v-if="comparing" />{{ comparing ? "Comparing…" : `Compare with stored ${recordLabel.lowerPlural.value}` }}
        </Button>
      </footer>
    </section>

    <!-- 4. Review -->
    <section v-else-if="step === 'review' && comparison" class="dv-panel import-panel">
      <ul v-if="comparison.newColumns.length || Object.keys(comparison.newOptions).length" class="import-notes">
        <li v-if="comparison.newColumns.length">
          <strong>{{ plural(comparison.newColumns.length, "new field", "new fields") }}</strong>, created as text: {{ comparison.newColumns.join(", ") }}. Change their type afterwards on
          <router-link :to="{ name: 'admin-records', query: { fields: '1' } }">Manage fields</router-link> on the {{ recordLabel.lowerPlural.value }} page.
        </li>
        <li v-for="(options, name) in comparison.newOptions" :key="name">
          <strong>{{ labels[name] ?? name }}</strong> gains {{ plural(options.length, "option", "options") }}: {{ options.join(", ") }}.
        </li>
      </ul>
      <p v-if="counts.elsewhere" class="import-note-inline">
        {{ plural(counts.elsewhere, `${recordLabel.lower.value} of this file is`, `${recordLabel.lowerPlural.value} of this file are`) }} already in another table. They are updated where they are; move them afterwards if they belong in {{ tableNameOf(source!) }}.
      </p>
      <RecordImportReview v-model:selected="selected" :comparison="comparison" :key-column="keyColumn" :key-label="keyLabel" :labels="labels" />
      <p v-if="importError" class="admin-error" role="alert">{{ importError }}</p>
      <footer class="import-footer">
        <Button variant="outline" :disabled="importing" @click="step = 'columns'">Back</Button>
        <span class="admin-text-secondary" role="status">
          <template v-if="!rowsToImport.length && counts.changed">Every change is unticked. Tick the {{ recordLabel.lowerPlural.value }} to update in the first column.</template>
          <template v-else-if="!rowsToImport.length">The file holds nothing new: every row is already stored as it is, or cannot be imported.</template>
          <template v-else>{{ plural(counts.create, "new", "new") }} · {{ counts.update }} of {{ plural(counts.changed, "change", "changes") }} applied<template v-if="counts.skipped"> · {{ counts.skipped }} not imported</template></template>
        </span>
        <Button class="dv-button dv-button--primary" :disabled="importing || !rowsToImport.length" @click="runImport">
          <Loader v-if="importing" />{{ importing ? "Importing…" : rowsToImport.length ? `Import ${plural(rowsToImport.length, "row", "rows")}` : "Nothing to import" }}
        </Button>
      </footer>
    </section>

    <!-- 5. Done -->
    <section v-else-if="step === 'done'" class="dv-panel import-panel import-done">
      <CircleCheck class="size-8" aria-hidden="true" />
      <h2>Import finished</h2>
      <p v-if="!imported.length">No sheet was imported.</p>
      <template v-for="item in imported" :key="item.name">
        <p>
          <strong>{{ tableNameOf(item) }}</strong><template v-if="workbook"> (sheet {{ item.name }})</template>:
          {{ plural(item.result!.newRecords.length, `${recordLabel.lower.value} created`, `${recordLabel.lowerPlural.value} created`) }},
          {{ plural(item.result!.updatedRecords.length, "updated", "updated") }}.
          <template v-if="item.leftOut">{{ plural(item.leftOut, "row was", "rows were") }} left out.</template>
        </p>
        <table v-if="item.result!.skipped.length" class="import-table">
          <thead><tr><th>{{ keyLabel }}</th><th>Field</th><th>Not imported because</th></tr></thead>
          <tbody>
            <tr v-for="entry in item.result!.skipped" :key="`${entry.key}-${entry.column}`"><td>{{ entry.key }}</td><td>{{ labels[entry.column] ?? entry.column }}</td><td>{{ entry.message }}</td></tr>
          </tbody>
        </table>
      </template>
      <p>Each change is in the {{ recordLabel.lower.value }}'s history.</p>
      <div class="import-done-actions">
        <Button as-child class="dv-button dv-button--primary"><router-link :to="{ name: 'admin-records', query: firstTableId ? { table: firstTableId } : {} }">View {{ recordLabel.lowerPlural.value }}</router-link></Button>
        <Button variant="outline" @click="restart">Import another file</Button>
      </div>
    </section>
  </div>
</template>
