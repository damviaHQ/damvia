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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronDown, PencilLine, Plus, Trash2 } from "@lucide/vue"
import { nextTick, ref, watch } from "vue"
import Draggable from "vuedraggable"

export type RecordTableTab = { id: string, name: string, recordCount: number }

// The tables of the catalogue as tabs above the grid, like the sheets of a
// workbook. A tab is renamed in place and dragged to reorder.
const props = defineProps<{ tables: RecordTableTab[], active: string | null }>()
const emit = defineEmits<{
  select: [id: string]
  create: [name: string]
  rename: [id: string, name: string]
  remove: [table: RecordTableTab]
  reorder: [ids: string[]]
}>()

const editing = ref<string | null>(null)
const draft = ref("")
const input = ref<HTMLInputElement[] | HTMLInputElement | null>(null)

function focusInput() {
  nextTick(() => {
    const element = Array.isArray(input.value) ? input.value[0] : input.value
    element?.focus()
    element?.select()
  })
}
function startRename(table: RecordTableTab) {
  editing.value = table.id
  draft.value = table.name
  focusInput()
}
function startCreate() {
  editing.value = "new"
  draft.value = ""
  focusInput()
}
function commit() {
  const name = draft.value.trim()
  const id = editing.value
  editing.value = null
  if (!name || !id) return
  if (id === "new") emit("create", name)
  else if (name !== props.tables.find((table) => table.id === id)?.name) emit("rename", id, name)
}

// The open tab scrolls into view when the tabs overflow.
watch(() => props.active, (id) => nextTick(() => document.getElementById(`record-table-${id}`)?.scrollIntoView({ block: "nearest", inline: "nearest" })), { immediate: true })

function onKeydown(event: KeyboardEvent, index: number) {
  const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
  if (!delta) return
  event.preventDefault()
  const next = props.tables[(index + delta + props.tables.length) % props.tables.length]
  emit("select", next.id)
  nextTick(() => document.getElementById(`record-table-${next.id}`)?.focus())
}
</script>

<template>
  <div class="records-tabs">
    <Draggable :model-value="tables" item-key="id" tag="div" class="records-tabs-list" role="tablist" aria-label="Tables" :animation="150"
      :disabled="!!editing || tables.length < 2" @update:model-value="(items: RecordTableTab[]) => emit('reorder', items.map((item) => item.id))">
      <template #item="{ element: table, index }: { element: RecordTableTab, index: number }">
        <div class="records-tab" :class="{ 'is-active': table.id === active }">
          <input v-if="editing === table.id" ref="input" v-model="draft" class="records-tab-input" :aria-label="`Rename ${table.name}`" maxlength="100"
            @keydown.enter.prevent="commit" @keydown.esc="editing = null" @blur="commit" />
          <template v-else>
            <button :id="`record-table-${table.id}`" type="button" role="tab" class="records-tab-button" :aria-selected="table.id === active" :tabindex="table.id === active ? 0 : -1"
              :title="`${table.recordCount} records`" @click="emit('select', table.id)" @dblclick="startRename(table)" @keydown="onKeydown($event, index)">
              {{ table.name }}
            </button>
            <DropdownMenu v-if="table.id === active">
              <DropdownMenuTrigger as-child>
                <button type="button" class="records-tab-menu" :aria-label="`${table.name} table actions`"><ChevronDown class="size-3.5" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem @select="startRename(table)"><PencilLine />Rename</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" :disabled="tables.length < 2" @select="emit('remove', table)"><Trash2 />Delete table</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>
        </div>
      </template>
      <template #footer>
        <div v-if="editing === 'new'" class="records-tab is-active">
          <input ref="input" v-model="draft" class="records-tab-input" aria-label="Name of the new table" placeholder="Table name" maxlength="100"
            @keydown.enter.prevent="commit" @keydown.esc="editing = null" @blur="commit" />
        </div>
      </template>
    </Draggable>
    <button type="button" class="records-tab-add" aria-label="Add a table" title="Add a table" @click="startCreate"><Plus class="size-4" /></button>
  </div>
</template>
