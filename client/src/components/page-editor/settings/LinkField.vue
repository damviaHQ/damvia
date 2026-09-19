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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { computed, useId } from "vue"
import Treeselect from "vue3-treeselect-ts"

const props = defineProps<{ modelValue: any; label?: string }>()
const emit = defineEmits<{ (e: "update:modelValue", value: any): void }>()

const fieldId = useId()
const globalStore = useGlobalStore()
const kind = computed(() => props.modelValue?.kind ?? "none")

const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})
// Only admins can list standalone pages, so only they can link to one.
const isAdmin = computed(() => globalStore.user?.role === "admin")
const { data: pages } = useQuery({
  queryKey: ["pages"],
  queryFn: () => trpc.page.list.query(),
  enabled: isAdmin,
})

const collectionOptions = computed(() => {
  function format(items: any[]): any[] {
    return items.map((item) => ({ id: item.id, label: item.name, children: item.children ? format(item.children) : undefined }))
  }
  return collections.value ? format(collections.value) : []
})

function setKind(value: string) {
  if (value === "none") emit("update:modelValue", null)
  else if (value === "collection") emit("update:modelValue", { kind: "collection", collectionId: "" })
  else if (value === "page") emit("update:modelValue", { kind: "page", pageId: "" })
  else emit("update:modelValue", { kind: "url", url: "", external: true })
}

function patch(values: Record<string, unknown>) {
  emit("update:modelValue", { ...props.modelValue, ...values })
}
</script>

<template>
  <FieldGroup>
    <Label :for="`${fieldId}-kind`">{{ label ?? "Links to" }}</Label>
    <Select :model-value="kind" @update:model-value="setKind($event as string)">
      <SelectTrigger :id="`${fieldId}-kind`"><SelectValue placeholder="Nothing" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nothing</SelectItem>
        <SelectItem value="collection">A collection</SelectItem>
        <SelectItem v-if="isAdmin" value="page">A page</SelectItem>
        <SelectItem value="url">A web address</SelectItem>
      </SelectContent>
    </Select>
  </FieldGroup>
  <FieldGroup v-if="kind === 'collection'">
    <Label :id="`${fieldId}-collection`">Collection</Label>
    <Treeselect :model-value="modelValue.collectionId" :options="collectionOptions" :clearable="true" :flat="true"
      placeholder="Choose a collection" @update:model-value="patch({ collectionId: $event })" />
  </FieldGroup>
  <FieldGroup v-else-if="kind === 'page'">
    <Label :for="`${fieldId}-page`">Page</Label>
    <Select :model-value="modelValue.pageId" @update:model-value="patch({ pageId: $event })">
      <SelectTrigger :id="`${fieldId}-page`"><SelectValue placeholder="Choose a page" /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="page in pages ?? []" :key="page.id" :value="page.id">{{ page.name }}</SelectItem>
      </SelectContent>
    </Select>
  </FieldGroup>
  <template v-else-if="kind === 'url'">
    <FieldGroup>
      <Label :for="`${fieldId}-url`">Web address</Label>
      <Input :id="`${fieldId}-url`" type="url" placeholder="https://example.com" :model-value="modelValue.url"
        @update:model-value="patch({ url: $event })" />
    </FieldGroup>
    <div class="flex items-center gap-2">
      <Checkbox :id="`${fieldId}-external`" :model-value="modelValue.external !== false"
        @update:model-value="patch({ external: $event === true })" />
      <Label :for="`${fieldId}-external`">Open in a new tab</Label>
    </div>
  </template>
</template>
