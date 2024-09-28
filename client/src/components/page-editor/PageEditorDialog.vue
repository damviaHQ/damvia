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
import BlockCollections from '@/components/page-editor/blocks/BlockCollections.vue'
import BlockFiles from '@/components/page-editor/blocks/BlockFiles.vue'
import BlockImage from '@/components/page-editor/blocks/BlockImage.vue'
import BlockLastFiles from '@/components/page-editor/blocks/BlockLastFiles.vue'
import BlockText from '@/components/page-editor/blocks/BlockText.vue'
import BlockVideo from '@/components/page-editor/blocks/BlockVideo.vue'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useGlobalToast } from "@/composables/useGlobalToast"
import type { Block, BlockType, Collection, Page } from "@/layouts/LayoutPageEditor.vue"
import { trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import "@vueup/vue-quill/dist/vue-quill.snow.css"
import { Clock, Files, FileText, Image, LayoutGrid, Video } from 'lucide-vue-next'
import { ref, watch } from 'vue'

type BlockListType =
  | "collections"
  | "files"
  | "text"
  | "image"
  | "video"
  | "last_files"
type BlockData = {
  layout?: string
  title?: string
  collectionsId?: string[]
  collectionId?: string
  content?: string
  url?: string
  presignedUrl?: string
  external?: boolean
}

const props = defineProps<{
  modelValue: boolean
  page: Page
  collection?: Collection
  block?: Block
  maxRowValue?: number
}>()
const emit = defineEmits<{
  (e: "update:modelValue", isOpen: boolean): void;
  (e: "saved", block: Block): void
}>()
const form = ref<{ type?: BlockType; data: BlockData }>({
  type: undefined,
  data: {
    layout: 'user_preferences',
    title: '',
    collectionsId: [],
  }
})
const toast = useGlobalToast()
const blockList: Array<{
  type: BlockListType
  name: string
  icon: typeof LayoutGrid
  description: string
}> = [
    { type: 'collections', name: 'Collections', icon: LayoutGrid, description: 'List sub-collections or custom selection' },
    { type: 'files', name: 'Files', icon: Files, description: 'Display all files in a collection' },
    { type: 'last_files', name: 'Last Files', icon: Clock, description: 'Show recently created files' },
    { type: 'text', name: 'Text', icon: FileText, description: 'Add titles or paragraphs' },
    { type: 'image', name: 'Image', icon: Image, description: 'Add banners or decorative images' },
    { type: 'video', name: 'Video', icon: Video, description: 'Embed videos in your collection' },
  ]
const queryClient = useQueryClient()
const fileToUpload = ref<File | null>(null)
const isSaving = ref(false)

const resetForm = () => {
  form.value = {
    type: undefined,
    data: {
      layout: 'user_preferences',
      title: '',
      collectionsId: [],
    }
  }
}

const selectBlock = (type: BlockListType) => {
  if (props.block) return
  resetForm()
  form.value.type = type
}

const updateFormData = (data: { data: BlockData, file?: File | null }) => {
  form.value.data = JSON.parse(JSON.stringify(data.data)) // Deep clone to ensure reactivity
  if (data.file) {
    fileToUpload.value = data.file
    if (typeof form.value.data === 'object' && 'presignedUrl' in form.value.data) {
      form.value.data.presignedUrl = URL.createObjectURL(data.file)
    }
  }
}

watch(() => props.block, (newBlock) => {
  if (newBlock) {
    form.value = {
      type: newBlock.type,
      data: JSON.parse(JSON.stringify(newBlock.data)) // Deep clone to ensure reactivity
    }
  } else {
    form.value = {
      type: undefined,
      data: {
        layout: undefined,
        title: undefined,
        collectionsId: undefined,
      }
    }
  }
}, { immediate: true })

watch(() => props.modelValue, (newValue) => {
  if (!newValue) {
    resetForm()
  }
})

async function uploadFile(blockId: string) {
  if (!fileToUpload.value) {
    return
  }

  const uploadUrl = await trpc.page.presignedUploadUrl.query({
    pageId: props.page.id,
    blockId,
  })
  await fetch(uploadUrl, {
    method: "PUT",
    body: fileToUpload.value,
    headers: {
      "Content-Type": fileToUpload.value.type,
    },
  })
  fileToUpload.value = null
}

async function save() {
  if (isSaving.value) return
  isSaving.value = true

  try {
    let updatedBlock
    if (props.block) {
      updatedBlock = await trpc.page.updateBlockData.mutate({
        pageId: props.page.id,
        blockId: props.block.id,
        data: form.value.data,
      })
    } else {
      updatedBlock = await trpc.page.addBlock.mutate({
        pageId: props.page.id,
        type: form.value.type as any,
        data: form.value.data,
        column: 1,
        width: 100,
        row: props.maxRowValue !== undefined ? props.maxRowValue + 1 : 0,
      })
    }

    if (fileToUpload.value) {
      await uploadFile(updatedBlock.id)
    }

    if (props.collection) {
      await queryClient.invalidateQueries({
        queryKey: ["collection", props.collection.id],
      })
    }
    toast.success('Your block has been saved')
    await queryClient.invalidateQueries({ queryKey: ["pages", props.page.id] })
    emit("update:modelValue", false)
  } catch (error) {
    console.error("Error saving block:", error)
  } finally {
    isSaving.value = false
  }
}

</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[900px] p-0 flex flex-col max-h-[90vh]">
      <div class="flex flex-grow min-h-0">
        <!-- Sidebar with block types -->
        <div class="w-1/3 border-r overflow-y-auto">
          <h2 class="text-lg font-semibold p-4 border-b">Choose a block type</h2>
          <div class="p-2">
            <button v-for="block in blockList" :key="block.type" type="button"
              class="w-full flex items-center p-2 rounded-lg transition-colors mb-2" :class="{
                'bg-gray-100': form.type === block.type,
                'hover:bg-gray-100': !props.block,
                'opacity-50 cursor-not-allowed': !!props.block
              }" @click="selectBlock(block.type)" :disabled="!!props.block">
              <component :is="block.icon" class="w-6 h-6 mr-3 text-primary" />
              <div class="text-left">
                <h3 class="font-medium text-sm">{{ block.name }}</h3>
                <p class="text-xs text-gray-500">{{ block.description }}</p>
              </div>
            </button>
          </div>
        </div>

        <!-- Selected block content -->
        <div class="w-2/3 flex flex-col min-h-0">
          <form @submit.prevent="save" class="flex flex-col h-full">
            <div v-if="!form.type" class="flex flex-col items-center justify-center flex-grow">
              <h2 class="text-lg font-medium">Select a block type</h2>
              <p class="text-gray-500">Select the type of content you want to add from the left sidebar to begin.</p>
            </div>

            <template v-else>
              <div class="flex-grow overflow-auto p-6">
                <BlockCollections v-if="form.type === 'collections'" :data="form.data" @update="updateFormData"
                  class="max-h-full" />
                <BlockFiles v-else-if="form.type === 'files'" :data="form.data" @update="updateFormData"
                  class="max-h-full" />
                <BlockLastFiles v-else-if="form.type === 'last_files'" :data="form.data" @update="updateFormData"
                  class="max-h-full" />
                <BlockImage v-else-if="form.type === 'image'" :data="form.data" @update="updateFormData"
                  class="max-h-full" />
                <BlockText v-else-if="form.type === 'text'" :data="form.data"
                  @update="(newContent) => form.data = newContent" class="h-full" />
                <BlockVideo v-else-if="form.type === 'video'" :data="form.data" @update="updateFormData"
                  class="max-h-full" />
              </div>

              <div class="flex justify-end p-4">
                <Button type="button" variant="outline" class="mr-2" @click="emit('update:modelValue', false)">
                  Cancel
                </Button>
                <Button type="submit" :disabled="isSaving">
                  {{ isSaving ? 'Saving...' : 'Save' }}
                </Button>
              </div>
            </template>
          </form>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.block-editor-modal__dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #929292;
  color: #929292;
  height: 60px;
  width: 100%;
}
</style>
