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
import { QuillEditor } from "@vueup/vue-quill"
import "@vueup/vue-quill/dist/vue-quill.snow.css"
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  data: any
}>()

const emit = defineEmits<{
  (e: "update", value: any): void
}>()

const content = ref('')

onMounted(() => {
  if (typeof props.data === 'string') {
    content.value = props.data
  } else if (props.data && props.data.content) {
    content.value = props.data.content
  }
})

watch(() => props.data, (newData) => {
  if (typeof newData === 'string') {
    content.value = newData
  } else if (newData && newData.content) {
    content.value = newData.content
  } else {
    content.value = ''
  }
}, { deep: true })

function updateContent(newContent: string) {
  emit("update", newContent)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <h1 class="text-lg font-medium mb-4">Add text content</h1>
    <div class="flex-grow overflow-hidden flex flex-col">
      <QuillEditor v-model:content="content" theme="snow" toolbar="essential" placeholder="..." content-type="html"
        @update:content="updateContent" class="flex-grow flex flex-col" />
    </div>
  </div>
</template>

<style scoped>
.flex-grow {
  display: flex;
  flex-direction: column;
}

.flex-grow :deep(.ql-container) {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.flex-grow :deep(.ql-editor) {
  flex: 1;
  overflow: auto;
}
</style>
