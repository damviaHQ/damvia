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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Collection } from "@/layouts/LayoutPageEditor.vue"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed, ref, watch } from 'vue'
import Treeselect from "vue3-treeselect-ts"

const props = defineProps<{
  data?: {
    layout?: string
    title?: string
    collectionsId?: string[]
  }
}>()

const emit = defineEmits<{
  (e: "update", value: any): void
}>()

const form = ref({
  layout: props.data?.layout ?? 'user_preferences',
  title: props.data?.title ?? '',
  collectionsId: props.data?.collectionsId ?? []
})

watch(() => props.data, (newData) => {
  if (newData) {
    form.value = {
      layout: newData.layout ?? 'user_preferences',
      title: newData.title ?? '',
      collectionsId: newData.collectionsId ?? []
    }
  }
}, { deep: true, immediate: true })

const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})

const collectionOptions = computed(() => {
  if (!collections.value) {
    return []
  }

  function formatCollectionArray(collections: RouterOutput["collection"]["tree"]): any {
    return collections.map((c: Collection) => ({
      id: c.id,
      label: c.name,
      children: c.children ? formatCollectionArray(c.children) : undefined,
    }))
  }
  return formatCollectionArray(collections.value)
})

function updateForm() {
  emit('update', {
    data: {
      layout: form.value.layout === 'user_preferences' ? undefined : form.value.layout,
      title: form.value.title || undefined,
      collectionsId: form.value.collectionsId.length > 0 ? form.value.collectionsId : undefined
    }
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-lg font-medium">Add collection content</h1>
    <div class="flex flex-col gap-2">
      <Label>Layout</Label>
      <Select v-model="form.layout" @update:modelValue="updateForm">
        <SelectTrigger>
          <SelectValue placeholder="Use user preferences" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user_preferences">Use user preferences</SelectItem>
          <SelectItem value="grid">Grid</SelectItem>
          <SelectItem value="list">List</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex flex-col gap-2">
      <Label>Custom title (optional)</Label>
      <Input type="text" v-model="form.title" @input="updateForm" />
    </div>
    <div class="flex flex-col gap-2">
      <Label>Custom selection (optional)</Label>
      <Treeselect v-model="form.collectionsId" class="mb-075" placeholder="By default it uses current sub-collections"
        :options="collectionOptions" :clearable="true" :multiple="true" :flat="true" @update:modelValue="updateForm" />
    </div>
  </div>
</template>