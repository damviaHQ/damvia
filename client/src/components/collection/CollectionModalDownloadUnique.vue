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
import { Button } from "@/components/ui/button/index.js"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { formatFileSize } from "@/utils/fileSize"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import {
  ChevronLeft,
  ChevronRight,
  Copyright,
  SquareArrowLeft,
  SquareArrowRight,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-vue-next"
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from "vue"

type File = RouterOutput["collection"]["findById"]["files"][number]
type Props = {
  files?: File[]
  collection?: RouterOutput["collection"]["findById"]
  modelValue: string | null
}

const emit = defineEmits<{
  (e: "update:modelValue", currentCollectionId: string | null): void
}>()
const toast = useGlobalToast()
const props = defineProps<Props>()
const globalStore = useGlobalStore()
const queryClient = useQueryClient()
const hasTermsError = ref(false)
const isLoading = ref(false)
const haveAccessToFavorites = globalStore.user?.role !== "guest"
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
const { data: favorites } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => trpc.favorite.list.query(),
})

const removable = computed(() => props.collection?.canEdit && !props.collection.synchronized)
const files = computed(() => props.files ?? props.collection?.files)
const currentFile = computed<File>(() => files.value?.find((file: File) => file.id === props.modelValue))
const allowDirectDownload = computed(() => { return !currentFile.value || parseInt(currentFile.value.size, 10) <= 5_000_000_000 })

watch(
  [allowDirectDownload],
  () => {
    if (!allowDirectDownload.value) {
      form.value.downloadType = "email"
    } else {
      form.value.downloadType = "direct"
    }
  },
  { immediate: true }
)

watchEffect(() => {
  form.value.isAcceptingTerms
  hasTermsError.value = false
})

function isFavorite(file: File) {
  return favorites.value?.some((favorite) => favorite.id === file.id)
}

async function addToFavorite(file: File) {
  try {
    await trpc.favorite.add.mutate({ collectionFileId: file.id })
    await queryClient.invalidateQueries({ queryKey: ["favorites"] })
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function removeFromFavorite(file: File) {
  try {
    await trpc.favorite.remove.mutate({ collectionFileId: file.id })
    await queryClient.invalidateQueries({ queryKey: ["favorites"] })
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function remove(file: File) {
  if (!removable) {
    return
  }

  try {
    if (!confirm("Are you sure to remove this file from the collection?")) {
      return
    }

    await trpc.collection.removeFiles.mutate([file.id])
    await queryClient.setQueryData(
      ["collection", props.collection.id],
      (collection: RouterOutput["collection"]["findById"]) => {
        if (!collection?.files) {
          return collection
        }

        return {
          ...collection,
          files: collection.files.filter((current: File) => current.id !== file.id),
        }
      }
    )
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function download() {
  if (!form.value.isAcceptingTerms) {
    toast.error("Please accept the terms and conditions to proceed with the download.")
    isLoading.value = false
    hasTermsError.value = true
    return
  }

  isLoading.value = true
  hasTermsError.value = false
  try {
    const downloadRes = await trpc.download.create.mutate({
      ...form.value,
      collectionFileIds: [currentFile.value.id],
    } as any)
    await queryClient.invalidateQueries({ queryKey: ["downloads"] })
    if (downloadRes.url) {
      window.open(downloadRes.url, "_blank")
      emit("update:modelValue", null)
      return
    }
    toast.success("You will receive a download link through email.")
    emit("update:modelValue", null)
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    isLoading.value = false
  }
}

function changeFile(addToIndex: number) {
  const fileIndex = files.value.indexOf(currentFile.value)
  let newIndex = fileIndex + addToIndex
  if (newIndex < 0) {
    newIndex = files.value.length - 1
  } else if (newIndex >= files.value.length) {
    newIndex = 0
  }
  emit("update:modelValue", files.value[newIndex].id)
}

function truncateFileName(name: string, maxLength: number = 60) {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength - 3) + "..."
}

const modalRef = ref<HTMLElement | null>(null)

function handleKeyDown(event: KeyboardEvent) {
  // Check if the modal is open
  if (modalRef.value && currentFile.value) {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      changeFile(-1)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      changeFile(1)
    }
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown)
})

// Focus the modal when it opens
watch(() => props.modelValue, (newValue) => {
  if (newValue && modalRef.value) {
    nextTick(() => {
      modalRef.value?.focus()
    })
  }
})
</script>

<template>
  <div v-if="currentFile" ref="modalRef" tabindex="-1"
    class="bg-neutral-800 fixed top-0 left-0 w-full h-full z-20 py-5 px-8 text-neutral-200 outline-none">
    <div class="gallery-modal__header">
      <div class="flex items-center gap-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div class="text-xl font-medium">
                {{ truncateFileName(currentFile.name) }}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ currentFile.name }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div class="flex items-center gap-6">
          <template v-if="haveAccessToFavorites">
            <button v-if="isFavorite(currentFile)" @click="removeFromFavorite(currentFile)" type="button"
              class="relative ml-4">
              <Star class="w-5 h-5 text-neutral-200 fill-neutral-200" />
              <StarOff
                class="w-5 h-5 text-neutral-200 absolute inset-0 opacity-0 hover:opacity-100 transition-opacity fill-neutral-800 bg-neutral-800" />
            </button>
            <button v-else @click="addToFavorite(currentFile)" type="button" class="block">
              <Star class="w-5 h-5 text-neutral-200 hover:fill-neutral-200" />
            </button>
          </template>
          <button v-if="removable" @click="remove(currentFile)" type="button">
            <Trash2 class="w-5 h-5 text-neutral-200 hover:text-neutral-400" />
          </button>
        </div>
      </div>
      <Button variant="ghost" size="icon" type="button"
        class="text-neutral-200 hover:text-neutral-300 bg-transparent hover:bg-neutral-700"
        @click="$emit('update:modelValue', null)">
        <X strokeWidth="3" />
      </Button>
    </div>
    <div class="flex">
      <div class="gallery-modal__preview">
        <div v-if="files.length > 1" class="gallery-modal__navigation">
          <div class="gallery-modal__previous-file" @click="changeFile(-1)">
            <ChevronLeft strokeWidth="3" class="w-10 h-10" />
          </div>
          <div class="gallery-modal__next-file" @click="changeFile(1)">
            <ChevronRight strokeWidth="3" class="w-10 h-10" />
          </div>
          <div class="gallery-modal__key-info">
            <SquareArrowLeft class="w-4 h-4" />
            <SquareArrowRight class="w-4 h-4" />
            <span class="ml-2">Use keyboard to navigate</span>
          </div>
        </div>
        <div class="gallery-modal__preview-thumbnail-container">
          <video v-if="currentFile.mimeType.startsWith('video/')" :src="currentFile.fileURL" controls
            class="gallery-modal__preview-thumbnail" />
          <img v-else-if="currentFile.mimeType.startsWith('image/')" :src="currentFile.thumbnailURL"
            :alt="currentFile.name" class="gallery-modal__preview-thumbnail" />
          <thumbnail-placeholder v-else :alt="currentFile.name" class="gallery-modal__preview-thumbnail" />
        </div>
      </div>
      <div class="gallery-modal__download-container">
        <div v-if="currentFile.mimeType.startsWith('image/')">
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
        <div v-if="
          currentFile.mimeType.startsWith('image/') && form.imageFormat !== 'original'
        ">
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
                  description: 'Download directly on your computer.',
                  disabled: !allowDirectDownload,
                },
                {
                  name: 'Create a link',
                  value: 'email',
                  description:
                    'A link to the file is sent to your email and saved in My Downloads for 7 days.',
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
        </div>
        <div>
          <div class="font-medium mb-4 text-lg">Usage Licensing Agreement</div>
          <div class="flex-col gap-1">
            <div v-if="currentFile.license" class="flex items-center text-neutral-300">
              <Copyright class="w-4 h-4 mr-4 text-neutral-50" />
              <div>
                <div class="text-sm mb-1 text-neutral-200">
                  {{ currentFile.license.name }}
                </div>
                <div class="text-neutral-300 text-xs">
                  {{
                    currentFile.license.scopes
                      .map((scope: string) => scope.toUpperCase())
                      .join(", ")
                  }}
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
                By downloading this asset, I hereby agree to respect the Asset Usage
                Licensing Agreement.
              </Label>
            </div>
          </div>
        </div>
        <div>
          <Button @click="download"
            class="w-full text-neutral-800 ring-amber-400 hover:text-neutral-900 hover:bg-amber-500 hover:ring-amber-400 bg-amber-400"
            :class="{
              'ring ring-neutral-200 bg-neutral-800 text-neutral-200 hover:ring-amber-400 hover:text-amber-400 hover:bg-neutral-800': !form.isAcceptingTerms,
            }" :disabled="isLoading">
            {{ isLoading ? "Preparing files..." : "Download" }}
          </Button>
          <div :class="{ '!text-neutral-200': !form.isAcceptingTerms }" class="text-sm text-amber-400 mt-2">
            Total Size: {{ formatFileSize(currentFile.size) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.icon-download {
  fill: var(--primary-color80);
  padding-top: 2px;
}

.gallery-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.gallery-modal__header-close {
  background: transparent;
  cursor: pointer;
  border: none;
}

.gallery-modal__header-close svg {
  width: 2rem;
  height: 2rem;
  stroke-width: 2px;
  color: #fff;
}

.gallery-modal__preview {
  position: relative;
  width: 100%;
}

.gallery-modal__navigation {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
  user-select: none;

  &:hover .gallery-modal__key-info {
    opacity: 1;
  }
}

.gallery-modal__previous-file,
.gallery-modal__next-file {
  pointer-events: auto;
  cursor: pointer;
  padding: 1rem;
}

.gallery-modal__previous-file {
  margin-right: auto;
}

.gallery-modal__next-file {
  margin-left: auto;
}

.gallery-modal__key-info {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.7);
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.3s ease;
  user-select: none;

  svg {
    margin-right: 0.25rem;
  }
}

.gallery-modal__preview-thumbnail-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 90px);
  width: 100%;
  margin: 0 auto;
}

.gallery-modal__preview-thumbnail {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
}

.gallery-modal__download-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 90px);
  width: 100%;
  gap: 2rem;
  max-width: 320px;
  border-left: 1px solid #454545;
  padding: 0.5rem 1rem;
  margin-left: 1rem;
}

.gallery-modal__download-option-name {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 1rem;
}

.gallery-modal__download-button {
  border-radius: var(--border-radius);
  padding: 0.75rem 2rem;
  width: 100%;
  display: block;
  border: none;
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  color: var(--primary-color15);
  background: var(--accent-color);
  cursor: pointer;
}

.gallery-modal__download-button:hover {
  background: var(--accent-color);
}

.gallery-modal__download-button[disabled] {
  pointer-events: none;
  opacity: 50%;
}

.gallery-modal__terms-container {
  display: flex;
  align-items: center;
  color: #9f9f9f;
  font-size: 14px;
  gap: 8px;
  color: var(--primary-color80);
}

.gallery-modal__terms {
  border: 2px solid var(--primary-color80);
  border-radius: var(--border-radius);
  width: 1.5rem;
  height: 1.5rem;
  min-width: 1.5rem;
  min-height: 1.5rem;
  cursor: pointer;
}

.gallery-modal__terms svg {
  display: none;
  width: 1.25rem;
  height: 1.25rem;
  stroke-width: 2px;
  color: var(--primary-color80);
  cursor: pointer;
}

.gallery-modal__terms--accepted {
  background: var(--primary-color);
}

.gallery-modal__terms--accepted,
.gallery-modal__terms--accepted svg {
  display: flex;
}

.gallery-modal__license {
  display: flex;
  align-items: center;
  color: var(--primary-color80);
}

.gallery-modal__license svg {
  margin-right: 16px;
}

.gallery-modal__license-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--primary-color80);
}

.gallery-modal__license-scope {
  color: var(--primary-color80);
  font-size: 11px;
}

.gallery-modal__size {
  font-size: 14px;
  color: var(--primary-color80);
  margin-top: 0.5em;
}

.gallery-modal__terms-container.error {
  color: var(--danger-color);
}
</style>
