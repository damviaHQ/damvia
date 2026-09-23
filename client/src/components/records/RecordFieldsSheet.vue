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
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useGlobalToast } from "@/composables/useGlobalToast"
import type { RouterOutput } from "@/services/server"
import { trpc } from "@/services/server"
import { fieldLabel, isSelect, VALUE_TYPE_LABELS } from "@/utils/recordValues"
import { useQueryClient } from "@tanstack/vue-query"
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, PencilLine, Plus, Trash2 } from "@lucide/vue"
import { ref } from "vue"
import Draggable from "vuedraggable"

type Field = RouterOutput["recordAttribute"]["list"][number]
type Table = RouterOutput["recordTable"]["list"][number]
type Setting = "facetable" | "viewable" | "searchable"

// Every field of the catalogue at once: its order for everyone, and what
// readers get from it in the DAM.
const props = defineProps<{ fields: Field[], recordLabel: string, tables?: Table[] }>()
const open = defineModel<boolean>("open", { required: true })
const emit = defineEmits<{ add: [], edit: [field: Field], remove: [field: Field] }>()

const toast = useGlobalToast()
const queryClient = useQueryClient()
const announcement = ref("")
const saving = ref<string | null>(null)

const SETTINGS: { key: Setting, label: string, hint: string }[] = [
  { key: "facetable", label: "Filter", hint: "A filter in the DAM search" },
  { key: "viewable", label: "Show", hint: "Shown on the files of the record" },
  { key: "searchable", label: "Search", hint: "Its values are found by the search box" },
]

async function saveOrder(items: Field[]) {
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
  const items = [...props.fields]
  const target = index + delta
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target], items[index]]
  announcement.value = `${fieldLabel(items[target])} moved to position ${target + 1} of ${items.length}`
  saveOrder(items)
}

// Fields are shared by every table; each table shows the ones ticked here.
const tablesOf = (field: Field) => (props.tables ?? []).filter((table) => table.fieldIds.includes(field.id))
function tablesSummary(field: Field) {
  const shown = tablesOf(field)
  if (!shown.length) return "None"
  if (shown.length === props.tables?.length && shown.length > 1) return "All"
  return shown.map((table) => table.name).join(", ")
}
async function toggleTable(field: Field, table: Table, shown: boolean) {
  const ids = tablesOf(field).map((item) => item.id).filter((id) => id !== table.id)
  saving.value = field.id
  try {
    const tables = await trpc.recordTable.setFieldTables.mutate({ fieldId: field.id, tableIds: shown ? [...ids, table.id] : ids })
    queryClient.setQueryData(["records", "tables"], tables)
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    saving.value = null
  }
}

// A filter is always shown on the files too, as the server keeps it.
async function toggle(field: Field, key: Setting, value: boolean) {
  saving.value = field.id
  try {
    await trpc.recordAttribute.update.mutate({ id: field.id, [key]: value })
    await queryClient.invalidateQueries({ queryKey: ["records", "attributes"] })
  } catch (failure) {
    toast.error((failure as Error).message)
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="records-fields-sheet">
      <header class="records-fields-header">
        <SheetTitle>{{ recordLabel }} fields</SheetTitle>
        <SheetDescription>Fields are shared by every table; Tables sets where each one shows. The order here is the order a new table starts from. Filter, Show and Search set what readers get in the DAM.</SheetDescription>
      </header>
      <div class="records-fields-body">
        <p v-if="!fields.length" class="admin-text-secondary">No field yet. Add one here, or import a CSV or Excel file: each of its columns becomes a text field.</p>
        <table v-else class="records-fields-table">
          <thead>
            <tr>
              <th><span class="sr-only">Order</span></th>
              <th>Field</th>
              <th v-if="tables?.length">Tables</th>
              <th v-for="setting in SETTINGS" :key="setting.key" :title="setting.hint" class="is-setting">{{ setting.label }}</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <Draggable :model-value="fields" item-key="id" tag="tbody" handle=".records-fields-handle" @update:model-value="saveOrder">
            <template #item="{ element: field, index }: { element: Field, index: number }">
              <tr :aria-busy="saving === field.id">
                <td class="records-fields-order">
                  <GripVertical class="records-fields-handle size-4" aria-hidden="true" />
                  <button type="button" :aria-label="`Move ${fieldLabel(field)} up`" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="size-3.5" /></button>
                  <button type="button" :aria-label="`Move ${fieldLabel(field)} down`" :disabled="index === fields.length - 1" @click="move(index, 1)"><ArrowDown class="size-3.5" /></button>
                </td>
                <td>
                  <strong>{{ fieldLabel(field) }}</strong>
                  <span class="records-fields-meta">{{ VALUE_TYPE_LABELS[field.valueType] }}<template v-if="isSelect(field.valueType)"> · {{ field.options.length }} options</template><template v-if="field.displayName"> · {{ field.name }}</template></span>
                </td>
                <td v-if="tables?.length" class="records-fields-tables">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <button type="button" class="records-fields-tables-button" :disabled="saving === field.id" :aria-label="`Tables that show ${fieldLabel(field)}: ${tablesSummary(field)}`">
                        <span class="truncate">{{ tablesSummary(field) }}</span><ChevronDown class="size-3.5 shrink-0" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Show {{ fieldLabel(field) }} in</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem v-for="table in tables" :key="table.id" :model-value="table.fieldIds.includes(field.id)"
                        @select.prevent @update:model-value="(value) => toggleTable(field, table, value === true)">{{ table.name }}</DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
                <td v-for="setting in SETTINGS" :key="setting.key" class="is-setting">
                  <Checkbox :model-value="field[setting.key]" :disabled="saving === field.id || (setting.key === 'viewable' && field.facetable)"
                    :aria-label="`${fieldLabel(field)}: ${setting.hint.toLowerCase()}`" @update:model-value="(value) => toggle(field, setting.key, value === true)" />
                </td>
                <td class="records-fields-actions">
                  <Button variant="ghost" size="icon" :aria-label="`Edit ${fieldLabel(field)}`" @click="emit('edit', field)"><PencilLine class="size-4" /></Button>
                  <Button variant="ghost" size="icon" :aria-label="`Remove ${fieldLabel(field)}`" @click="emit('remove', field)"><Trash2 class="size-4" /></Button>
                </td>
              </tr>
            </template>
          </Draggable>
        </table>
        <p role="status" class="sr-only">{{ announcement }}</p>
        <Button variant="outline" class="self-start" @click="emit('add')"><Plus class="size-4" />Add a field</Button>
        <p class="admin-text-secondary records-fields-note">A filter is always shown on files. Metadata read from the files themselves is set on <router-link :to="{ name: 'admin-file-metadata' }">File metadata</router-link>.</p>
      </div>
    </SheetContent>
  </Sheet>
</template>
