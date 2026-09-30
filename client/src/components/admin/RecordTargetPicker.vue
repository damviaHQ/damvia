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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { RouterInput, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import type { AcceptableValue } from "reka-ui"
import { computed, ref, watch } from "vue"

export type RecordTarget = RouterInput["entityResolution"]["attach"]["target"]

// What a file or a folder is linked to: one record by its key, or a range,
// every record sharing a value. Shared by the dialogs that link by hand.
const props = defineProps<{ active: boolean; saving?: boolean }>()
const emit = defineEmits<{ "update:target": [RecordTarget | null]; create: [string] }>()
const label = useRecordLabel()
const mode = ref<"record" | "attribute">("record")
const search = ref("")
const debounced = refDebounced(search, 300)
const selectedKey = ref<string | null>(null)
const attributeName = ref("")
const attributeValue = ref<string | null>(null)

watch(() => props.active, (active) => {
  if (active) {
    mode.value = "record"
    search.value = ""
    selectedKey.value = null
    attributeName.value = ""
    attributeValue.value = null
  }
})
watch(mode, () => { search.value = ""; selectedKey.value = null; attributeValue.value = null })

const { data: attributes } = useQuery({
  queryKey: ["records", "available-attributes"],
  queryFn: () => trpc.recordAttribute.listAvailable.query(),
  enabled: computed(() => props.active),
})
const { data: found, isFetching } = useQuery({
  queryKey: computed(() => ["record-targets", mode.value, attributeName.value, debounced.value]),
  queryFn: () => trpc.entityResolution.findTargets.query({ query: debounced.value, attributeName: mode.value === "attribute" ? attributeName.value : undefined }),
  enabled: computed(() => props.active && (mode.value === "record" || !!attributeName.value)),
})
const exactKnown = computed(() => found.value?.records.some((record) => record.key === search.value.trim()))
const target = computed<RecordTarget | null>(() => {
  if (mode.value === "record") return selectedKey.value ? { kind: "record", key: selectedKey.value } : null
  return attributeName.value && attributeValue.value ? { kind: "attribute", name: attributeName.value, value: attributeValue.value } : null
})

watch(target, (value) => emit("update:target", value), { immediate: true })

function createRecord() {
  emit("create", search.value.trim())
}
</script>

<template>
  <Tabs v-model="mode">
    <TabsList>
      <TabsTrigger value="record">A {{ label.lower.value }}</TabsTrigger>
      <TabsTrigger value="attribute">A range</TabsTrigger>
    </TabsList>
    <TabsContent value="record" class="mt-4 flex flex-col gap-3">
      <Label for="record-picker-search">Search by key or by any searchable attribute</Label>
      <Input id="record-picker-search" v-model="search" type="search" placeholder="EVT-25028" autocomplete="off" />
      <p v-if="isFetching" role="status" class="admin-text-secondary">Searching…</p>
      <ul v-else-if="found?.records.length" class="record-picker__list" role="listbox" :aria-label="label.plural.value">
        <li v-for="record in found.records" :key="record.id">
          <button type="button" role="option" :aria-selected="selectedKey === record.key" class="record-picker__option" :class="{ 'is-selected': selectedKey === record.key }" @click="selectedKey = record.key">
            <strong>{{ record.key }}</strong>
            <span v-if="record.label" class="admin-text-secondary">{{ record.label }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="search.trim()" class="admin-text-secondary">No {{ label.lower.value }} matches “{{ search.trim() }}”.</p>
      <div v-if="search.trim() && !exactKnown && !isFetching && !selectedKey" class="admin-form-note">
        <p>No {{ label.lower.value }} has the key <code>{{ search.trim() }}</code>.</p>
        <Button type="button" variant="outline" size="sm" class="mt-2" :disabled="saving" @click="createRecord">Create {{ label.lower.value }} with this key</Button>
        <p class="mt-2">It is created with the key only. Fill its data on the next CSV import.</p>
      </div>
    </TabsContent>
    <TabsContent value="attribute" class="mt-4 flex flex-col gap-3">
      <p class="admin-text-secondary">A range links the files to every {{ label.lower.value }} sharing a value, for example all the {{ label.lowerPlural.value }} of one collection.</p>
      <Label for="record-picker-attribute">Attribute</Label>
      <Select :model-value="attributeName" @update:model-value="(value: AcceptableValue) => { attributeName = String(value); attributeValue = null }">
        <SelectTrigger id="record-picker-attribute"><SelectValue placeholder="Choose an attribute" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="name in attributes" :key="name" :value="name">{{ name }}</SelectItem>
        </SelectContent>
      </Select>
      <template v-if="attributeName">
        <Label for="record-picker-value">Value</Label>
        <Input id="record-picker-value" v-model="search" type="search" placeholder="Search the values" autocomplete="off" />
        <ul v-if="found?.values.length" class="record-picker__list" role="listbox" aria-label="Values">
          <li v-for="value in found.values" :key="value.value">
            <button type="button" role="option" :aria-selected="attributeValue === value.value" class="record-picker__option" :class="{ 'is-selected': attributeValue === value.value }" @click="attributeValue = value.value">
              <strong>{{ value.value }}</strong>
              <span class="admin-text-secondary">{{ value.records }} {{ value.records === 1 ? label.lower.value : label.lowerPlural.value }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="!isFetching" class="admin-text-secondary">No value found.</p>
      </template>
    </TabsContent>
  </Tabs>
</template>

<style scoped>
.record-picker__list { display:grid; gap:4px; max-height:260px; overflow:auto; }
.record-picker__option { display:flex; width:100%; justify-content:space-between; gap:12px; padding:8px 10px; text-align:left; border:1px solid var(--dv-color-line); border-radius:var(--dv-radius-data); }
.record-picker__option:hover, .record-picker__option.is-selected { border-color:var(--dv-color-primary, currentColor); }
.record-picker__option.is-selected { background:var(--dv-surface-canvas); }
</style>
