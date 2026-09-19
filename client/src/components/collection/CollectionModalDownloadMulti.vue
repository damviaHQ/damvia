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
import {CircleHelpIcon, Copyright, FileStack, X} from "@lucide/vue"
import { computed, ref, watch, watchEffect } from "vue"
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger} from "@/components/ui/dialog";
import { FocusScope } from "reka-ui"

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

const hasLicenses = computed(() => {
  return res.value?.licenses && res.value.licenses.length > 0;
})

watch([() => globalStore.selection, () => props.modelValue], () => {
  if (!props.modelValue) {
    res.value = null

    form.value.isAcceptingTerms = false
    return
  }

  trpc.collection.getFiles
    .mutate({ items: globalStore.selection })
    .then((data) => {
      res.value = data
      form.value.downloadType = data.allowDirectDownload ? "direct" : "email"
      form.value.isAcceptingTerms = false
    })
    .catch((error) => toast.error((error as Error).message))
})

watchEffect(() => {
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
  if (hasLicenses.value) {
    hasTermsError.value = false;
  }
})

function download() {
  if (hasLicenses.value && !form.value.isAcceptingTerms) {
    toast.error("Please accept the terms and conditions to proceed with the download.")
    isLoading.value = false
    hasTermsError.value = true
    return
  }

  isLoading.value = true
  hasTermsError.value = false

  const formData = {
    ...form.value,
    isAcceptingTerms: hasLicenses.value ? form.value.isAcceptingTerms : true,
    collectionFileIds: res.value?.files.map((file) => file.id),
  };

  trpc.download.create
    .mutate(formData as any)
    .then((res) => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] })

      form.value.isAcceptingTerms = false

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
  <FocusScope v-if="modelValue" as="div" trapped loop role="dialog" aria-modal="true" aria-labelledby="selected-files-title"
    class="bg-white fixed top-0 left-0 w-full h-full z-30 py-5 px-7 text-neutral-800" @keydown.esc="$emit('update:modelValue', false)">
    <div class="modal__header flex justify-between items-center mb-4">
      <div class="flex items-center gap-2">
        <FileStack aria-hidden="true" />
        <h2 id="selected-files-title" class="text-[17px] font-semibold">Selected files</h2>
      </div>
      <Button aria-label="Close selected files" variant="ghost" size="icon" type="button"
        class="text-neutral-800 hover:text-neutral-600 bg-transparent hover:bg-neutral-100"
        @click="$emit('update:modelValue', false)">
        <X strokeWidth="3" />
      </Button>
    </div>
    <div v-if="res" class="modal__content flex flex-wrap overflow-x-hidden">
      <div class="modal__content-left flex-1 pr-4 items-start overflow-y-auto h-[calc(100vh-90px)]">
        <div class="file-grid grid [grid-template-columns:repeat(auto-fill,_minmax(190px,_1fr))] gap-2">
          <div v-for="file in res.files" :key="file.id" class="file-item w-full min-w-0">
            <div class="relative flex flex-col items-center max-w-[20%] min-w-[190px] p-1 border border-neutral-200 bg-neutral-50">
              <button type="button" :aria-label="`Remove ${file.name}`" @click="removeFromSelection(file)" class="download-assets-modal__unselect-item cursor-pointer flex absolute top-2 left-2 p-0">
                <X class="w-4 h-4" />
              </button>
              <img v-if="file.thumbnailURL" v-lazy="file.thumbnailURL" alt=""
                class="w-full h-[150px] object-contain justify-self-start items-start p-2" @load="onImageLoad" />
              <thumbnailPlaceholder v-else aria-hidden="true" @load="onImageLoad" class="fill-neutral-600 h-[150px]" />
            </div>
            <div class="w-full flex flex-col gap-1 max-w-full p-1 overflow-hidden text-ellipsis whitespace-nowrap">
              <div class="w-full text-sm text-neutral-800 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                {{ file.name }}
              </div>
              <div class="text-xs text-neutral-500">
                {{ getFileExtension(file.name) }} - {{ formatFileSize(file.size) }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        class="modal__content-right flex flex-col gap-5 px-4 pl-6 flex-[0_0_340px] h-[calc(100vh-90px)] w-full border-l border-neutral-200 overflow-y-auto">
        <div v-if="imageCount && allowImageCompression">
          <div class="mb-3 text-[13px] font-semibold">Choose an Image format</div>
          <RadioGroup v-model="form.imageFormat">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                { name: 'Original (HD)', value: 'original', disabled: false, tooltip: null },
                { name: 'PNG', value: 'png' },
                { name: 'JPG', value: 'jpg' },
                { name: 'WEBP', value: 'webp' },
              ]" :key="option.value" class="flex items-center space-x-2">
                <RadioGroupItem :value="option.value" :id="`image-format-${option.value}`"
                  class="border border-primary text-primary shrink-0" />
                <Label :for="`image-format-${option.value}`">{{ option.name }}</Label>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div v-else-if="imageCount">
          <div class="mb-3 text-[13px] font-semibold">Choose Image format</div>
          <RadioGroup v-model="form.imageFormat">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                { name: 'Original (HD)', value: 'original', disabled: false, tooltip: null },
                { name: 'PNG', value: 'png', disabled: true, tooltip: 'Compression is disabled for downloads with over 300 images' },
                { name: 'JPG', value: 'jpg', disabled: true, tooltip: 'Compression is disabled for downloads with over 300 images' },
                { name: 'WEBP', value: 'webp', disabled: true, tooltip: 'Compression is disabled for downloads with over 300 images' },
              ]" :key="option.value" class="flex items-center space-x-2 relative" :class="{ 'disabled-option opacity-50 cursor-not-allowed [&_>_*]:cursor-not-allowed [&_.tooltip]:block [&_.tooltip]:opacity-0 [&_.tooltip]:invisible [&_.tooltip]:[transition:opacity_0.3s,_visibility_0.3s] [&_.tooltip]:[transition-delay:0.5s] [&:hover_.tooltip]:opacity-100 [&:hover_.tooltip]:visible [&:focus-within_.tooltip]:opacity-100 [&:focus-within_.tooltip]:visible': option.disabled }">
                <RadioGroupItem :value="option.value" :id="`image-format-${option.value}`" :disabled="option.disabled"
                  :aria-describedby="option.disabled && option.tooltip ? `image-format-${option.value}-reason` : undefined"
                  class="border border-primary text-primary shrink-0" />
                <Label :for="`image-format-${option.value}`" :class="{ 'text-neutral-500': option.disabled }">
                  {{ option.name }}
                </Label>
                <div v-if="option.disabled && option.tooltip" :id="`image-format-${option.value}-reason`" class="tooltip absolute [background-color:#4b5563] [color:#e5e7eb] p-2 rounded-none [font-size:0.75rem] [max-width:250px] [z-index:50] [margin-top:-2.5rem] ml-6 [box-shadow:0_4px_6px_-1px_rgba(0,_0,_0,_0.1),_0_2px_4px_-1px_rgba(0,_0,_0,_0.06)]">{{ option.tooltip }}</div>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div v-if="imageCount && form.imageFormat !== 'original'">
          <div class="mb-3 text-[13px] font-semibold">Image quality</div>
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
                  class="border border-primary text-primary shrink-0" />
                <div>
                  <Label :for="`image-quality-${option.value}`">{{ option.name }}</Label>
                  <p class="text-sm text-neutral-500">{{ option.description }}</p>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div>
          <div class="mb-3 text-[13px] font-semibold">Download type</div>
          <RadioGroup v-model="form.downloadType">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                {
                  name: 'Direct download',
                  value: 'direct',
                  description: 'Download starts right after the zip is ready.',
                  disabled: !res.allowDirectDownload || disallowDirectDownload,
                  tooltip: disallowDirectDownload ? 'Direct download is disabled for files larger than 5GB or if the file count exceeds 300.' : null
                },
                {
                  name: 'Create a link',
                  value: 'email',
                  description:
                    'A zip is saved for 7 days in My Downloads. You will receive an email with the link when ready.',
                  disabled: false,
                  tooltip: null,
                },
              ]" :key="option.value" class="flex items-center space-x-2 relative" :class="{ 'disabled-option opacity-50 cursor-not-allowed [&_>_*]:cursor-not-allowed [&_.tooltip]:block [&_.tooltip]:opacity-0 [&_.tooltip]:invisible [&_.tooltip]:[transition:opacity_0.3s,_visibility_0.3s] [&_.tooltip]:[transition-delay:0.5s] [&:hover_.tooltip]:opacity-100 [&:hover_.tooltip]:visible [&:focus-within_.tooltip]:opacity-100 [&:focus-within_.tooltip]:visible': option.disabled }">
                <RadioGroupItem :value="option.value" :id="`download-type-${option.value}`" :disabled="option.disabled"
                  :aria-describedby="option.disabled && option.tooltip ? `download-type-${option.value}-reason` : undefined"
                  class="border border-primary text-primary shrink-0" />
                <div>
                  <Label :for="`download-type-${option.value}`" :class="{ 'text-neutral-500': option.disabled }">
                    {{ option.name }}
                  </Label>
                  <p class="text-sm" :class="option.disabled ? 'text-neutral-500' : 'text-neutral-500'">
                    {{ option.description }}
                  </p>
                </div>
                <div v-if="option.disabled && option.tooltip" :id="`download-type-${option.value}-reason`" class="tooltip absolute [background-color:#4b5563] [color:#e5e7eb] p-2 rounded-none [font-size:0.75rem] [max-width:250px] [z-index:50] [margin-top:-2.5rem] ml-6 [box-shadow:0_4px_6px_-1px_rgba(0,_0,_0,_0.1),_0_2px_4px_-1px_rgba(0,_0,_0,_0.06)]">{{ option.tooltip }}</div>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div v-if="hasLicenses">
          <div>
            <div class="mb-3 text-[13px] font-semibold">Usage Licensing Agreement</div>
            <div class="flex-col gap-1">
              <div v-if="res.licenses.length > 0" class="flex-col gap-1"></div>
              <div v-for="license in res.licenses" :key="license.id" class="flex items-center text-neutral-600">
                <Copyright class="w-4 h-4 mr-4 text-neutral-600" />
                <div class="flex flex-col">
                  <Dialog v-if="license.details">
                    <DialogTrigger as-child>
                      <button class="flex items-center text-sm mb-1 text-neutral-800">
                        {{ license.name }}
                        <CircleHelpIcon class="ml-2 h-4 w-4" />
                      </button>
                    </DialogTrigger>
                    <DialogContent class="sm:max-w-[640px] gap-5">
                      <DialogHeader><DialogTitle>{{ license.name }}</DialogTitle><DialogDescription>Usage terms</DialogDescription></DialogHeader>
                      <div class="text-sm leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" v-html="license.details" />
                    </DialogContent>
                  </Dialog>
                  <div v-else class="text-sm mb-1 text-neutral-800">
                    {{ license.name }}
                  </div>
                  <div class="text-neutral-600 text-xs">
                    {{ license.scopes.map((scope) => scope.toUpperCase()).join(", ") }}
                  </div>
                </div>
              </div>
              <div class="flex items-center py-6 gap-4">
                <Checkbox id="terms" v-model="form.isAcceptingTerms"
                  class="border-brand-text [&>*]:bg-brand [&>*]:text-brand-foreground"
                  :class="{ 'border-red-500': hasTermsError }" />
                <Label for="terms" class="leading-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  :class="{
                    'text-red-500': hasTermsError,
                    'text-brand-text': !hasTermsError && form.isAcceptingTerms,
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
            class="w-full bg-primary text-primary-foreground hover:bg-[var(--dv-action-hover)]"
            :class="{
              'ring ring-neutral-200 bg-white text-neutral-800 hover:ring-brand-text hover:text-brand-text hover:bg-white': hasLicenses && !form.isAcceptingTerms,
            }">
            {{ isLoading ? "Preparing files..." : "Download" }}
          </Button>
          <div class="mt-2 text-sm text-neutral-600">
            Total Size: {{ totalSize }}
          </div>
        </div>
      </div>
    </div>
    <div v-else>
      <Loader :text="true" />
    </div>
  </FocusScope>
</template>
