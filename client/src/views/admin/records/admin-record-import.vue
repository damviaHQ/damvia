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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc, type RouterOutput } from "@/services/server.ts"
import { buildRows, defaultTargets, mappingErrors, readCsv, REVIEW_GROUP_OF, sampleValues, type ColumnTargets, type CsvFile } from "@/utils/recordImport"
import { fieldLabel, VALUE_TYPE_LABELS } from "@/utils/recordValues"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CircleCheck, FileText, Upload } from "@lucide/vue"
import { computed, ref, watch } from "vue"

type Comparison = RouterOutput["record"]["compareCsv"]
type Result = RouterOutput["record"]["importCsv"]
type Step = "file" | "columns" | "review" | "done"

const recordLabel = useRecordLabel()
const queryClient = useQueryClient()
const { data: fields, status: fieldsStatus } = useQuery({ queryKey: ["records", "attributes"], queryFn: () => trpc.recordAttribute.list.query() })
const { data: catalogue, status: catalogueStatus } = useQuery({ queryKey: ["records", "import-context"], queryFn: () => trpc.record.list.query({ page: 1, size: 1 }) })
const catalogueKey = computed(() => catalogue.value?.keyColumnName ?? null)

const step = ref<Step>("file")
const STEPS: { id: Step, label: string }[] = [{ id: "file", label: "File" }, { id: "columns", label: "Columns" }, { id: "review", label: "Review" }]
const stepIndex = computed(() => STEPS.findIndex((entry) => entry.id === step.value))

// File
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const fileError = ref("")
const csv = ref<CsvFile | null>(null)

async function open(file: File | undefined) {
  if (!file) return
  fileError.value = ""
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
    fileError.value = `${file.name} is not a CSV file. Save the sheet as CSV (UTF-8) and choose it again.`
    return
  }
  try {
    csv.value = await readCsv(file)
  } catch (failure) {
    fileError.value = `${file.name} could not be read: ${(failure as Error).message}`
    return
  }
  const columns = csv.value.columns
  keyColumn.value = catalogueKey.value && columns.includes(catalogueKey.value) ? catalogueKey.value : columns[0]
  targets.value = defaultTargets(columns, fields.value)
  keepStored.value = "keep"
  compareError.value = ""
  step.value = "columns"
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
  if (!csv.value || Object.keys(errors.value).length) return
  comparing.value = true
  compareError.value = ""
  try {
    sent.value = buildRows(csv.value, keyColumn.value, targets.value, keepStored.value === "keep")
    comparison.value = await trpc.record.compareCsv.mutate({ keyColumnName: keyColumn.value, data: sent.value })
    selected.value = {}
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
  }
})

// Import
const importing = ref(false)
const importError = ref("")
const result = ref<Result | null>(null)

async function runImport() {
  if (!rowsToImport.value.length) return
  importing.value = true
  importError.value = ""
  try {
    result.value = await trpc.record.importCsv.mutate({ keyColumnName: keyColumn.value, data: rowsToImport.value })
    step.value = "done"
    await queryClient.invalidateQueries({ queryKey: ["records"] })
  } catch (failure) {
    importError.value = (failure as Error).message
  } finally {
    importing.value = false
  }
}

function restart() {
  csv.value = null
  comparison.value = null
  result.value = null
  step.value = "file"
}

watch(step, () => window.scrollTo({ top: 0 }))
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
</script>

<template>
  <div class="admin-page admin-resource-page admin-record-import">
    <AdminPageHeader :title="`Import ${recordLabel.lowerPlural.value}`"
      :description="`Create and update ${recordLabel.lowerPlural.value} from a CSV file. You see every change before anything is saved.`" />

    <ol v-if="step !== 'done'" class="import-steps">
      <li v-for="(entry, index) in STEPS" :key="entry.id" :class="{ 'is-done': index < stepIndex, 'is-current': index === stepIndex }"
        :aria-current="index === stepIndex ? 'step' : undefined">
        <span class="import-step-number" aria-hidden="true">{{ index + 1 }}</span>{{ entry.label }}
      </li>
    </ol>

    <Loader v-if="fieldsStatus === 'pending' || catalogueStatus === 'pending'" :text="true" />

    <!-- 1. File -->
    <section v-else-if="step === 'file'" class="dv-panel import-panel">
      <div class="import-drop" :class="{ 'is-dragging': dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
        <Upload class="size-6" aria-hidden="true" />
        <p><strong>Drop a CSV file here</strong> or</p>
        <Button variant="outline" @click="fileInput?.click()">Choose a file</Button>
        <input ref="fileInput" type="file" accept=".csv,.tsv,.txt,text/csv" class="sr-only" tabindex="-1" aria-label="Choose a CSV file" @change="onPick" />
      </div>
      <p v-if="fileError" class="admin-error" role="alert">{{ fileError }}</p>
      <ul class="import-tips">
        <li>The first row names the columns, and each row after it is one {{ recordLabel.lower.value }}.</li>
        <li>One column holds the {{ catalogueKey ?? "key" }} of each {{ recordLabel.lower.value }}. Rows with a {{ catalogueKey ?? "key" }} already stored update that {{ recordLabel.lower.value }}; the others create one.</li>
        <li>Save from Excel, Numbers or Google Sheets as CSV (UTF-8). Commas, semicolons and tabs all work.</li>
        <li>To update what is stored, start from <router-link :to="{ name: 'admin-records' }">Export</router-link> on the {{ recordLabel.lowerPlural.value }} page.</li>
      </ul>
    </section>

    <!-- 2. Columns -->
    <section v-else-if="step === 'columns' && csv" class="dv-panel import-panel">
      <div class="import-file">
        <FileText class="size-5" aria-hidden="true" />
        <div><strong>{{ csv.name }}</strong><span class="admin-text-secondary">{{ plural(csv.rows.length, "row", "rows") }} · {{ plural(csv.columns.length, "column", "columns") }}</span></div>
        <Button variant="ghost" size="sm" @click="restart">Choose another file</Button>
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

    <!-- 3. Review -->
    <section v-else-if="step === 'review' && comparison" class="dv-panel import-panel">
      <ul v-if="comparison.newColumns.length || Object.keys(comparison.newOptions).length" class="import-notes">
        <li v-if="comparison.newColumns.length">
          <strong>{{ plural(comparison.newColumns.length, "new field", "new fields") }}</strong>, created as text: {{ comparison.newColumns.join(", ") }}. Change their type afterwards on
          <router-link :to="{ name: 'admin-fields' }">Fields</router-link>.
        </li>
        <li v-for="(options, name) in comparison.newOptions" :key="name">
          <strong>{{ labels[name] ?? name }}</strong> gains {{ plural(options.length, "option", "options") }}: {{ options.join(", ") }}.
        </li>
      </ul>
      <RecordImportReview v-model:selected="selected" :comparison="comparison" :key-column="keyColumn" :key-label="keyLabel" :labels="labels" />
      <p v-if="importError" class="admin-error" role="alert">{{ importError }}</p>
      <footer class="import-footer">
        <Button variant="outline" :disabled="importing" @click="step = 'columns'">Back</Button>
        <span class="admin-text-secondary" role="status">
          {{ plural(counts.create, "new", "new") }} · {{ counts.update }} of {{ plural(counts.changed, "change", "changes") }} applied<template v-if="counts.skipped"> · {{ counts.skipped }} not imported</template>
        </span>
        <Button class="dv-button dv-button--primary" :disabled="importing || !rowsToImport.length" @click="runImport">
          <Loader v-if="importing" />{{ importing ? "Importing…" : rowsToImport.length ? `Import ${plural(rowsToImport.length, "row", "rows")}` : "Nothing to import" }}
        </Button>
      </footer>
    </section>

    <!-- 4. Done -->
    <section v-else-if="step === 'done' && result" class="dv-panel import-panel import-done">
      <CircleCheck class="size-8" aria-hidden="true" />
      <h2>Import finished</h2>
      <p>
        {{ plural(result.newRecords.length, `${recordLabel.lower.value} created`, `${recordLabel.lowerPlural.value} created`) }},
        {{ plural(result.updatedRecords.length, "updated", "updated") }}.
        <template v-if="counts.skipped || counts.changed > counts.update">
          {{ plural(counts.skipped + counts.changed - counts.update, "row was", "rows were") }} left out.
        </template>
        Each change is in the {{ recordLabel.lower.value }}'s history.
      </p>
      <table v-if="result.skipped.length" class="import-table">
        <thead><tr><th>{{ keyLabel }}</th><th>Field</th><th>Not imported because</th></tr></thead>
        <tbody>
          <tr v-for="entry in result.skipped" :key="`${entry.key}-${entry.column}`"><td>{{ entry.key }}</td><td>{{ labels[entry.column] ?? entry.column }}</td><td>{{ entry.message }}</td></tr>
        </tbody>
      </table>
      <div class="import-done-actions">
        <Button as-child class="dv-button dv-button--primary"><router-link :to="{ name: 'admin-records' }">View {{ recordLabel.lowerPlural.value }}</router-link></Button>
        <Button variant="outline" @click="restart">Import another file</Button>
      </div>
    </section>
  </div>
</template>
