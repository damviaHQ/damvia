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
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button/index.js"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useDownloadStore } from "@/stores/downloadStore"
import { useGlobalStore } from "@/stores/globalStore"
import { getFileExtension } from "@/utils/fileExtention"
import { formatFileSize } from "@/utils/fileSize"
import { useQueryClient } from "@tanstack/vue-query"
import { Copyright, FileStack, X } from "lucide-vue-next"
import { computed, ref, watch, watchEffect } from "vue"

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: "update:modelValue", isOpen: boolean): void }>()
const { startRefetch } = useDownloadStore()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const globalStore = useGlobalStore()
const hasTermsError = ref(false)
const isLoading = ref(false)
const res = ref<RouterOutput["collection"]["getFiles"] | null>(null)
const form = ref<{
  imageFormat: "png" | "jpg" | "webp" | "original"
  imageResolution: "high" | "medium" | "low"
  videoFormat: "mp4" | "webm" | "original"
  videoResolution: "high" | "medium" | "low"
  downloadType: "email" | "direct"
  isAcceptingTerms: boolean
}>({
  imageFormat: "original",
  imageResolution: "medium",
  videoFormat: "original",
  videoResolution: "medium",
  downloadType: "direct",
  isAcceptingTerms: false,
})

const imageCount = computed(
  () =>
    (res.value?.files ?? []).filter((file) => file.mimeType.startsWith("image/")).length
)
const allowImageCompression = computed(() => imageCount.value <= 300)
const disallowDirectDownload = computed(() => {
  // Disallow direct download if the file size is greater than 5GB or if the file count exceeds 300
  const FIVE_GB_IN_BYTES = 5 * 1024 * 1024 * 1024
  const sizeInBytes =
    res.value?.files.reduce((total, file) => total + Number(file.size), 0) || 0
  return imageCount.value > 300 || sizeInBytes > FIVE_GB_IN_BYTES
})
const totalSize = computed(() => {
  const sizeInBytes =
    res.value?.files.reduce((total, file) => total + Number(file.size), 0) || 0
  return formatFileSize(sizeInBytes)
})

watch([() => globalStore.selection, () => props.modelValue], () => {
  if (!props.modelValue) {
    res.value = null
    return
  }

  trpc.collection.getFiles
    .mutate({ items: globalStore.selection })
    .then((data) => {
      res.value = data
      form.value.downloadType = data.allowDirectDownload ? "direct" : "email"
    })
    .catch((error) => toast.error((error as Error).message))
})

watchEffect(() => {
  // Force original format if image compression is disabled
  if (!allowImageCompression.value && form.value.imageFormat !== "original") {
    form.value.imageFormat = "original"
  }
  if (disallowDirectDownload.value) {
    form.value.downloadType = "email"
  }
})

watchEffect(() => {
  if (disallowDirectDownload.value) {
    form.value.downloadType = "email"
  }
})

watchEffect(() => {
  form.value.isAcceptingTerms
  hasTermsError.value = false
})

function download() {
  if (!form.value.isAcceptingTerms) {
    toast.error("Please accept the terms and conditions to proceed with the download.")
    isLoading.value = false
    hasTermsError.value = true
    return
  }

  isLoading.value = true
  hasTermsError.value = false
  trpc.download.create
    .mutate({
      ...form.value,
      collectionFileIds: res.value?.files.map((file) => file.id),
    } as any)
    .then((res) => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] })
      emit("update:modelValue", false)
      if (res.url) {
        window.open(res.url, "_blank")
        return
      }
      toast.success(
        "You will receive a download link by email when your download is ready."
      )
      startRefetch()
    })
    .catch((error) => toast.error((error as Error).message))
    .finally(() => {
      isLoading.value = false
    })
}

function onImageLoad(event: Event) {
  if (
    event.target &&
    event.target instanceof HTMLImageElement &&
    event.target.parentElement
  ) {
    event.target.parentElement.style.maxWidth = `${event.target.clientWidth}px`
  }
}

function removeFromSelection(file: { id: string }) {
  if (!res.value) {
    return
  }

  globalStore.setSelection(
    res.value.files
      .filter((current) => current.id !== file.id)
      .map((file) => ({ type: "file", id: file.id }))
  )
}
</script>

<template>
  <div v-if="modelValue" class="bg-neutral-800 fixed top-0 left-0 w-full h-full z-20 py-5 px-8 text-neutral-200">
    <div class="modal__header flex justify-between items-center mb-4">
      <div class="flex items-center gap-2">
        <FileStack />
        <div class="text-xl font-medium">Selected files</div>
      </div>
      <Button variant="ghost" size="icon" type="button"
        class="text-neutral-200 hover:text-neutral-300 bg-transparent hover:bg-neutral-700"
        @click="$emit('update:modelValue', false)">
        <X strokeWidth="3" />
      </Button>
    </div>
    <div v-if="res" class="modal__content flex flex-wrap overflow-x-hidden">
      <div class="modal__content-left flex-1 pr-4 items-start overflow-y-auto h-[calc(100vh-90px)]">
        <div class="file-grid">
          <div v-for="file in res.files" :key="file.id" class="file-item">
            <div class="relative flex flex-col items-center max-w-[20%] min-w-[190px] p-1 bg-neutral-700">
              <div @click="removeFromSelection(file)" class="download-assets-modal__unselect-item">
                <X class="w-4 h-4" />
              </div>
              <img v-if="file.thumbnailURL" v-lazy="file.thumbnailURL" :alt="file.name"
                class="w-full h-[150px] object-contain justify-self-start items-start p-2" @load="onImageLoad" />
              <thumbnailPlaceholder v-else :alt="file.name" @load="onImageLoad" class="fill-neutral-200 h-[150px]" />
            </div>
            <div class="w-full flex flex-col gap-1 max-w-full p-1 overflow-hidden text-ellipsis whitespace-nowrap">
              <div class="w-full text-sm text-neutral-200 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                {{ file.name }}
              </div>
              <div class="text-xs text-neutral-400">
                {{ getFileExtension(file.name) }} - {{ formatFileSize(file.size) }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        class="modal__content-right flex flex-col gap-5 px-4 pl-6 flex-[0_0_320px] h-[calc(100vh-90px)] w-full border-l border-neutral-700 overflow-y-auto">
        <div v-if="imageCount && allowImageCompression">
          <div class="font-medium mb-4 text-lg">Choose an Image format</div>
          <RadioGroup v-model="form.imageFormat">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                { name: 'Original (HD)', value: 'original' },
                { name: 'PNG', value: 'png' },
                { name: 'JPG', value: 'jpg' },
                { name: 'WEBP', value: 'webp' },
              ]" :key="option.value" class="flex items-center space-x-2">
                <RadioGroupItem :value="option.value" :id="`image-format-${option.value}`"
                  class="border border-amber-400 text-amber-400 min-w-max" />
                <Label :for="`image-format-${option.value}`">{{ option.name }}</Label>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div v-else-if="imageCount">
          <div class="font-medium mb-4 text-lg">Choose Image format</div>
          <RadioGroup v-model="form.imageFormat">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                { name: 'Original (HD)', value: 'original' },
                { name: 'PNG', value: 'png', disabled: true },
                { name: 'JPG', value: 'jpg', disabled: true },
                { name: 'WEBP', value: 'webp', disabled: true },
              ]" :key="option.value" class="flex items-center space-x-2">
                <RadioGroupItem :value="option.value" :id="`image-format-${option.value}`" :disabled="option.disabled"
                  class="border border-amber-400 text-amber-400 min-w-max" />
                <Label :for="`image-format-${option.value}`">{{ option.name }}</Label>
              </div>
            </div>
          </RadioGroup>
          <p class="warning">Compression is disabled if you download over 300 images.</p>
        </div>
        <div v-if="imageCount && form.imageFormat !== 'original'">
          <div class="font-medium mb-4 text-lg">Image quality</div>
          <RadioGroup v-model="form.imageResolution">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                {
                  name: 'High Quality (best)',
                  value: 'high',
                  description: 'Recommended usage: Print',
                },
                {
                  name: 'Medium Quality',
                  value: 'medium',
                  description: 'Recommended usage: Digital',
                },
                {
                  name: 'Small Quality (smaller file)',
                  value: 'low',
                  description: 'Recommended usage: Digital',
                },
              ]" :key="option.value" class="flex items-center space-x-2">
                <RadioGroupItem :value="option.value" :id="`image-quality-${option.value}`"
                  class="border border-amber-400 text-amber-400 min-w-max" />
                <div>
                  <Label :for="`image-quality-${option.value}`">{{ option.name }}</Label>
                  <p class="text-sm text-neutral-400">{{ option.description }}</p>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div>
          <div class="font-medium mb-4 text-lg">Download type</div>
          <RadioGroup v-model="form.downloadType">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                {
                  name: 'Direct download',
                  value: 'direct',
                  description: 'Download starts right after the zip is ready.',
                  disabled: !res.allowDirectDownload || disallowDirectDownload,
                },
                {
                  name: 'Create a link',
                  value: 'email',
                  description:
                    'A zip is saved for 7 days in My Downloads. You will receive an email with the link when ready.',
                },
              ]" :key="option.value" class="flex items-center space-x-2">
                <RadioGroupItem :value="option.value" :id="`download-type-${option.value}`" :disabled="option.disabled"
                  class="border border-amber-400 text-amber-400 min-w-max" />
                <div>
                  <Label :for="`download-type-${option.value}`">{{ option.name }}</Label>
                  <p class="text-sm text-neutral-400">{{ option.description }}</p>
                </div>
              </div>
            </div>
          </RadioGroup>
          <p v-if="disallowDirectDownload" class="warning">
            Direct download is disabled for files larger than 5GB or if the file count
            exceeds 300.
          </p>
        </div>
        <div>
          <div>
            <div class="font-medium mb-4 text-lg">Usage Licensing Agreement</div>
            <div class="flex-col gap-1">
              <div v-if="res.licenses.length > 0" class="flex-col gap-1"></div>
              <div v-for="license in res.licenses" :key="license.id" class="flex items-center text-neutral-300">
                <Copyright class="w-4 h-4 mr-4 text-neutral-50" />
                <div class="flex flex-col">
                  <div class="text-sm mb-1 text-neutral-200">
                    {{ license.name }}
                  </div>
                  <div class="text-neutral-300 text-xs">
                    {{ license.scopes.map((scope) => scope.toUpperCase()).join(", ") }}
                  </div>
                </div>
              </div>
              <div class="flex items-center py-6 gap-4">
                <Checkbox id="terms" v-model:checked="form.isAcceptingTerms"
                  class="border-amber-400 [&>*]:bg-amber-400 [&>*]:text-neutral-800"
                  :class="{ 'border-red-500': hasTermsError }" />
                <Label for="terms" class="text-sm leading-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  :class="{
                    'text-red-500': hasTermsError,
                    'text-amber-400': !hasTermsError && form.isAcceptingTerms,
                  }">
                  By downloading these assets, I hereby agree to respect the Asset Usage
                  Licensing Agreement.
                </Label>
              </div>
            </div>
          </div>
        </div>
        <div>
          <Button @click="download" :disabled="isLoading"
            class="w-full text-neutral-800 ring-amber-400 hover:text-neutral-900 hover:bg-amber-500 hover:ring-amber-400 bg-amber-400"
            :class="{
              'ring ring-neutral-200 bg-neutral-800 text-neutral-200 hover:ring-amber-400 hover:text-amber-400 hover:bg-neutral-800': !form.isAcceptingTerms,
            }">
            {{ isLoading ? "Preparing files..." : "Download" }}
          </Button>
          <div :class="{ '!text-neutral-200': !form.isAcceptingTerms }" class="text-sm text-amber-400 mt-2">
            Total Size: {{ totalSize }}
          </div>
        </div>
      </div>
    </div>
    <div v-else>
      <Loader :text="true" />
    </div>
  </div>
</template>

<style scoped>
.download-assets-modal__header-icon {
  width: 2rem;
  height: 2rem;
  stroke-width: 2px;
  margin-right: 0.5rem;
}

.download-assets-modal__header-close {
  background: transparent;
  cursor: pointer;
  border: none;
}

.download-assets-modal__header-close svg {
  width: 2rem;
  height: 2rem;
  stroke-width: 2px;
  color: #fff;
}

.download-assets-modal__download-button {
  padding: 0.75rem 2rem;
  width: 100%;
  display: block;
  border: none;
  color: var(--primary-color15);
  font-weight: 600;
  font-size: 16px;
  background: var(--accent-color);
  cursor: pointer;
}

.download-assets-modal__download-button:hover {
  background: var(--accent-color);
}

.download-assets-modal__download-button[disabled] {
  pointer-events: none;
  opacity: 50%;
}

.warning {
  color: #ff5e5e;
  font-size: 14px;
  margin-top: 0.5rem;
}

.download-assets-modal__unselect-item {
  cursor: pointer;
  display: flex;
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  padding: 0;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.5rem;
}

.file-item {
  width: 100%;
  min-width: 0;
}
</style>
