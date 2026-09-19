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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ref, useId, watch } from 'vue'

const props = defineProps<{
  data: {
    presignedUrl?: string
    url?: string
  }
}>()

const emit = defineEmits<{
  (e: 'update', data: { data: { presignedUrl?: string, url?: string }, file?: File | null }): void
}>()

const fieldId = useId()
const fileInputRef = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const previewURL = ref<string | null>(null)
const externalUrl = ref('')

watch(() => props.data, (newData) => {
  previewURL.value = newData.presignedUrl || null
  externalUrl.value = newData.url || ''
}, { immediate: true })

function handleFileUploaded(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    file.value = target.files[0]
    previewURL.value = URL.createObjectURL(file.value)
    emitUpdate()
  }
}

function triggerFileUpload() {
  fileInputRef.value?.click()
}

function emitUpdate() {
  emit('update', {
    data: {
      presignedUrl: previewURL.value || undefined,
      url: externalUrl.value || undefined,
    },
    file: file.value
  })
}

function updateExternalUrl() {
  emitUpdate()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h3 class="text-sm font-semibold">Add a video</h3>
    <input ref="fileInputRef" type="file" accept="video/*" aria-label="Video file" style="display: none" @change="handleFileUploaded" />
    <video v-if="previewURL" :src="previewURL" class="w-full" controls></video>
    <button v-else type="button" class="block-editor-modal__dropzone flex items-center justify-center [border:1px_dashed_var(--dv-color-line,_#929292)] [color:var(--dv-text-secondary,_#929292)] [height:60px] w-full" @click="triggerFileUpload">
      Click here to select a file
    </button>
    <div class="mt-1 flex items-center gap-2">
      <Button type="button" @click="triggerFileUpload">
        {{ previewURL ? 'Change file' : 'Upload file' }}
      </Button>
    </div>
    <FieldGroup>
      <Label :for="`${fieldId}-url`">External Video URL (optional)</Label>
      <Input :id="`${fieldId}-url`" v-model="externalUrl" type="url" placeholder="https://example.com/video.mp4"
        @input="updateExternalUrl" />
    </FieldGroup>
  </div>
</template>
