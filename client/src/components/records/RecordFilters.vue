<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { operatorLabel, operatorsFor, PICTURE_COLUMN, type FilterColumnType, type FilterOp, type RecordFilter } from "@/utils/recordFilters"
import { fieldLabel } from "@/utils/recordValues"
import { trpc } from "@/services/server"
import { useQueryClient } from "@tanstack/vue-query"
import { Plus, X } from "@lucide/vue"
import { ref, useId } from "vue"
import type { GridField } from "./RecordsGrid.vue"

// Filters narrow each other; the list updates as they change.
const props = defineProps<{ fields: GridField[], keyLabel: string, modelValue: RecordFilter[] }>()
const emit = defineEmits<{ "update:modelValue": [filters: RecordFilter[]] }>()

const typeOf = (column: string): FilterColumnType => column === "recordKey" ? "key" : column === PICTURE_COLUMN ? "picture" : props.fields.find((field) => field.name === column)?.valueType ?? "text"
const fieldOf = (column: string) => props.fields.find((field) => field.name === column)

// The values a field already holds, offered while typing a filter value, so
// the admin does not have to remember them.
const queryClient = useQueryClient()
const listId = useId()
const valueHints = ref<Record<string, string[]>>({})
async function loadValues(column: string) {
  if (valueHints.value[column]) return
  const field = fieldOf(column)
  if (!field || field.valueType === "date") return
  if (field.valueType === "single_select" || field.valueType === "multi_select") {
    valueHints.value = { ...valueHints.value, [column]: field.options }
    return
  }
  try {
    const values = await queryClient.fetchQuery({ queryKey: ["records", "values", column], queryFn: () => trpc.recordAttribute.values.query({ name: column }), staleTime: 60_000 })
    valueHints.value = { ...valueHints.value, [column]: values }
  } catch {
    // Without hints the value is typed as before.
  }
}

function update(index: number, change: Partial<RecordFilter>) {
  const next = props.modelValue.map((filter, position) => position === index ? { ...filter, ...change } : filter)
  emit("update:modelValue", next)
}

function changeColumn(index: number, column: string) {
  update(index, { column, op: operatorsFor(typeOf(column))[0], value: "", values: [] })
}

function toggleValue(index: number, option: string, checked: boolean) {
  const values = props.modelValue[index].values ?? []
  update(index, { values: checked ? [...values, option] : values.filter((value) => value !== option) })
}

function add() {
  emit("update:modelValue", [...props.modelValue, { column: "recordKey", op: "contains", value: "" }])
}
</script>

<template>
  <div class="record-filters">
    <p v-if="!modelValue.length" class="admin-text-secondary">No filter. Add one to narrow the list.</p>
    <div v-for="(filter, index) in modelValue" :key="index" class="record-filter-row">
      <select :value="filter.column" class="record-native-select" :aria-label="`Field of filter ${index + 1}`" @change="changeColumn(index, ($event.target as HTMLSelectElement).value)">
        <option value="recordKey">{{ keyLabel }}</option>
        <option :value="PICTURE_COLUMN">Picture</option>
        <option v-for="field in fields" :key="field.id" :value="field.name">{{ fieldLabel(field) }}</option>
      </select>
      <select :value="filter.op" class="record-native-select" :aria-label="`Condition of filter ${index + 1}`" @change="update(index, { op: ($event.target as HTMLSelectElement).value as FilterOp })">
        <option v-for="op in operatorsFor(typeOf(filter.column))" :key="op" :value="op">{{ operatorLabel(typeOf(filter.column), op) }}</option>
      </select>
      <button type="button" class="record-filter-remove" :aria-label="`Remove filter ${index + 1}`" @click="emit('update:modelValue', modelValue.filter((_, position) => position !== index))"><X class="size-4" /></button>
      <div v-if="filter.op === 'has_any'" class="record-filter-options">
        <label v-for="option in fieldOf(filter.column)?.options ?? []" :key="option" class="flex items-center gap-2">
          <Checkbox :model-value="filter.values?.includes(option) ?? false" @update:model-value="(value) => toggleValue(index, option, value === true)" />
          <span class="record-chip">{{ option }}</span>
        </label>
      </div>
      <Input v-else-if="filter.op !== 'is_empty' && filter.op !== 'is_not_empty'" :model-value="filter.value ?? ''" class="record-filter-value"
        :type="typeOf(filter.column) === 'date' ? 'date' : 'text'" :aria-label="`Value of filter ${index + 1}`" :list="`${listId}-${index}`" autocomplete="off"
        @focus="loadValues(filter.column)" @update:model-value="(value) => update(index, { value: String(value) })" />
      <datalist :id="`${listId}-${index}`">
        <option v-for="value in valueHints[filter.column] ?? []" :key="value" :value="value" />
      </datalist>
    </div>
    <div class="flex justify-between gap-2">
      <Button type="button" variant="outline" size="sm" @click="add"><Plus class="size-4" />Add filter</Button>
      <Button v-if="modelValue.length" type="button" variant="ghost" size="sm" @click="emit('update:modelValue', [])">Clear filters</Button>
    </div>
  </div>
</template>
