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
import { Input } from "@/components/ui/input"
import { FILTER_OPERATORS as OPERATORS, operatorsFor, type FilterOp, type RecordFilter } from "@/utils/recordFilters"
import { fieldLabel, type RecordValueType } from "@/utils/recordValues"
import { Plus, X } from "@lucide/vue"
import type { GridField } from "./RecordsGrid.vue"

// Filters narrow each other; the list updates as they change.
const props = defineProps<{ fields: GridField[], keyLabel: string, modelValue: RecordFilter[] }>()
const emit = defineEmits<{ "update:modelValue": [filters: RecordFilter[]] }>()

const typeOf = (column: string): RecordValueType | "key" => column === "recordKey" ? "key" : props.fields.find((field) => field.name === column)?.valueType ?? "text"
const fieldOf = (column: string) => props.fields.find((field) => field.name === column)

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
        <option v-for="field in fields" :key="field.id" :value="field.name">{{ fieldLabel(field) }}</option>
      </select>
      <select :value="filter.op" class="record-native-select" :aria-label="`Condition of filter ${index + 1}`" @change="update(index, { op: ($event.target as HTMLSelectElement).value as FilterOp })">
        <option v-for="op in operatorsFor(typeOf(filter.column))" :key="op" :value="op">{{ OPERATORS[op] }}</option>
      </select>
      <button type="button" class="record-filter-remove" :aria-label="`Remove filter ${index + 1}`" @click="emit('update:modelValue', modelValue.filter((_, position) => position !== index))"><X class="size-4" /></button>
      <div v-if="filter.op === 'has_any'" class="record-filter-options">
        <label v-for="option in fieldOf(filter.column)?.options ?? []" :key="option" class="flex items-center gap-2">
          <Checkbox :model-value="filter.values?.includes(option) ?? false" @update:model-value="(value) => toggleValue(index, option, value === true)" />
          <span class="record-chip">{{ option }}</span>
        </label>
      </div>
      <Input v-else-if="filter.op !== 'is_empty' && filter.op !== 'is_not_empty'" :model-value="filter.value ?? ''" class="record-filter-value"
        :type="typeOf(filter.column) === 'date' ? 'date' : 'text'" :aria-label="`Value of filter ${index + 1}`"
        @update:model-value="(value) => update(index, { value: String(value) })" />
    </div>
    <div class="flex justify-between gap-2">
      <Button type="button" variant="outline" size="sm" @click="add"><Plus class="size-4" />Add filter</Button>
      <Button v-if="modelValue.length" type="button" variant="ghost" size="sm" @click="emit('update:modelValue', [])">Clear filters</Button>
    </div>
  </div>
</template>
