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
import { ArrowDown, ArrowUp, GripVertical, Plus } from "@lucide/vue"
import Draggable from "vuedraggable"

export type ColumnChoice = { id: string, label: string, hidden: boolean }

// Which columns show and in which order, for this browser.
const props = defineProps<{ columns: ColumnChoice[] }>()
const emit = defineEmits<{ order: [ids: string[]], toggle: [id: string, visible: boolean], reset: [], addField: [] }>()

function move(index: number, delta: number) {
  const ids = props.columns.map((column) => column.id)
  const target = index + delta
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  emit("order", ids)
}
</script>

<template>
  <div class="record-columns">
    <Draggable :model-value="columns" item-key="id" handle=".record-columns-handle" tag="ul" @update:model-value="(items: ColumnChoice[]) => emit('order', items.map((item) => item.id))">
      <template #item="{ element, index }">
        <li class="record-columns-item">
          <GripVertical class="record-columns-handle size-4" aria-hidden="true" />
          <Checkbox :id="`column-${element.id}`" :model-value="!element.hidden" @update:model-value="(value) => emit('toggle', element.id, value === true)" />
          <label :for="`column-${element.id}`" class="truncate flex-1">{{ element.label }}</label>
          <button type="button" :aria-label="`Move ${element.label} up`" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="size-3.5" /></button>
          <button type="button" :aria-label="`Move ${element.label} down`" :disabled="index === columns.length - 1" @click="move(index, 1)"><ArrowDown class="size-3.5" /></button>
        </li>
      </template>
    </Draggable>
    <div class="flex justify-between gap-2">
      <Button type="button" variant="outline" size="sm" @click="emit('addField')"><Plus class="size-4" />Add field</Button>
      <Button type="button" variant="ghost" size="sm" @click="emit('reset')">Reset layout</Button>
    </div>
  </div>
</template>
