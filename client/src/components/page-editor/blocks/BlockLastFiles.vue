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
import { ref, watch } from 'vue'

const props = defineProps<{
  data: {
    layout?: string
    title?: string
  }
}>()

const emit = defineEmits<{
  (e: "update", value: { data: any }): void
}>()

const form = ref({
  layout: props.data.layout || 'user_preferences',
  title: props.data.title || '',
})

watch(() => props.data, (newData) => {
  form.value = {
    layout: newData.layout || 'user_preferences',
    title: newData.title || '',
  }
}, { deep: true, immediate: true })

function updateForm() {
  emit("update", {
    data: {
      layout: form.value.layout === 'user_preferences' ? undefined : form.value.layout,
      title: form.value.title || undefined,
    }
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-lg font-medium">Add last files block</h1>
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
  </div>
</template>