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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ref, useId, watch } from 'vue'

const props = defineProps<{
  data: {
    url?: string
    presignedUrl?: string
    external?: boolean
  }
}>()

const emit = defineEmits<{
  (e: "update", value: { data: any, file: File | null }): void
}>()

const fieldId = useId()

const form = ref({
  url: props.data.url || '',
  presignedUrl: props.data.presignedUrl || '',
  external: props.data.external || false
})

const previewURL = ref<string | null>(props.data.presignedUrl || null)
const file = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

watch(() => props.data, (newData) => {
  form.value = {
    url: newData.url || '',
    presignedUrl: newData.presignedUrl || '',
    external: newData.external || false
  }
  previewURL.value = newData.presignedUrl || null
}, { deep: true })

function handleFileUploaded(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    file.value = target.files[0]
    previewURL.value = URL.createObjectURL(target.files[0])
    updateForm()
  }
}

function triggerFileUpload(event: Event) {
  event.preventDefault()
  fileInputRef.value?.click()
}

function updateForm() {
  emit("update", {
    data: { ...form.value },
    file: file.value
  })
}

function updateExternal(checked: boolean) {
  form.value.external = checked
  updateForm()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h3 class="text-sm font-semibold">Add an image</h3>
    <div class="flex flex-col gap-2">
      <Label :for="`${fieldId}-file`">Image</Label>
      <input :id="`${fieldId}-file`" ref="fileInputRef" type="file" accept="image/*" style="display: none" @change="handleFileUploaded" />
      <div v-if="previewURL" class="flex flex-col items-center gap-2">
        <img :src="previewURL" alt="Selected image preview" class="h-16 w-auto" />
        <Button variant="outline" size="sm" @click="triggerFileUpload">
          Change image
        </Button>
      </div>
      <button v-else variant="outline" class="block-editor-modal__dropzone flex items-center justify-center [border:1px_dashed_var(--dv-color-line,_#929292)] [color:var(--dv-text-secondary,_#929292)] [height:60px] w-full" @click="triggerFileUpload" type="button">
        Click here to select a file
      </button>
    </div>
    <FieldGroup>
      <Label :for="`${fieldId}-url`">URL (optional)</Label>
      <Input :id="`${fieldId}-url`" v-model="form.url" type="url" @input="updateForm" />
    </FieldGroup>
    <div v-if="form.url" class="flex items-center space-x-2">
      <Checkbox :id="`${fieldId}-external`" :model-value="form.external" @update:model-value="updateExternal($event === true)" />
      <Label :for="`${fieldId}-external`">Open in new tab</Label>
    </div>
  </div>
</template>
