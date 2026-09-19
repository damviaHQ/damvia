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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed, useId } from "vue"
import Treeselect from "vue3-treeselect-ts"

// The three listing blocks share every option they have.
const props = defineProps<{ data: any; type: "collections" | "files" | "last_files" }>()
const emit = defineEmits<{ (e: "update", data: any): void }>()

const fieldId = useId()
const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
  enabled: computed(() => props.type !== "last_files"),
})

const collectionOptions = computed(() => {
  function format(items: any[]): any[] {
    return items.map((item) => ({ id: item.id, label: item.name, children: item.children ? format(item.children) : undefined }))
  }
  return collections.value ? format(collections.value) : []
})

function patch(values: Record<string, unknown>) {
  emit("update", { ...props.data, ...values })
}
</script>

<template>
  <div class="grid gap-3">
    <FieldGroup>
      <Label :for="`${fieldId}-title`">Title (optional)</Label>
      <Input :id="`${fieldId}-title`" type="text" :model-value="data.title ?? ''"
        @update:model-value="patch({ title: $event || null })" />
    </FieldGroup>
    <FieldGroup>
      <Label :for="`${fieldId}-layout`">Display</Label>
      <Select :model-value="data.layout ?? 'user_preferences'"
        @update:model-value="patch({ layout: $event === 'user_preferences' ? null : $event })">
        <SelectTrigger :id="`${fieldId}-layout`"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="user_preferences">As the reader prefers</SelectItem>
          <SelectItem value="grid">Grid</SelectItem>
          <SelectItem value="list">List</SelectItem>
        </SelectContent>
      </Select>
    </FieldGroup>
    <FieldGroup v-if="type === 'collections'">
      <Label :id="`${fieldId}-selection`">Collections to show (optional)</Label>
      <Treeselect :model-value="data.collectionsId ?? []" :options="collectionOptions" :clearable="true"
        :multiple="true" :flat="true" placeholder="The sub-collections of this collection"
        @update:model-value="patch({ collectionsId: $event?.length ? $event : null })" />
    </FieldGroup>
    <FieldGroup v-else-if="type === 'files'">
      <Label :id="`${fieldId}-collection`">Collection (optional)</Label>
      <Treeselect :model-value="data.collectionId ?? null" :options="collectionOptions" :clearable="true" :flat="true"
        placeholder="This collection" @update:model-value="patch({ collectionId: $event || null })" />
    </FieldGroup>
  </div>
</template>
