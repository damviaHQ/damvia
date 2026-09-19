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
import { parseQueryParts } from "@/utils/searchQuery"
import { TriangleAlert, X } from "lucide-vue-next"
import { nextTick, ref, watch } from "vue"

const props = withDefaults(defineProps<{
  modelValue: string[]
  exactMatch: boolean
  notFound?: string[]
}>(), { notFound: () => [] })
const emit = defineEmits<{ "update:modelValue": [terms: string[]] }>()

const draft = ref("")
const phrase = ref(props.modelValue[0] ?? "")
const editingIndex = ref<number | null>(null)
const editInputs = ref<HTMLInputElement[]>([])
watch(() => props.modelValue, (value) => { phrase.value = value[0] ?? "" })

function commit(terms: string[]) {
  if (terms.join(" ") !== props.modelValue.join(" ")) {
    emit("update:modelValue", terms)
  }
}

function addDraft() {
  const parts = parseQueryParts(draft.value)
  draft.value = ""
  if (parts.length) {
    commit([...props.modelValue, ...parts])
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Backspace" && draft.value === "" && props.modelValue.length) {
    commit(props.modelValue.slice(0, -1))
  } else if (["Enter", " ", ","].includes(event.key)) {
    event.preventDefault()
    addDraft()
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const parts = parseQueryParts(event.clipboardData?.getData("text/plain"))
  if (parts.length) {
    commit([...props.modelValue, ...parts])
  }
}

function remove(index: number) {
  commit(props.modelValue.filter((_, current) => current !== index))
}

function startEditing(index: number) {
  editingIndex.value = index
  nextTick(() => editInputs.value[0]?.focus())
}

// Typing a space inside a tag splits it into several tags; an emptied tag disappears.
function saveEdit(index: number, value: string) {
  if (editingIndex.value !== index) {
    return
  }
  editingIndex.value = null
  const terms = [...props.modelValue]
  terms.splice(index, 1, ...parseQueryParts(value))
  commit(terms)
}

function submitPhrase() {
  commit(phrase.value.trim() ? [phrase.value.trim()] : [])
}
</script>

<template>
  <div class="flex min-h-9 flex-wrap items-center gap-1 border border-neutral-200 bg-white px-1.5 py-1 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
    <template v-if="!exactMatch">
      <div v-for="(term, index) in modelValue" :key="`${index}-${term}`" class="flex max-w-full items-center bg-neutral-100 text-body font-medium text-neutral-800" :class="notFound.includes(term) && 'bg-[var(--dv-color-warning-soft)] text-[var(--dv-color-warning)]'">
        <input v-if="editingIndex === index" ref="editInputs" :value="term" :aria-label="`Edit ${term}`" class="h-6 min-w-16 bg-transparent px-2 text-body outline-hidden" @blur="saveEdit(index, ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="saveEdit(index, ($event.target as HTMLInputElement).value)" @keydown.esc.prevent="editingIndex = null" />
        <button v-else type="button" class="flex h-6 min-w-0 cursor-text items-center gap-1 pl-2 pr-1" :title="notFound.includes(term) ? 'No file found for this term. Click to edit.' : 'Click to edit'" @click="startEditing(index)">
          <TriangleAlert v-if="notFound.includes(term)" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ term }}</span>
          <span v-if="notFound.includes(term)" class="sr-only">, not found</span>
        </button>
        <button type="button" :aria-label="`Remove ${term}`" class="grid h-6 w-6 cursor-pointer place-items-center hover:text-red-600" @click="remove(index)">
          <X class="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <input id="search-panel-terms" v-model="draft" type="text" class="h-6 min-w-24 flex-1 bg-transparent text-body text-neutral-900 outline-hidden placeholder:text-[color:var(--dv-text-secondary)]" :placeholder="modelValue.length ? 'Add a word…' : 'Words or references, separated by spaces'" autocomplete="off" @keydown="handleKeydown" @paste="handlePaste" @blur="addDraft" />
    </template>
    <input v-else id="search-panel-terms" v-model="phrase" type="text" class="h-6 min-w-0 flex-1 bg-transparent text-body text-neutral-900 outline-hidden placeholder:text-[color:var(--dv-text-secondary)]" placeholder="The exact text to look for" autocomplete="off" @keydown.enter.prevent="submitPhrase" @blur="submitPhrase" />
  </div>
</template>
