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
import { Popover, PopoverContent } from "@/components/ui/popover"
import { fieldLabel, joinMulti, splitMulti, type ValueField } from "@/utils/recordValues"
import { PopoverAnchor } from "reka-ui"
import { computed, nextTick, onMounted, ref, watch } from "vue"
import RecordOptionPicker from "./RecordOptionPicker.vue"

export type EditorMove = "down" | "up" | "next" | "previous"

// Edits one cell in place. Short values get an input over the cell; long
// text and selects open a panel anchored to it.
const props = defineProps<{
  field: ValueField
  initial: string
  typed?: string
  addOption: (option: string) => Promise<void>
}>()
const emit = defineEmits<{ commit: [value: string, move?: EditorMove], cancel: [], draft: [value: string] }>()

const isSelect = computed(() => props.field.valueType === "single_select" || props.field.valueType === "multi_select")
const acceptsTyping = ["text", "long_text", "number", "url"].includes(props.field.valueType)
const value = ref(props.typed !== undefined && acceptsTyping ? props.typed : props.initial)
const input = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
let done = false
// The cell shows the options as they are ticked, before the list closes and saves.
watch(value, (next) => emit("draft", next))

const inputType = computed(() => ({ number: "text", date: "date", url: "url" } as Record<string, string>)[props.field.valueType] ?? "text")

onMounted(() => nextTick(() => {
  const element = input.value
  if (!element) return
  element.focus()
  if (element instanceof HTMLTextAreaElement || element.type === "text" || element.type === "url") {
    const end = element.value.length
    element.setSelectionRange(end, end)
  }
}))

function commit(next: string, move?: EditorMove) {
  if (done) return
  done = true
  emit("commit", next, move)
}

function cancel() {
  if (done) return
  done = true
  emit("cancel")
}

function onInputKeydown(event: KeyboardEvent) {
  event.stopPropagation()
  const multiline = props.field.valueType === "long_text"
  if (event.key === "Escape") cancel()
  else if (event.key === "Tab") commit(value.value, event.shiftKey ? "previous" : "next")
  else if (event.key === "Enter" && multiline && (event.metaKey || event.ctrlKey)) commit(value.value, "down")
  else if (event.key === "Enter" && !multiline) commit(value.value, event.shiftKey ? "up" : "down")
  else return
  event.preventDefault()
}

async function create(option: string) {
  await props.addOption(option)
  if (props.field.valueType === "single_select") commit(option)
  else value.value = joinMulti([...splitMulti(value.value), option])
}

function onOpenChange(open: boolean) {
  if (open) return
  if (props.field.valueType === "multi_select" || props.field.valueType === "long_text") commit(value.value)
  else cancel()
}
</script>

<template>
  <Popover v-if="isSelect || field.valueType === 'long_text'" :open="true" @update:open="onOpenChange">
    <PopoverAnchor as-child><div class="record-cell-anchor" /></PopoverAnchor>
    <PopoverContent align="start" class="record-cell-popover" @open-auto-focus.prevent @close-auto-focus.prevent>
      <RecordOptionPicker v-if="isSelect" v-model="value" :options="field.options" :multiple="field.valueType === 'multi_select'"
        :label="fieldLabel(field)" :initial-search="typed" can-create @commit="commit" @cancel="cancel" @create="create" />
      <div v-else class="record-long-text">
        <textarea ref="input" v-model="value" rows="6" :aria-label="fieldLabel(field)" @keydown="onInputKeydown" />
        <p class="admin-text-secondary">Ctrl+Enter or ⌘+Enter to save, Esc to cancel.</p>
      </div>
    </PopoverContent>
  </Popover>
  <input v-else ref="input" v-model="value" :type="inputType" class="record-cell-input" :aria-label="fieldLabel(field)"
    :inputmode="field.valueType === 'number' ? 'decimal' : undefined" @keydown="onInputKeydown" @blur="commit(value)" />
</template>
