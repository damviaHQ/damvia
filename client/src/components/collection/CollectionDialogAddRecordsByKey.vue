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
import FieldDescription from "@/components/ui/field/FieldDescription.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useMutation, useQueryClient } from "@tanstack/vue-query"
import { Loader2Icon, Upload } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const props = defineProps<{ modelValue: boolean, collectionId: string }>()
const emit = defineEmits<{ (e: "update:modelValue", isOpen: boolean): void }>()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const { lower, lowerPlural } = useRecordLabel()

const MAX_KEYS = 5000
const pasted = ref("")
const upload = ref<HTMLInputElement>()
const sheet = ref<{ name: string, columns: string[], rows: string[][] } | null>(null)
const column = ref<string>()
const unmatched = ref<string[]>([])

watch(() => props.modelValue, () => {
  pasted.value = ""
  sheet.value = null
  column.value = undefined
  unmatched.value = []
})

// A reference list is pasted from a spreadsheet or dropped as a file; both end
// up as one key per line. The separators are the ones a spreadsheet exports.
function splitRow(line: string, separator: string) {
  const cells: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (quoted && character === '"' && line[index + 1] === '"') {
      cell += '"'
      index++
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === separator && !quoted) {
      cells.push(cell)
      cell = ""
    } else {
      cell += character
    }
  }
  cells.push(cell)
  return cells.map((value) => value.trim())
}

function readSheet(text: string, name: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "")
  if (!lines.length) {
    toast.error("This file is empty.")
    return
  }
  const separator = [";", ",", "\t"]
    .map((candidate) => ({ candidate, count: splitRow(lines[0], candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate
  const columns = splitRow(lines[0], separator)
  sheet.value = { name, columns, rows: lines.slice(1).map((line) => splitRow(line, separator)) }
  // A single column needs no question; otherwise the first one is a guess the
  // user confirms or changes.
  column.value = columns[0]
}

async function handleFileUploaded(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }
  readSheet(await file.text(), file.name)
  if (upload.value) {
    upload.value.value = ""
  }
}

const keys = computed(() => {
  const values = sheet.value
    ? sheet.value.rows.map((row) => row[sheet.value!.columns.indexOf(column.value ?? "")] ?? "")
    : pasted.value.split(/[\r\n;,\t]+/)
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
})
const tooMany = computed(() => keys.value.length > MAX_KEYS)

const { isPending, mutate } = useMutation({
  mutationFn: () => trpc.collection.addRecordsByKey.mutate({ id: props.collectionId, keys: keys.value }),
  onSuccess: (result) => {
    queryClient.invalidateQueries({ queryKey: ["collection"] })
    queryClient.invalidateQueries({ queryKey: ["catalogue"] })
    unmatched.value = result.unmatched
    if (!result.matched) {
      toast.error(`None of these references match a ${lower.value}.`)
      return
    }
    toast.success(result.added === result.matched
      ? `${result.added} ${result.added === 1 ? lower.value : lowerPlural.value} added.`
      : `${result.added} added, ${result.matched - result.added} already in this collection.`)
    if (!result.unmatched.length) {
      emit("update:modelValue", false)
    }
  },
  onError: (error: Error) => toast.error(error.message),
})
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[560px]">
      <form @submit.prevent="mutate()" class="grid gap-6">
        <DialogHeader>
          <DialogTitle>Add {{ lowerPlural }} by reference</DialogTitle>
          <DialogDescription>
            Paste the references, one per line, or load the file they come in. They are matched on
            the {{ lower }} key, ignoring case and surrounding spaces.
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-4">
          <FieldGroup v-if="!sheet">
            <Label for="add-records-keys">References</Label>
            <textarea id="add-records-keys" v-model="pasted" rows="8" class="record-native-select font-mono text-sm"
              placeholder="SKU-001&#10;SKU-002&#10;SKU-003" />
          </FieldGroup>

          <div v-if="!sheet">
            <input ref="upload" type="file" accept=".csv,.tsv,.txt,text/csv" class="hidden"
              aria-label="Reference file" @change="handleFileUploaded" />
            <Button type="button" variant="outline" size="sm" @click="upload?.click()">
              <Upload class="size-5" />Load a CSV file
            </Button>
          </div>

          <FieldGroup v-else>
            <Label for="add-records-column">Which column holds the references?</Label>
            <select id="add-records-column" v-model="column" class="record-native-select">
              <option v-for="name in sheet.columns" :key="name" :value="name">{{ name }}</option>
            </select>
            <FieldDescription>
              {{ sheet.name }}, {{ sheet.rows.length }} {{ sheet.rows.length === 1 ? "row" : "rows" }}.
              <button type="button" class="underline" @click="sheet = null">Use a pasted list instead</button>
            </FieldDescription>
          </FieldGroup>

          <p v-if="tooMany" role="status" class="text-caption text-destructive">
            {{ keys.length }} references at once is more than the {{ MAX_KEYS }} allowed. Split the list.
          </p>
          <p v-else-if="keys.length" role="status" class="text-caption text-neutral-500">
            {{ keys.length }} {{ keys.length === 1 ? "reference" : "references" }} ready.
          </p>

          <div v-if="unmatched.length" class="grid gap-1">
            <p role="status" class="text-caption text-neutral-500">
              {{ unmatched.length }} {{ unmatched.length === 1 ? "reference matches no" : "references match no" }}
              {{ lower }} and {{ unmatched.length === 1 ? "was" : "were" }} left out:
            </p>
            <p class="max-h-24 overflow-auto font-mono text-caption">{{ unmatched.join(", ") }}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isPending" @click="emit('update:modelValue', false)">
            {{ unmatched.length ? "Done" : "Cancel" }}
          </Button>
          <Button type="submit" :disabled="isPending || !keys.length || tooMany">
            Add to collection
            <Loader2Icon v-if="isPending" class="ml-2 h-4 w-4 animate-spin" />
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
