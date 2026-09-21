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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { fieldLabel, joinMulti, normaliseValue, splitMulti, type ValueField } from "@/utils/recordValues"
import { ChevronDown } from "@lucide/vue"
import { computed, ref, watch } from "vue"
import RecordOptionPicker from "./RecordOptionPicker.vue"

// One field of the record card. It saves when the admin leaves it or picks
// an option, and says why a value is refused.
const props = defineProps<{
  field: ValueField
  id: string
  modelValue: string
  save?: (value: string) => Promise<void>
  addOption?: (option: string) => Promise<void>
}>()
const emit = defineEmits<{ "update:modelValue": [value: string] }>()

const draft = ref(props.modelValue)
const error = ref("")
const saving = ref(false)
const open = ref(false)
watch(() => props.modelValue, (value) => { if (!saving.value) draft.value = value })

const isSelect = computed(() => props.field.valueType === "single_select" || props.field.valueType === "multi_select")
const chips = computed(() => props.field.valueType === "multi_select" ? splitMulti(draft.value) : draft.value ? [draft.value] : [])
const errorId = computed(() => `${props.id}-error`)

async function commit(value: string) {
  const checked = normaliseValue(props.field, value)
  if ("error" in checked) {
    error.value = checked.error
    return
  }
  error.value = ""
  draft.value = checked.value
  emit("update:modelValue", checked.value)
  if (!props.save || checked.value === props.modelValue) return
  saving.value = true
  try {
    await props.save(checked.value)
  } catch (failure) {
    error.value = (failure as Error).message
  } finally {
    saving.value = false
  }
}

function onPick(value: string) {
  open.value = false
  commit(value)
}

function onOpenChange(value: boolean) {
  open.value = value
  if (!value && props.field.valueType === "multi_select") commit(draft.value)
}

async function create(option: string) {
  if (!props.addOption) return
  await props.addOption(option)
  if (props.field.valueType === "single_select") onPick(option)
  else draft.value = joinMulti([...splitMulti(draft.value), option])
}
</script>

<template>
  <div class="record-field-input" :aria-busy="saving || undefined">
    <Popover v-if="isSelect" :open="open" @update:open="onOpenChange">
      <PopoverTrigger as-child>
        <button :id="id" type="button" class="record-field-select" :aria-invalid="!!error || undefined" :aria-describedby="error ? errorId : undefined">
          <span v-if="chips.length" class="record-chips"><span v-for="chip in chips" :key="chip" class="record-chip">{{ chip }}</span></span>
          <span v-else class="admin-text-secondary">Choose</span>
          <ChevronDown class="size-4 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="record-cell-popover">
        <RecordOptionPicker v-model="draft" :options="field.options" :multiple="field.valueType === 'multi_select'" :label="fieldLabel(field)"
          :can-create="!!addOption" @commit="onPick" @cancel="open = false; draft = modelValue" @create="create" />
      </PopoverContent>
    </Popover>
    <textarea v-else-if="field.valueType === 'long_text'" :id="id" v-model="draft" rows="4" class="record-field-control"
      :aria-invalid="!!error || undefined" :aria-describedby="error ? errorId : undefined" @blur="commit(draft)" />
    <input v-else :id="id" v-model="draft" class="record-field-control" :type="field.valueType === 'date' ? 'date' : field.valueType === 'url' ? 'url' : 'text'"
      :inputmode="field.valueType === 'number' ? 'decimal' : undefined" :aria-invalid="!!error || undefined" :aria-describedby="error ? errorId : undefined"
      @blur="commit(draft)" @keydown.enter.prevent="commit(draft)" />
    <p v-if="error" :id="errorId" role="alert" class="admin-form-error">{{ error }}</p>
  </div>
</template>
