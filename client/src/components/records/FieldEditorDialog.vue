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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc, type RouterOutput } from "@/services/server"
import { isSelect, RECORD_VALUE_TYPES, VALUE_TYPE_LABELS, type RecordValueType } from "@/utils/recordValues"
import { useQueryClient } from "@tanstack/vue-query"
import { ArrowDown, ArrowUp, X } from "@lucide/vue"
import { computed, ref, watch } from "vue"

type Field = RouterOutput["recordAttribute"]["list"][number]

// Adds a field to every record, or changes how one reads: its label, type,
// options and where it shows for readers.
const props = defineProps<{ open: boolean, field: Field | null, suggestions?: string[] }>()
const emit = defineEmits<{ "update:open": [open: boolean], saved: [field: Field] }>()

const toast = useGlobalToast()
const queryClient = useQueryClient()
const form = ref({ name: "", displayName: "", valueType: "text" as RecordValueType, options: [] as string[], facetable: false, viewable: false, searchable: false })
const newOption = ref("")
const error = ref("")
const saving = ref(false)
const creating = computed(() => !props.field)
const typeChanged = computed(() => !!props.field && props.field.valueType !== form.value.valueType)

watch(() => props.open, (open) => {
  if (!open) return
  const field = props.field
  form.value = field
    ? { name: field.name, displayName: field.displayName ?? "", valueType: field.valueType, options: [...field.options], facetable: field.facetable, viewable: field.viewable, searchable: field.searchable }
    : { name: "", displayName: "", valueType: "text", options: [], facetable: false, viewable: false, searchable: false }
  newOption.value = ""
  error.value = ""
}, { immediate: true })

function addOption() {
  const option = newOption.value.trim()
  if (!option) return
  if (option.includes("|")) {
    error.value = "An option cannot contain |."
    return
  }
  if (!form.value.options.includes(option)) form.value.options.push(option)
  newOption.value = ""
  error.value = ""
}

function moveOption(index: number, delta: number) {
  const options = form.value.options
  const target = index + delta
  if (target < 0 || target >= options.length) return
  ;[options[index], options[target]] = [options[target], options[index]]
}

async function submit() {
  if (creating.value && !form.value.name.trim()) {
    error.value = "Give the field a name."
    return
  }
  saving.value = true
  error.value = ""
  const common = {
    displayName: form.value.displayName.trim() || null,
    valueType: form.value.valueType,
    options: isSelect(form.value.valueType) ? form.value.options : undefined,
    facetable: form.value.facetable,
    viewable: form.value.facetable || form.value.viewable,
    searchable: form.value.searchable,
  }
  try {
    const saved = props.field
      ? await trpc.recordAttribute.update.mutate({ id: props.field.id, ...common })
      : await trpc.recordAttribute.create.mutate({ name: form.value.name.trim(), ...common })
    await queryClient.invalidateQueries({ queryKey: ["records"] })
    if (saved.invalidCount) toast.info(`${saved.invalidCount} stored ${saved.invalidCount === 1 ? "value does" : "values do"} not fit ${saved.displayName || saved.name} and ${saved.invalidCount === 1 ? "is" : "are"} marked in the grid.`)
    else toast.success(creating.value ? "Field added" : "Field saved")
    emit("saved", saved)
    emit("update:open", false)
  } catch (failure) {
    error.value = (failure as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value) => { if (!saving) emit('update:open', value) }">
    <DialogContent class="admin-dialog--compact">
      <DialogHeader>
        <DialogTitle>{{ creating ? "Add a field" : `Edit ${field?.displayName || field?.name}` }}</DialogTitle>
        <DialogDescription>A field is a column of the catalogue. Its type decides how values are entered and checked.</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-5" :aria-busy="saving" @submit.prevent="submit">
        <div v-if="creating" class="flex flex-col gap-2">
          <Label for="field-name">Name *</Label>
          <Input id="field-name" v-model="form.name" list="field-name-suggestions" maxlength="100" autocomplete="off" />
          <datalist id="field-name-suggestions"><option v-for="name in suggestions ?? []" :key="name" :value="name" /></datalist>
          <p class="admin-form-note">The column name used by CSV imports. It cannot be changed later.</p>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="field-display-name">Display name</Label>
          <Input id="field-display-name" v-model="form.displayName" :placeholder="form.name || 'Same as the name'" maxlength="200" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="field-type">Type</Label>
          <Select v-model="form.valueType">
            <SelectTrigger id="field-type" class="w-full"><SelectValue>{{ VALUE_TYPE_LABELS[form.valueType] }}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="type in RECORD_VALUE_TYPES" :key="type" :value="type">{{ VALUE_TYPE_LABELS[type] }}</SelectItem>
            </SelectContent>
          </Select>
          <p v-if="typeChanged" class="admin-form-note">Stored values are kept as they are. Those that do not fit the new type are marked in the grid until fixed.</p>
        </div>
        <fieldset v-if="isSelect(form.valueType)" class="flex flex-col gap-2">
          <legend class="text-sm font-medium mb-1">Options</legend>
          <p v-if="!form.options.length && field" class="admin-form-note">Left empty, the options are taken from the values already stored.</p>
          <ul class="record-options-editor">
            <li v-for="(option, index) in form.options" :key="option">
              <span class="record-chip">{{ option }}</span>
              <button type="button" :aria-label="`Move ${option} up`" :disabled="index === 0" @click="moveOption(index, -1)"><ArrowUp class="size-3.5" /></button>
              <button type="button" :aria-label="`Move ${option} down`" :disabled="index === form.options.length - 1" @click="moveOption(index, 1)"><ArrowDown class="size-3.5" /></button>
              <button type="button" :aria-label="`Remove ${option}`" @click="form.options.splice(index, 1)"><X class="size-3.5" /></button>
            </li>
          </ul>
          <div class="flex gap-2">
            <Input v-model="newOption" aria-label="New option" placeholder="New option" maxlength="200" @keydown.enter.prevent="addOption" />
            <Button type="button" variant="outline" @click="addOption">Add</Button>
          </div>
        </fieldset>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2"><Checkbox id="field-searchable" v-model="form.searchable" /><Label for="field-searchable">Searchable: free-text search looks in it</Label></div>
          <div class="flex items-center gap-2"><Checkbox id="field-facetable" v-model="form.facetable" /><Label for="field-facetable">Filter in search</Label></div>
          <div class="flex items-center gap-2"><Checkbox id="field-viewable" :model-value="form.facetable || form.viewable" :disabled="form.facetable" @update:model-value="(value) => form.viewable = value === true" /><Label for="field-viewable">Visible on files</Label></div>
        </div>
        <p v-if="error" role="alert" class="admin-form-error">{{ error }}</p>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="saving" @click="emit('update:open', false)">Cancel</Button>
          <Button type="submit" :disabled="saving">{{ saving ? "Saving…" : creating ? "Add field" : "Save" }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
