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
import FieldEditorDialog from "@/components/records/FieldEditorDialog.vue"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { fieldLabel, isSelect, VALUE_TYPE_LABELS } from "@/utils/recordValues"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ArrowDown, ArrowUp, CirclePlus, GripVertical, PencilLine, Trash2 } from "@lucide/vue"
import { ref } from "vue"
import Draggable from "vuedraggable"
import { RouterOutput, trpc } from "../../../services/server.ts"

type RecordAttribute = RouterOutput["recordAttribute"]["list"][number]

const toast = useGlobalToast()
const recordLabel = useRecordLabel()
const queryClient = useQueryClient()
const { data: undeclared } = useQuery({ queryKey: ["records", "available-attributes"], queryFn: () => trpc.recordAttribute.listAvailable.query() })
const { data: attributes } = useQuery({ queryKey: ["records", "attributes"], queryFn: () => trpc.recordAttribute.list.query() })

const dialog = ref<{ open: boolean, field: RecordAttribute | null }>({ open: false, field: null })
const toRemove = ref<RecordAttribute | null>(null)
const usage = ref<number | null>(null)
const removing = ref(false)
const announcement = ref("")

// The order here is the default column order of the grid and of the card.
async function saveOrder(items: RecordAttribute[]) {
  queryClient.setQueryData(["records", "attributes"], items)
  try {
    await trpc.recordAttribute.reorder.mutate({ ids: items.map((item) => item.id) })
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    queryClient.invalidateQueries({ queryKey: ["records", "attributes"] })
  }
}

function move(index: number, delta: number) {
  const items = [...(attributes.value ?? [])]
  const target = index + delta
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target], items[index]]
  announcement.value = `${fieldLabel(items[target])} moved to position ${target + 1} of ${items.length}`
  saveOrder(items)
}

async function askRemove(attribute: RecordAttribute) {
  toRemove.value = attribute
  usage.value = null
  usage.value = (await trpc.recordAttribute.usage.query(attribute.id)).filled
}

async function remove() {
  if (!toRemove.value) return
  removing.value = true
  try {
    await trpc.recordAttribute.remove.mutate(toRemove.value.id)
    await queryClient.invalidateQueries({ queryKey: ["records"] })
    toast.success(`${fieldLabel(toRemove.value)} removed`)
    toRemove.value = null
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="admin-resource-page">
    <AdminPageHeader :title="null" :description="`The fields every ${recordLabel.lower.value} has, their type and where they show. Drag to set the order of the grid and the card.`">
      <Button class="dv-button dv-button--primary" @click="dialog = { open: true, field: null }">
        <CirclePlus class="size-4" />Add field
      </Button>
    </AdminPageHeader>
    <div v-if="attributes && !attributes.length" class="dv-panel admin-empty">
      <h2>No field yet</h2>
      <p>Add a field here, or import a CSV file: each of its columns becomes a text field.</p>
    </div>
    <div v-else class="dv-panel overflow-x-auto">
      <table class="w-full text-left">
        <thead>
          <tr>
            <th><span class="sr-only">Order</span></th>
            <th>Name</th>
            <th>Display name</th>
            <th>Type</th>
            <th>Filter in search</th>
            <th>Visible on files</th>
            <th>Searchable</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <Draggable :model-value="attributes ?? []" item-key="id" tag="tbody" handle=".field-handle" @update:model-value="saveOrder">
          <template #item="{ element: attribute, index }: { element: RecordAttribute, index: number }">
            <tr>
              <td class="whitespace-nowrap">
                <GripVertical class="field-handle inline size-4 cursor-grab admin-text-secondary" aria-hidden="true" />
                <button type="button" class="p-1 disabled:opacity-30" :aria-label="`Move ${fieldLabel(attribute)} up`" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="size-3.5" /></button>
                <button type="button" class="p-1 disabled:opacity-30" :aria-label="`Move ${fieldLabel(attribute)} down`" :disabled="index === (attributes?.length ?? 0) - 1" @click="move(index, 1)"><ArrowDown class="size-3.5" /></button>
              </td>
              <td>{{ attribute.name }}</td>
              <td>{{ attribute.displayName }}</td>
              <td>{{ VALUE_TYPE_LABELS[attribute.valueType] }}<span v-if="isSelect(attribute.valueType)" class="admin-text-secondary"> · {{ attribute.options.length }} options</span></td>
              <td>{{ attribute.facetable ? "Yes" : "No" }}</td>
              <td>{{ attribute.viewable ? "Yes" : "No" }}</td>
              <td>{{ attribute.searchable ? "Yes" : "No" }}</td>
              <td>
                <div class="flex gap-2">
                  <Button variant="ghost" size="sm" @click="dialog = { open: true, field: attribute }"><PencilLine class="size-4" />Edit</Button>
                  <Button variant="ghost" size="sm" @click="askRemove(attribute)"><Trash2 class="size-4" />Remove</Button>
                </div>
              </td>
            </tr>
          </template>
        </Draggable>
      </table>
      <p role="status" class="sr-only">{{ announcement }}</p>
    </div>

    <FieldEditorDialog v-model:open="dialog.open" :field="dialog.field" :suggestions="(undeclared ?? []).filter((name) => !attributes?.some((field) => field.name === name))" />

    <AlertDialog :open="!!toRemove" @update:open="(open) => { if (!open && !removing) toRemove = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {{ toRemove ? fieldLabel(toRemove) : "" }}?</AlertDialogTitle>
          <AlertDialogDescription>
            <template v-if="usage === null">Counting the values…</template>
            <template v-else>{{ usage }} {{ usage === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value }} hold a value in this field.</template>
            The field and its values are removed from every {{ recordLabel.lower.value }}; each one keeps the value it lost in its history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="removing">Cancel</AlertDialogCancel>
          <Button variant="destructive" :disabled="removing" @click="remove">{{ removing ? "Removing…" : "Remove field" }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
