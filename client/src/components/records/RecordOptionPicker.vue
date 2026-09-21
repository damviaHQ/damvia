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
import { joinMulti, splitMulti } from "@/utils/recordValues"
import { Check, Plus } from "@lucide/vue"
import { computed, nextTick, onMounted, ref } from "vue"

// The list behind a select field: type to narrow it, arrows to move, Enter to
// pick. A multiple select toggles and keeps the list open until it closes.
const props = defineProps<{
  options: string[]
  multiple: boolean
  modelValue: string
  label: string
  initialSearch?: string
  canCreate?: boolean
}>()
const emit = defineEmits<{
  "update:modelValue": [value: string]
  commit: [value: string, move?: "down" | "up" | "next" | "previous"]
  cancel: []
  create: [option: string]
}>()

const search = ref(props.initialSearch ?? "")
const input = ref<HTMLInputElement | null>(null)
const highlighted = ref(0)
const selected = computed(() => props.multiple ? splitMulti(props.modelValue) : (props.modelValue ? [props.modelValue] : []))
const visible = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return query ? props.options.filter((option) => option.toLocaleLowerCase().includes(query)) : props.options
})
const creatable = computed(() => {
  const value = search.value.trim()
  return !!props.canCreate && !!value && !value.includes("|") && !props.options.some((option) => option.toLocaleLowerCase() === value.toLocaleLowerCase())
})
const entries = computed(() => [...visible.value.map((option) => ({ kind: "option" as const, option })), ...(creatable.value ? [{ kind: "create" as const, option: search.value.trim() }] : [])])
const listId = `options-${Math.random().toString(36).slice(2)}`

onMounted(() => nextTick(() => input.value?.focus()))

function valueWith(option: string): string {
  if (!props.multiple) return option
  const next = selected.value.includes(option) ? selected.value.filter((item) => item !== option) : [...selected.value, option]
  return joinMulti(props.options.filter((item) => next.includes(item)).concat(next.filter((item) => !props.options.includes(item))))
}

function pick(index: number) {
  const entry = entries.value[index]
  if (!entry) return
  if (entry.kind === "create") {
    emit("create", entry.option)
    search.value = ""
    return
  }
  const value = valueWith(entry.option)
  if (props.multiple) emit("update:modelValue", value)
  else emit("commit", value)
}

function onKeydown(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key === "ArrowDown") highlighted.value = Math.min(entries.value.length - 1, highlighted.value + 1)
  else if (event.key === "ArrowUp") highlighted.value = Math.max(0, highlighted.value - 1)
  else if (event.key === "Enter") pick(highlighted.value)
  else if (event.key === " " && props.multiple && !search.value) pick(highlighted.value)
  else if (event.key === "Escape") emit("cancel")
  else if (event.key === "Tab") emit("commit", props.modelValue, event.shiftKey ? "previous" : "next")
  else if (event.key === "Backspace" && !search.value && !props.multiple) emit("commit", "")
  else return
  event.preventDefault()
}
</script>

<template>
  <div class="record-option-picker" @keydown="onKeydown">
    <input ref="input" v-model="search" type="text" class="record-option-search" :aria-label="`Search ${label}`"
      role="combobox" aria-expanded="true" :aria-controls="listId" :aria-activedescendant="entries.length ? `${listId}-${highlighted}` : undefined"
      placeholder="Find an option" @input="highlighted = 0" />
    <ul :id="listId" role="listbox" :aria-label="label" :aria-multiselectable="multiple || undefined" class="record-option-list">
      <li v-for="(entry, index) in entries" :id="`${listId}-${index}`" :key="entry.kind + entry.option" role="option"
        :aria-selected="entry.kind === 'option' && selected.includes(entry.option)"
        :class="{ 'is-highlighted': index === highlighted }" @mousedown.prevent @click="pick(index)" @mousemove="highlighted = index">
        <template v-if="entry.kind === 'option'">
          <span class="record-option-check"><Check v-if="selected.includes(entry.option)" class="size-3.5" /></span>
          <span class="record-chip">{{ entry.option }}</span>
        </template>
        <template v-else><Plus class="size-3.5" /> Add option "{{ entry.option }}"</template>
      </li>
      <li v-if="!entries.length" class="record-option-empty" role="presentation">No option matches.</li>
    </ul>
    <div class="record-option-footer">
      <button v-if="selected.length" type="button" class="record-option-clear" @mousedown.prevent @click="emit('commit', '')">Clear</button>
      <button v-if="multiple" type="button" class="record-option-done" @mousedown.prevent @click="emit('commit', modelValue)">Done</button>
    </div>
  </div>
</template>
