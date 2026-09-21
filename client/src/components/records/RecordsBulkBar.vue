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
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { fieldLabel } from "@/utils/recordValues"
import { Download, PencilLine, Trash2, X } from "@lucide/vue"
import { computed, ref } from "vue"
import RecordFieldInput from "./RecordFieldInput.vue"
import type { GridField } from "./RecordsGrid.vue"

// Acts on the selected records, across pages.
const props = defineProps<{
  count: number
  fields: GridField[]
  recordLabel: string
  recordLabelPlural: string
  setField: (field: GridField, value: string) => Promise<void>
  remove: () => Promise<void>
}>()
const emit = defineEmits<{ export: [], clear: [] }>()

const setting = ref(false)
const fieldName = ref("")
const value = ref("")
const busy = ref(false)
const error = ref("")
const confirmRemove = ref(false)
const field = computed(() => props.fields.find((item) => item.name === fieldName.value))
const noun = computed(() => props.count === 1 ? props.recordLabel : props.recordLabelPlural)

function openSet() {
  fieldName.value = props.fields[0]?.name ?? ""
  value.value = ""
  error.value = ""
  setting.value = true
}

async function run(action: () => Promise<void>, done: () => void) {
  busy.value = true
  error.value = ""
  try {
    await action()
    done()
  } catch (failure) {
    error.value = (failure as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="records-bulk-bar" role="region" :aria-label="`${count} selected`">
    <strong>{{ count }} {{ noun }} selected</strong>
    <Button variant="outline" size="sm" :disabled="!fields.length" @click="openSet"><PencilLine class="size-4" />Set a field</Button>
    <Button variant="outline" size="sm" @click="emit('export')"><Download class="size-4" />Export CSV</Button>
    <Button variant="outline" size="sm" class="text-destructive" @click="error = ''; confirmRemove = true"><Trash2 class="size-4" />Delete</Button>
    <Button variant="ghost" size="sm" @click="emit('clear')"><X class="size-4" />Clear selection</Button>
  </div>
  <Dialog :open="setting" @update:open="(open) => { if (!busy) setting = open }">
    <DialogContent class="admin-dialog--compact">
      <DialogHeader>
        <DialogTitle>Set a field on {{ count }} {{ noun }}</DialogTitle>
        <DialogDescription>The value replaces what each selected {{ recordLabel }} holds in this field. Each change is kept in its history.</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="field && run(() => setField(field!, value), () => setting = false)">
        <div class="flex flex-col gap-2">
          <Label for="bulk-field">Field</Label>
          <select id="bulk-field" v-model="fieldName" class="record-native-select" @change="value = ''">
            <option v-for="item in fields" :key="item.id" :value="item.name">{{ fieldLabel(item) }}</option>
          </select>
        </div>
        <div v-if="field" class="flex flex-col gap-2">
          <Label for="bulk-value">Value</Label>
          <RecordFieldInput id="bulk-value" :key="field.id" v-model="value" :field="field" />
          <p class="admin-form-note">Leave it empty to clear the field.</p>
        </div>
        <p v-if="error" role="alert" class="admin-form-error">{{ error }}</p>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="busy" @click="setting = false">Cancel</Button>
          <Button type="submit" :disabled="busy || !field">{{ busy ? "Saving…" : "Apply" }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  <AlertDialog :open="confirmRemove" @update:open="(open) => { if (!busy) confirmRemove = open }">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {{ count }} {{ noun }}?</AlertDialogTitle>
        <AlertDialogDescription>Their values are kept in the history. Files linked to their keys stay linked and wait, listed as dangling, until {{ recordLabelPlural }} with these keys exist again.</AlertDialogDescription>
      </AlertDialogHeader>
      <p v-if="error" role="alert" class="admin-form-error">{{ error }}</p>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">Cancel</AlertDialogCancel>
        <Button variant="destructive" :disabled="busy" @click="run(remove, () => confirmRemove = false)">{{ busy ? "Deleting…" : "Delete" }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
