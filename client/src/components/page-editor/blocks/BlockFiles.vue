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
import type { RouterOutput } from "@/services/server.ts"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed, ref, watch } from 'vue'
import Treeselect from "vue3-treeselect-ts"

const props = defineProps<{
  data?: {
    layout?: string
    title?: string
    collectionId?: string | null
  }
}>()

const form = ref({
  layout: props.data?.layout ?? 'user_preferences',
  title: props.data?.title ?? '',
  collectionId: props.data?.collectionId ?? null
})

watch(() => props.data, (newData) => {
  if (newData) {
    form.value = {
      layout: newData.layout ?? 'user_preferences',
      title: newData.title ?? '',
      collectionId: newData.collectionId ?? null
    }
  }
}, { deep: true, immediate: true })

const emit = defineEmits<{
  (e: "update", value: { data: any }): void
}>()

const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})

const collectionOptions = computed(() => {
  if (!collections.value) return []

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
  emit("update", {
    data: {
      layout: form.value.layout === 'user_preferences' ? undefined : form.value.layout,
      title: form.value.title || undefined,
      collectionId: form.value.collectionId || undefined
    }
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-lg font-medium">Add files block</h1>
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
      <Input type="text" v-model="form.title" @update:modelValue="updateForm" />
    </div>
    <div class="flex flex-col gap-2">
      <Label>Use custom collection</Label>
      <Treeselect v-model="form.collectionId" class="mb-075" placeholder="By default it uses current collection files"
        :options="collectionOptions" :clearable="true" @update:modelValue="updateForm" />
    </div>
  </div>
</template>