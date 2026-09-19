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
import PathBreadcrumb, { type PathBreadcrumbItem } from "@/components/navigation/PathBreadcrumb.vue"
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
  CircleHelpIcon,
} from "lucide-vue-next"
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from "vue"
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger} from "@/components/ui/dialog";
import { FocusScope } from "reka-ui"

type File = RouterOutput["collection"]["findById"]["files"][number]
type Collection = RouterOutput["collection"]["findById"]

type Props = {
  files?: File[]
  collection?: Collection
  modelValue: string | null
}

const emit = defineEmits<{
  (e: "update:modelValue", currentCollectionId: string | null): void
}>()
const toast = useGlobalToast()
const props = defineProps<Props>()
const viewedAt = new Map<string, number>()
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

const { data: fileCollection } = useQuery({
  queryKey: computed(() => ["file-collection", props.modelValue]),
  queryFn: () => currentFile.value?.collectionId ? trpc.collection.findById.query(currentFile.value.collectionId) : null,
  enabled: computed(() => !!currentFile.value && !props.collection && !!currentFile.value.collectionId)
})

const collectionPath = computed<Collection[]>(() => {
  const collection = fileCollection.value || props.collection
  if (!collection) {
    return []
  }
  const path = [collection]
  for (let current = collection.parent; current; current = current.parent) {
    path.push(current)
  }
  return path.reverse()
})

const hasThumbnail = computed(() => {
  if (!currentFile.value) return false
  return !!currentFile.value.thumbnailURL && currentFile.value.thumbnailURL !== ''
})

const isPdf = computed(() => {
  if (!currentFile.value) return false
  return currentFile.value.mimeType === 'application/pdf' ||
         currentFile.value.name.toLowerCase().endsWith('.pdf')
})

const isPsd = computed(() => {
  if (!currentFile.value) return false
  return currentFile.value.name.toLowerCase().endsWith('.psd') ||
         currentFile.value.mimeType === 'image/vnd.adobe.photoshop' ||
         currentFile.value.mimeType === 'application/photoshop' ||
         currentFile.value.mimeType === 'application/psd' ||
         currentFile.value.mimeType === 'image/psd'
})

const isVectorFile = computed(() => {
  if (!currentFile.value) return false
  return currentFile.value.name.toLowerCase().endsWith('.ai') ||
         currentFile.value.name.toLowerCase().endsWith('.eps') ||
         currentFile.value.mimeType === 'application/postscript' ||
         currentFile.value.mimeType === 'application/illustrator'
})

const isTextFile = computed(() => {
  if (!currentFile.value) return false
  const filename = currentFile.value.name.toLowerCase()
  return filename.endsWith('.txt') ||
         filename.endsWith('.md') ||
         filename.endsWith('.json') ||
         filename.endsWith('.xml') ||
         filename.endsWith('.html') ||
         filename.endsWith('.htm') ||
         filename.endsWith('.css') ||
         filename.endsWith('.js') ||
         filename.endsWith('.ts') ||
         filename.endsWith('.yaml') ||
         filename.endsWith('.yml') ||
         currentFile.value.mimeType === 'text/plain' ||
         currentFile.value.mimeType === 'text/markdown' ||
         currentFile.value.mimeType === 'application/json' ||
         currentFile.value.mimeType === 'text/xml' ||
         currentFile.value.mimeType === 'text/html' ||
         currentFile.value.mimeType === 'text/css' ||
         currentFile.value.mimeType === 'text/javascript' ||
         currentFile.value.mimeType === 'application/javascript' ||
         currentFile.value.mimeType === 'application/typescript' ||
         currentFile.value.mimeType === 'text/yaml'
})

const isFontFile = computed(() => {
  if (!currentFile.value) return false
  const filename = currentFile.value.name.toLowerCase()
  return filename.endsWith('.ttf') ||
         filename.endsWith('.otf') ||
         currentFile.value.mimeType === 'font/ttf' ||
         currentFile.value.mimeType === 'font/otf' ||
         currentFile.value.mimeType === 'application/x-font-ttf' ||
         currentFile.value.mimeType === 'application/x-font-otf' ||
         currentFile.value.mimeType === 'application/vnd.ms-fontobject'
})

const isVideoFile = computed(() => {
  if (!currentFile.value) return false
  const filename = currentFile.value.name.toLowerCase()
  return filename.endsWith('.mp4') ||
         filename.endsWith('.mov') ||
         filename.endsWith('.avi') ||
         filename.endsWith('.mkv') ||
         filename.endsWith('.wmv') ||
         filename.endsWith('.flv') ||
         filename.endsWith('.webm') ||
         filename.endsWith('.m4v') ||
         currentFile.value.mimeType.startsWith('video/')
})

const isPowerPoint = computed(() => {
  if (!currentFile.value) return false
  const filename = currentFile.value.name.toLowerCase()
  return filename.endsWith('.ppt') ||
         filename.endsWith('.pptx') ||
         filename.endsWith('.ppsx') ||
         filename.endsWith('.pps') ||
         filename.endsWith('.potx') ||
         filename.endsWith('.pot') ||
         currentFile.value.mimeType === 'application/vnd.ms-powerpoint' ||
         currentFile.value.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
         currentFile.value.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.slideshow'
})

const isWord = computed(() => {
  if (!currentFile.value) return false
  const filename = currentFile.value.name.toLowerCase()
  return filename.endsWith('.doc') ||
         filename.endsWith('.docx') ||
         filename.endsWith('.rtf') ||
         filename.endsWith('.odt') ||
         currentFile.value.mimeType === 'application/msword' ||
         currentFile.value.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
         currentFile.value.mimeType === 'application/rtf' ||
         currentFile.value.mimeType === 'application/vnd.oasis.opendocument.text'
})

const isExcel = computed(() => {
  if (!currentFile.value) return false
  const filename = currentFile.value.name.toLowerCase()
  return filename.endsWith('.xls') ||
         filename.endsWith('.xlsx') ||
         filename.endsWith('.csv') ||
         filename.endsWith('.ods') ||
         currentFile.value.mimeType === 'application/vnd.ms-excel' ||
         currentFile.value.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
         currentFile.value.mimeType === 'application/vnd.oasis.opendocument.spreadsheet'
})

const breadcrumbItems = computed<PathBreadcrumbItem[]>(() => collectionPath.value.map(item => ({
  id: item.id,
  label: item.name,
  to: { name: 'collection', params: { id: item.id } },
})))

const hasCollectionPath = computed(() => {
  const path = collectionPath.value
  return (props.collection || fileCollection.value) && path.length > 0
})

const hasLicense = computed(() => {
  return !!currentFile.value?.license;
})

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
  if (hasLicense.value) {
    hasTermsError.value = false;
  }
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
  if (hasLicense.value && !form.value.isAcceptingTerms) {
    toast.error("Please accept the terms and conditions to proceed with the download.")
    isLoading.value = false
    hasTermsError.value = true
    return
  }

  isLoading.value = true
  hasTermsError.value = false
  try {
    const formData = {
      ...form.value,
      isAcceptingTerms: hasLicense.value ? form.value.isAcceptingTerms : true,
      collectionFileIds: [currentFile.value.id],
    };

    const downloadRes = await trpc.download.create.mutate(formData as any)
    await queryClient.invalidateQueries({ queryKey: ["downloads"] })

    form.value.isAcceptingTerms = false

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

function handleKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || !currentFile.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('[role="dialog"]:not(.gallery-modal)')) return
  if (event.key === "Escape") {
    emit("update:modelValue", null)
    return
  }
  if (target?.closest('input, textarea, select, [role="radio"], [contenteditable="true"]')) return
  if (event.key === "ArrowLeft") {
    event.preventDefault()
    changeFile(-1)
  } else if (event.key === "ArrowRight") {
    event.preventDefault()
    changeFile(1)
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown)
})

watch(currentFile, (file) => {
  if (!file || (viewedAt.get(file.id) ?? 0) > Date.now() - 30 * 60 * 1000) return
  viewedAt.set(file.id, Date.now())
  trpc.analytics.trackView.mutate({ collectionFileId: file.id }).catch(() => {})
})

function focusModal(event: Event) {
  event.preventDefault()
  const container = event.target as HTMLElement
  container.focus()
}

watch(() => props.modelValue, (newValue) => {
  if (!newValue) {
    form.value.isAcceptingTerms = false
  }
})

</script>

<template>
  <FocusScope v-if="currentFile" as="div" trapped loop tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="gallery-modal-title"
    class="gallery-modal bg-white fixed top-0 left-0 w-full h-full z-30 py-5 px-7 text-neutral-800 outline-hidden" @mount-auto-focus="focusModal">
    <div class="gallery-modal__header max-md:flex-col max-md:items-start max-md:[&>div:last-child]:w-full flex items-center justify-between mb-4 flex-wrap gap-3">
      <div class="flex items-center">
        <h2 id="gallery-modal-title">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span class="block text-[17px] font-semibold truncate max-w-[300px] md:max-w-[400px]">
                  {{ truncateFileName(currentFile.name) }}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ currentFile.name }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h2>

        <div class="flex items-center gap-6 ml-4">
          <template v-if="haveAccessToFavorites">
            <button v-if="isFavorite(currentFile)" @click="removeFromFavorite(currentFile)" type="button"
              aria-label="Remove from favorites" class="relative">
              <Star class="w-5 h-5 text-neutral-800 fill-neutral-600" />
              <StarOff
                class="w-5 h-5 text-neutral-800 absolute inset-0 opacity-0 hover:opacity-100 transition-opacity fill-white bg-white" />
            </button>
            <button v-else @click="addToFavorite(currentFile)" type="button" aria-label="Add to favorites" class="block">
              <Star class="w-5 h-5 text-neutral-800 hover:fill-neutral-600" />
            </button>
          </template>
          <button v-if="removable" @click="remove(currentFile)" type="button" aria-label="Remove from collection">
            <Trash2 class="w-5 h-5 text-neutral-800 hover:text-neutral-500" />
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div v-if="hasCollectionPath" class="gallery-modal__breadcrumb [&_.dv-breadcrumb]:min-w-0 [&_.dv-breadcrumb]:max-w-full [font-size:0.875rem] [max-width:calc(100%_-_50px)] flex items-center">
          <PathBreadcrumb :items="breadcrumbItems" :head-items="2" :tail-items="3" tone="light"
            @navigate="$emit('update:modelValue', null)" />
        </div>

        <Button aria-label="Close preview" variant="ghost" size="icon" type="button"
          class="text-neutral-800 hover:text-neutral-600 bg-transparent hover:bg-neutral-100 ml-2"
          @click="$emit('update:modelValue', null)">
          <X strokeWidth="3" />
        </Button>
      </div>
    </div>
    <div class="flex">
      <div class="gallery-modal__preview relative w-full">
        <div v-if="files.length > 1" class="gallery-modal__navigation absolute top-0 left-0 right-0 bottom-0 flex justify-between items-center pointer-events-none select-none [z-index:2] [&:hover_.gallery-modal\_\_key-info]:opacity-100 [&:focus-within_.gallery-modal\_\_key-info]:opacity-100">
          <button type="button" aria-label="Previous file" aria-keyshortcuts="ArrowLeft" class="gallery-modal__previous-file pointer-events-auto cursor-pointer p-4 mr-auto" @click="changeFile(-1)">
            <ChevronLeft strokeWidth="3" class="w-10 h-10" />
          </button>
          <button type="button" aria-label="Next file" aria-keyshortcuts="ArrowRight" class="gallery-modal__next-file pointer-events-auto cursor-pointer p-4 ml-auto" @click="changeFile(1)">
            <ChevronRight strokeWidth="3" class="w-10 h-10" />
          </button>
          <div aria-hidden="true" class="gallery-modal__key-info absolute bottom-4 right-4 flex items-center [background-color:rgba(0,_0,_0,_0.5)] [color:rgba(255,_255,_255,_0.7)] [padding:0.5rem_1rem] [border-radius:9999px] [font-size:0.75rem] opacity-0 [transition:opacity_0.3s_ease] select-none [&_svg]:mr-1">
            <SquareArrowLeft class="w-4 h-4" />
            <SquareArrowRight class="w-4 h-4" />
            <span class="ml-2">Use keyboard to navigate</span>
          </div>
        </div>
        <div class="gallery-modal__preview-thumbnail-container flex items-center justify-center [height:calc(100vh_-_90px)] w-full [margin:0_auto]">
          <video v-if="isVideoFile && currentFile.fileURL" :src="currentFile.fileURL" controls
            class="gallery-modal__preview-thumbnail [max-width:90%] [max-height:90%] object-contain" />
          <div v-else-if="isVideoFile && !currentFile.fileURL" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">
              {{
                currentFile.name.toLowerCase().endsWith('.mp4') ? 'MP4 Video' :
                currentFile.name.toLowerCase().endsWith('.mov') ? 'MOV Video' :
                currentFile.name.toLowerCase().endsWith('.avi') ? 'AVI Video' :
                currentFile.name.toLowerCase().endsWith('.mkv') ? 'MKV Video' :
                currentFile.name.toLowerCase().endsWith('.wmv') ? 'WMV Video' :
                currentFile.name.toLowerCase().endsWith('.flv') ? 'FLV Video' :
                currentFile.name.toLowerCase().endsWith('.webm') ? 'WebM Video' :
                currentFile.name.toLowerCase().endsWith('.m4v') ? 'M4V Video' :
                'Video'
              }} Preview Not Available
            </div>
          </div>
          <iframe v-else-if="isPdf" :title="`Preview of ${currentFile.name}`" :src="`${currentFile.fileURL}#toolbar=0&navpanes=0&scrollbar=1`"
            class="gallery-modal__preview-thumbnail [max-width:90%] [max-height:90%] object-contain gallery-modal__pdf-preview [width:90%] [height:90%] bg-neutral-100 border border-neutral-200 rounded-none"
            width="90%" height="90%" frameborder="0">
          </iframe>
          <img v-else-if="(currentFile.mimeType.startsWith('image/') ||
                          isVectorFile ||
                          isPsd ||
                          (isPowerPoint && hasThumbnail) ||
                          (isWord && hasThumbnail) ||
                          (isExcel && hasThumbnail) ||
                          (isTextFile && hasThumbnail) ||
                          (isFontFile && hasThumbnail))"
               :src="currentFile.thumbnailURL"
               :alt="currentFile.name"
               class="gallery-modal__preview-thumbnail [max-width:90%] [max-height:90%] object-contain" />
          <div v-else-if="isPowerPoint && !hasThumbnail" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">PowerPoint Preview Not Available</div>
          </div>
          <div v-else-if="isWord && !hasThumbnail" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">Word Document Preview Not Available</div>
          </div>
          <div v-else-if="isExcel && !hasThumbnail" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">Excel Spreadsheet Preview Not Available</div>
          </div>
          <div v-else-if="isTextFile && !hasThumbnail" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">
              {{
                currentFile.name.toLowerCase().endsWith('.html') || currentFile.name.toLowerCase().endsWith('.htm') ? 'HTML File' :
                currentFile.name.toLowerCase().endsWith('.xml') ? 'XML File' :
                currentFile.name.toLowerCase().endsWith('.json') ? 'JSON File' :
                currentFile.name.toLowerCase().endsWith('.md') ? 'Markdown File' :
                currentFile.name.toLowerCase().endsWith('.yaml') || currentFile.name.toLowerCase().endsWith('.yml') ? 'YAML File' :
                currentFile.name.toLowerCase().endsWith('.css') ? 'CSS File' :
                currentFile.name.toLowerCase().endsWith('.js') ? 'JavaScript File' :
                currentFile.name.toLowerCase().endsWith('.ts') ? 'TypeScript File' :
                'Text File'
              }} Preview Not Available
            </div>
          </div>
          <div v-else-if="isFontFile && !hasThumbnail" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">
              {{
                currentFile.name.toLowerCase().endsWith('.ttf') ? 'TTF Font' :
                currentFile.name.toLowerCase().endsWith('.otf') ? 'OTF Font' :
                'Font'
              }} Preview Not Available
            </div>
          </div>
          <div v-else-if="isVectorFile && !hasThumbnail" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">
              {{
                currentFile.name.toLowerCase().endsWith('.ai') ? 'Adobe Illustrator' :
                currentFile.name.toLowerCase().endsWith('.eps') ? 'EPS Vector' :
                'Vector File'
              }} Preview Not Available
            </div>
          </div>
          <div v-else-if="isPsd && !hasThumbnail" class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">Photoshop PSD Preview Not Available</div>
          </div>
          <div v-else class="gallery-modal__placeholder-container flex flex-col items-center justify-center h-full w-full gap-4 p-8">
            <component :is="thumbnailPlaceholder" class="gallery-modal__placeholder [&_svg]:size-full [&_path]:fill-current [width:120px] [height:120px] [color:#e0e0e0] opacity-80" />
            <div class="gallery-modal__placeholder-filename text-neutral-500 [font-size:14px] font-semibold text-center [max-width:80%] [word-break:break-word]">No preview available</div>
          </div>
        </div>
      </div>
      <div class="gallery-modal__download-container flex flex-col [height:calc(100vh_-_90px)] w-full gap-8 [max-width:320px] border-l border-neutral-200 [padding:0.5rem_1rem] ml-4">
        <div v-if="currentFile.mimeType.startsWith('image/')">
          <div class="mb-3 text-[13px] font-semibold">Choose an Image format</div>
          <RadioGroup v-model="form.imageFormat">
            <div class="flex flex-col space-y-2">
              <div v-for="option in [
                { name: 'Original (HD)', value: 'original' },
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
        <div v-if="
          currentFile.mimeType.startsWith('image/') && form.imageFormat !== 'original'
        ">
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
                  class="border border-primary text-primary shrink-0" />
                <div>
                  <Label :for="`download-type-${option.value}`">{{ option.name }}</Label>
                  <p class="text-sm text-neutral-500">{{ option.description }}</p>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>
        <div v-if="hasLicense">
          <div class="mb-3 text-[13px] font-semibold">Usage Licensing Agreement</div>
          <div class="flex-col gap-1">
            <div v-if="currentFile.license" class="flex items-center text-neutral-600">
              <Copyright class="w-4 h-4 mr-4 text-neutral-600" />
              <div>
                <Dialog v-if="currentFile.license.details">
                  <DialogTrigger as-child>
                    <button class="flex items-center text-sm mb-1 text-neutral-800">
                      {{ currentFile.license.name }}
                      <CircleHelpIcon class="ml-2 h-4 w-4" />
                    </button>
                  </DialogTrigger>
                  <DialogContent class="sm:max-w-[640px] gap-5">
                      <DialogHeader><DialogTitle>{{ currentFile.license.name }}</DialogTitle><DialogDescription>Usage terms</DialogDescription></DialogHeader>
                    <div class="text-sm leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" v-html="currentFile.license.details" />
                  </DialogContent>
                </Dialog>
                <div v-else class="flex items-center text-sm mb-1 text-neutral-800">
                  {{ currentFile.license.name }}
                </div>
                <div class="text-neutral-600 text-xs">
                  {{
                    currentFile.license.scopes
                      .map((scope: string) => scope.toUpperCase())
                      .join(", ")
                  }}
                </div>
              </div>
            </div>
            <div class="flex items-center py-6 gap-4">
              <Checkbox id="terms" v-model="form.isAcceptingTerms"
                class="border-brand [&>*]:bg-brand [&>*]:text-neutral-800"
                :class="{ 'border-red-500': hasTermsError }" />
              <Label for="terms" class="leading-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                :class="{
                  'text-red-500': hasTermsError,
                  'text-brand': !hasTermsError && form.isAcceptingTerms,
                }">
                By downloading this asset, I hereby agree to respect the Asset Usage
                Licensing Agreement.
              </Label>
            </div>
          </div>
        </div>
        <div>
          <Button @click="download"
            class="w-full bg-primary text-primary-foreground hover:bg-[var(--dv-action-hover)]"
            :class="{
              'ring ring-neutral-200 bg-white text-neutral-800 hover:ring-brand hover:text-brand hover:bg-white': hasLicense && !form.isAcceptingTerms,
            }" :disabled="isLoading">
            {{ isLoading ? "Preparing files..." : "Download" }}
          </Button>
          <div class="mt-2 text-sm text-neutral-600">
            Total Size: {{ formatFileSize(currentFile.size) }}
          </div>
        </div>
      </div>
    </div>
  </FocusScope>
</template>
