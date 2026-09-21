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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { RouterOutput } from "@/services/server.ts"
import { REVIEW_GROUP_OF, type ReviewGroup } from "@/utils/recordImport"
import { ArrowRight } from "@lucide/vue"
import { computed, ref, watch } from "vue"

type Comparison = RouterOutput["record"]["compareCsv"]
type Row = Comparison["rows"][number]

const props = defineProps<{
  comparison: Comparison
  keyColumn: string
  keyLabel: string
  labels: Record<string, string>
}>()
const selected = defineModel<Record<string, boolean>>("selected", { required: true })

const PAGE = 100
const GROUPS: { id: ReviewGroup, label: string }[] = [
  { id: "new", label: "New" },
  { id: "changed", label: "Changed" },
  { id: "unchanged", label: "Unchanged" },
  { id: "skipped", label: "Not imported" },
]

const counts = computed(() => {
  const counts: Record<ReviewGroup, number> = { new: 0, changed: 0, unchanged: 0, skipped: 0 }
  for (const row of props.comparison.rows) counts[REVIEW_GROUP_OF[row.status]]++
  return counts
})
const group = ref<ReviewGroup | "all">("all")
const shown = ref(PAGE)
watch(group, () => shown.value = PAGE)
const filtered = computed(() => group.value === "all" ? props.comparison.rows : props.comparison.rows.filter((row) => REVIEW_GROUP_OF[row.status] === group.value))
const visible = computed(() => filtered.value.slice(0, shown.value))

const changedKeys = computed(() => props.comparison.rows.filter((row) => row.status === "changed").map((row) => row.key))
const selectedCount = computed(() => changedKeys.value.filter((key) => selected.value[key]).length)
const allSelected = computed<boolean | "indeterminate">(() =>
  selectedCount.value === 0 ? false : selectedCount.value === changedKeys.value.length ? true : "indeterminate")
function selectAll(value: boolean | "indeterminate") {
  selected.value = value === true ? Object.fromEntries(changedKeys.value.map((key) => [key, true])) : {}
}
function toggle(key: string, value: boolean | "indeterminate") {
  selected.value = { ...selected.value, [key]: value === true }
}

const label = (column: string) => props.labels[column] ?? column
function newValues(row: Row) {
  return Object.entries(row.new).filter(([column, value]) => column !== props.keyColumn && value.trim() !== "")
}
const STATUS: Record<Row["status"], string> = {
  new: "New",
  changed: "Changed",
  unchanged: "Unchanged",
  invalid: "Invalid value",
  duplicate: "Repeated key",
  missing_key: "No key",
}
</script>

<template>
  <div class="import-review">
    <div class="import-summary" role="group" aria-label="Show rows">
      <button type="button" class="import-summary-item" :aria-pressed="group === 'all'" @click="group = 'all'">
        <strong>{{ comparison.rows.length }}</strong><span>All rows</span>
      </button>
      <button v-for="entry in GROUPS" :key="entry.id" type="button" class="import-summary-item" :class="`is-${entry.id}`"
        :aria-pressed="group === entry.id" :disabled="!counts[entry.id]" @click="group = entry.id">
        <strong>{{ counts[entry.id] }}</strong><span>{{ entry.label }}</span>
      </button>
    </div>

    <div class="import-table-wrap">
      <table class="import-table">
        <thead>
          <tr>
            <th class="import-check">
              <Checkbox v-if="changedKeys.length" :model-value="allSelected" aria-label="Apply every change" @update:model-value="selectAll" />
            </th>
            <th>{{ keyLabel }}</th>
            <th>Status</th>
            <th>What happens</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in visible" :key="`${index}-${row.key}`" :class="`is-${REVIEW_GROUP_OF[row.status]}`">
            <td class="import-check">
              <Checkbox v-if="row.status === 'changed'" :model-value="!!selected[row.key]" :aria-label="`Apply the changes to ${row.key}`"
                @update:model-value="(value) => toggle(row.key, value)" />
            </td>
            <td class="import-key">{{ row.key || "—" }}</td>
            <td><span class="import-status" :class="`is-${REVIEW_GROUP_OF[row.status]}`">{{ STATUS[row.status] }}</span></td>
            <td>
              <ul v-if="row.status === 'changed'" class="import-changes">
                <li v-for="(difference, column) in row.differences" :key="column">
                  <span class="import-field">{{ label(String(column)) }}</span>
                  <span class="import-old">{{ difference.old || "empty" }}</span>
                  <ArrowRight class="size-3.5" aria-label="becomes" />
                  <span class="import-new">{{ difference.new || "empty" }}</span>
                </li>
              </ul>
              <ul v-else-if="row.status === 'invalid'" class="import-changes">
                <li v-for="(message, column) in row.invalid" :key="column" class="import-error">
                  <span class="import-field">{{ label(String(column)) }}</span>{{ message }}
                </li>
              </ul>
              <ul v-else-if="row.status === 'new'" class="import-values">
                <li v-for="[column, value] in newValues(row).slice(0, 6)" :key="column">
                  <span class="import-field">{{ label(column) }}</span>{{ value }}
                </li>
                <li v-if="newValues(row).length > 6" class="admin-text-secondary">and {{ newValues(row).length - 6 }} more</li>
                <li v-if="!newValues(row).length" class="admin-text-secondary">Created with its key only</li>
              </ul>
              <span v-else-if="row.status === 'duplicate'" class="admin-text-secondary">This {{ keyLabel }} is on several rows of the file; none of them is imported.</span>
              <span v-else-if="row.status === 'missing_key'" class="admin-text-secondary">The row has no {{ keyLabel }}.</span>
              <span v-else class="admin-text-secondary">Already stored as in the file.</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="filtered.length > shown" class="import-more">
      <span class="admin-text-secondary">Showing {{ shown }} of {{ filtered.length }} rows</span>
      <Button variant="outline" size="sm" @click="shown += PAGE * 5">Show more</Button>
    </div>
  </div>
</template>
