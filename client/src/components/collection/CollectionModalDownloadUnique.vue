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
import * as fileType from "@/utils/fileType.ts"
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import PathBreadcrumb, { type PathBreadcrumbItem } from "@/components/navigation/PathBreadcrumb.vue"
import { Button } from "@/components/ui/button/index.js"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useFileFavorites } from "@/composables/useFileFavorites"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { RouterInput, RouterOutput, trpc } from "@/services/server.ts"
import { formatFileSize } from "@/utils/fileSize"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import {
  ChevronLeft,
  ChevronRight,
  SquareArrowLeft,
  SquareArrowRight,
  Star,
  StarOff,
  Trash2,
  X,
} from "@lucide/vue"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import CollectionDownloadFileOptions from './CollectionDownloadFileOptions.vue'
import { useDownloadStore } from '@/stores/downloadStore'
import { FocusScope } from "reka-ui"

type File = RouterOutput["collection"]["getFiles"]["files"][number]
type Collection = RouterOutput["collection"]["findById"]

type Props = {
  files?: File[]
  collection?: Collection
  modelValue: string | null
  recordId?: string
}

const emit = defineEmits<{
  (e: "update:modelValue", currentCollectionId: string | null): void
}>()
const toast = useGlobalToast()
const recordLabel = useRecordLabel()
const props = defineProps<Props>()
const viewedAt = new Map<string, number>()
const queryClient = useQueryClient()
const downloads = useDownloadStore()
const isLoading = ref(false)
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
const {
  canFavorite: haveAccessToFavorites,
  isFavorite,
  toggle: toggleFavorite,
  isSaving: isSavingFavorite,
  isSuccess: favoritesReady,
} = useFileFavorites()

const removable = computed(() => props.collection?.canEdit && !props.collection.synchronized)
const resolvesSelection = computed(() => !!props.recordId || (!props.files && !props.collection))
const selection = ref<RouterOutput['collection']['getFiles'] | null>(null)
const isResolving = ref(false)
const loadError = ref('')
const retry = ref(0)
const previewId = ref<string | null>(null)
const selectedViews = ref<string[]>([])
const files = computed<File[]>(() => resolvesSelection.value ? selection.value?.files ?? [] : props.files ?? props.collection?.files ?? [])
const currentFile = computed(() => files.value.find(file => file.id === (resolvesSelection.value ? previewId.value : props.modelValue)))
const productTitle = computed(() => selection.value?.previewRows?.[0]?.[0] ?? recordLabel.singular.value)
const title = computed(() => props.recordId ? productTitle.value : currentFile.value?.name ?? 'Download')
const productFacts = computed(() => (selection.value?.columns ?? []).map((column, index) => ({ ...column, value: selection.value?.previewRows?.[0]?.[index] })).filter(column => column.value))
const viewOptions = computed(() => [...new Set(files.value.map(file => file.recordView ?? ''))].sort())
const showViews = computed(() => !!props.recordId && !!selection.value?.viewsEnabled && viewOptions.value.some(Boolean))
const downloadFiles = computed(() => props.recordId
  ? files.value.filter(file => !showViews.value || selectedViews.value.includes(file.recordView ?? ''))
  : currentFile.value ? [currentFile.value] : [])
const totalSize = computed(() => downloadFiles.value.reduce((total, file) => total + Number(file.size), 0))
const hasLicense = computed(() => downloadFiles.value.some(file => !!file.license))
const canDownload = computed(() => !isLoading.value && !isResolving.value && !!downloadFiles.value.length && totalSize.value < 10_000_000_000 && (!hasLicense.value || form.value.isAcceptingTerms))
const hasCustomDownloadSettings = computed(() => downloadFiles.value.some(file =>
  (file.mimeType.startsWith('image/') && form.value.imageFormat !== 'original') ||
  (file.mimeType.startsWith('video/') && form.value.videoFormat !== 'original')
))

watch([() => props.modelValue, () => props.recordId, resolvesSelection, retry], async (_, __, onCleanup) => {
  if (!resolvesSelection.value) return
  let cancelled = false
  onCleanup(() => { cancelled = true })
  selection.value = null
  loadError.value = ''
  previewId.value = null
  form.value.isAcceptingTerms = false
  if (!props.modelValue) return
  isResolving.value = true
  try {
    const result = await trpc.collection.getFiles.mutate({ items: [{ type: props.recordId ? 'record' : 'file', id: props.recordId ?? props.modelValue }] })
    if (cancelled) return
    selection.value = result
    previewId.value = result.files[0]?.id ?? null
    selectedViews.value = [...new Set(result.files.map(file => file.recordView ?? ''))]
    form.value.imageFormat = 'original'
    form.value.videoFormat = 'original'
    form.value.downloadType = 'direct'
  } catch (error) {
    if (!cancelled) loadError.value = (error as Error).message
  } finally {
    if (!cancelled) isResolving.value = false
  }
}, { immediate: true })
watch(downloadFiles, () => { form.value.isAcceptingTerms = false })

const { data: fileCollection } = useQuery({
  queryKey: computed(() => ["file-collection", props.modelValue]),
  queryFn: () => currentFile.value?.collectionId ? trpc.collection.findById.query(currentFile.value.collectionId) : null,
  enabled: computed(() => !!currentFile.value && !props.recordId && !props.collection && !!currentFile.value.collectionId)
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

const isPdf = computed(() => !!currentFile.value && fileType.isPdf(currentFile.value))
const isPsd = computed(() => !!currentFile.value && fileType.isPsd(currentFile.value))
const isVectorFile = computed(() => !!currentFile.value && fileType.isVectorFile(currentFile.value))
const isTextFile = computed(() => !!currentFile.value && fileType.isTextFile(currentFile.value))
const isFontFile = computed(() => !!currentFile.value && fileType.isFontFile(currentFile.value))
const isVideoFile = computed(() => !!currentFile.value && fileType.isVideoFile(currentFile.value))
const isPowerPoint = computed(() => !!currentFile.value && fileType.isPowerPoint(currentFile.value))
const isWord = computed(() => !!currentFile.value && fileType.isWord(currentFile.value))
const isExcel = computed(() => !!currentFile.value && fileType.isExcel(currentFile.value))

const breadcrumbItems = computed<PathBreadcrumbItem[]>(() => collectionPath.value.map(item => ({
  id: item.id,
  label: item.name,
  to: { name: 'collection', params: { id: item.id } },
})))

const hasCollectionPath = computed(() => {
  const path = collectionPath.value
  return (props.collection || fileCollection.value) && path.length > 0
})


async function remove(file: File) {
  if (!removable.value || !props.collection) {
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
  if (!canDownload.value) return
  isLoading.value = true
  try {
    const formData = {
      ...form.value,
      isAcceptingTerms: hasLicense.value ? form.value.isAcceptingTerms : true,
      collectionFileIds: downloadFiles.value.map(file => file.id),
    };

    const downloadRes = await trpc.download.create.mutate(formData as RouterInput['download']['create'])
    await queryClient.invalidateQueries({ queryKey: ["downloads"] })

    form.value.isAcceptingTerms = false

    if (downloadRes.url) {
      window.open(downloadRes.url, "_blank")
      emit("update:modelValue", null)
      return
    }
    toast.success("You will receive a download link through email.")
    downloads.startRefetch()
    emit("update:modelValue", null)
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    isLoading.value = false
  }
}

function changeFile(addToIndex: number) {
  if (!currentFile.value || !files.value.length) return
  const fileIndex = files.value.indexOf(currentFile.value)
  let newIndex = fileIndex + addToIndex
  if (newIndex < 0) {
    newIndex = files.value.length - 1
  } else if (newIndex >= files.value.length) {
    newIndex = 0
  }
  if (resolvesSelection.value) previewId.value = files.value[newIndex].id
  else emit("update:modelValue", files.value[newIndex].id)
}

function truncateFileName(name: string, maxLength: number = 60) {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength - 3) + "..."
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || !props.modelValue) return
  const target = event.target as HTMLElement | null
  if (target?.closest('[role="dialog"]:not(.gallery-modal)')) return
  if (event.key === "Escape") {
    emit("update:modelValue", null)
    return
  }
  if (target?.closest('input, textarea, select, button, [role="radio"], [contenteditable="true"]')) return
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
  <Teleport to="body">
  <FocusScope v-if="modelValue && (currentFile || resolvesSelection)" as="div" trapped loop tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="gallery-modal-title"
    :class="{ 'is-product': !!recordId }" class="gallery-modal dv-theme dv-neutral dv-client bg-white fixed top-0 left-0 w-full h-full z-40 py-5 px-7 text-neutral-800 outline-hidden" @mount-auto-focus="focusModal">
    <div class="gallery-modal__header flex items-center justify-between mb-4 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <template v-if="currentFile && !recordId && haveAccessToFavorites">
          <button v-if="isFavorite(currentFile)" @click="toggleFavorite(currentFile)" :disabled="isSavingFavorite(currentFile.id) || !favoritesReady" type="button"
            aria-label="Remove from favorites" aria-pressed="true" class="group/favorite relative flex items-center shrink-0">
            <Star aria-hidden="true" class="w-5 h-5 text-neutral-800 fill-neutral-600 group-hover/favorite:opacity-0 group-focus-visible/favorite:opacity-0" />
            <StarOff aria-hidden="true"
              class="w-5 h-5 text-neutral-800 absolute inset-0 opacity-0 group-hover/favorite:opacity-100 group-focus-visible/favorite:opacity-100 transition-opacity fill-white" />
          </button>
          <button v-else @click="toggleFavorite(currentFile)" :disabled="isSavingFavorite(currentFile.id) || !favoritesReady" type="button" aria-label="Add to favorites" aria-pressed="false" class="flex items-center shrink-0">
            <Star aria-hidden="true" class="w-5 h-5 text-neutral-800 hover:fill-neutral-600" />
          </button>
        </template>
        <h2 id="gallery-modal-title" class="flex items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger class="flex items-center">
                <span class="block text-[17px] font-semibold leading-none truncate max-w-[300px] md:max-w-[400px]">
                  {{ truncateFileName(title) }}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ title }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h2>
        <button v-if="currentFile && !recordId && removable" @click="remove(currentFile)" type="button" aria-label="Remove from collection" class="flex items-center ml-3">
          <Trash2 class="w-5 h-5 text-neutral-800 hover:text-neutral-500" />
        </button>
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
    <div class="gallery-modal__body">
      <div class="gallery-modal__preview relative w-full">
        <template v-if="currentFile">
        <div v-if="files.length > 1" class="gallery-modal__navigation absolute top-0 left-0 right-0 bottom-0 flex justify-between items-center pointer-events-none select-none [z-index:2] [&:hover_.gallery-modal\_\_key-info]:opacity-100 [&:focus-within_.gallery-modal\_\_key-info]:opacity-100">
          <button type="button" :aria-label="recordId ? 'Previous view' : 'Previous file'" aria-keyshortcuts="ArrowLeft" class="gallery-modal__previous-file pointer-events-auto cursor-pointer p-4 mr-auto" @click="changeFile(-1)">
            <ChevronLeft strokeWidth="3" class="w-10 h-10" />
          </button>
          <button type="button" :aria-label="recordId ? 'Next view' : 'Next file'" aria-keyshortcuts="ArrowRight" class="gallery-modal__next-file pointer-events-auto cursor-pointer p-4 ml-auto" @click="changeFile(1)">
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
               :src="currentFile.thumbnailURL ?? undefined"
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
        </template>
        <div v-else class="gallery-modal__empty" :role="loadError ? 'alert' : 'status'">
          <p>{{ isResolving ? 'Loading…' : loadError || (recordId ? `No files for this ${recordLabel.lower.value}.` : 'This file is no longer available.') }}</p>
          <Button v-if="loadError" variant="outline" @click="retry++">Try again</Button>
        </div>
        <div v-if="recordId && files.length" class="product-view-strip" aria-label="Product views">
          <button v-for="file in files" :key="file.id" type="button" :aria-pressed="currentFile?.id === file.id"
            :aria-label="`Preview ${showViews && file.recordView ? `view ${file.recordView}` : file.name}`" @click="previewId = file.id">
            <img v-if="file.thumbnailURL" :src="file.thumbnailURL" alt="" />
            <thumbnailPlaceholder v-else aria-hidden="true" />
            <span>{{ showViews && file.recordView ? `View ${file.recordView}` : file.name }}</span>
          </button>
        </div>
      </div>
      <aside class="gallery-modal__download-container" aria-label="Download options">
        <template v-if="!isResolving && !loadError">
          <div v-if="recordId && productFacts.length">
            <h3 class="mb-3 text-[13px] font-semibold">{{ recordLabel.singular.value }}</h3>
            <dl class="file-facts"><template v-for="fact in productFacts" :key="fact.id"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></template></dl>
          </div>
          <fieldset v-if="showViews" class="product-views">
            <legend>Views to download</legend>
            <button type="button" class="select-all-views" @click="selectedViews = [...viewOptions]">Select all</button>
            <div class="view-options"><label v-for="view in viewOptions" :key="view"><input v-model="selectedViews" type="checkbox" :value="view" />{{ view ? `View ${view}` : 'Unnumbered' }}</label></div>
          </fieldset>
          <CollectionDownloadFileOptions :files="downloadFiles" :direct-limit="recordId ? 2_000_000_000 : 5_000_000_000"
            v-model:image-format="form.imageFormat" v-model:image-resolution="form.imageResolution"
            v-model:video-format="form.videoFormat" v-model:video-resolution="form.videoResolution"
            v-model:delivery="form.downloadType" v-model:accepted="form.isAcceptingTerms" />
          <div v-if="!recordId && (currentFile?.record?.attributes?.length || currentFile?.metadata?.length)" class="grid gap-4">
            <div v-if="currentFile?.record?.attributes?.length"><h3 class="mb-2 text-[13px] font-semibold">{{ recordLabel.singular.value }}</h3>
              <dl class="file-facts"><template v-for="attribute in currentFile.record.attributes" :key="attribute?.id"><dt>{{ attribute?.displayName || attribute?.name }}</dt><dd>{{ attribute?.value }}</dd></template></dl>
            </div>
            <div v-if="currentFile?.metadata?.length"><h3 class="mb-2 text-[13px] font-semibold">From the file</h3>
              <dl class="file-facts"><template v-for="field in currentFile.metadata" :key="field.id"><dt>{{ field.displayName || field.name }}</dt><dd>{{ field.value }}</dd></template></dl>
            </div>
          </div>
        </template>
        <div class="gallery-modal__download-action">
          <Button @click="download" class="w-full" :disabled="!canDownload">
            {{ isLoading ? 'Preparing files…' : recordId ? (showViews && selectedViews.length === viewOptions.length ? 'Download all views' : `Download ${downloadFiles.length} ${downloadFiles.length === 1 ? 'file' : 'files'}`) : 'Download' }}
          </Button>
          <p class="mt-2 text-xs text-neutral-500" role="status">{{ recordId ? `${downloadFiles.length} files · ` : '' }}{{ formatFileSize(totalSize) }}</p>
          <p v-if="hasCustomDownloadSettings" class="mt-1 text-xs text-neutral-500">Final size may vary.</p>
          <p v-if="totalSize >= 10_000_000_000" class="mt-2 text-sm text-destructive" role="alert">Select fewer files to stay under 10 GB.</p>
        </div>
      </aside>
    </div>
  </FocusScope>
  </Teleport>
</template>

<style scoped>
.gallery-modal { display:flex; flex-direction:column; height:100dvh; overflow:hidden; }
.gallery-modal__header { flex-shrink:0; }
.gallery-modal__body { display:grid; grid-template-columns:minmax(0,1fr) 320px; flex:1; min-height:0; gap:24px; }
.gallery-modal__preview { display:flex; flex-direction:column; min-width:0; min-height:0; }
.gallery-modal__preview-thumbnail-container { flex:1; height:auto; min-height:0; }
.gallery-modal__download-container { display:flex; flex-direction:column; gap:24px; min-width:0; overflow-y:auto; border-left:1px solid #e5e5e5; padding:8px 0 0 24px; }
.gallery-modal__download-action { margin-top:auto; position:sticky; bottom:0; padding:12px 0; background:white; }
.gallery-modal__empty { display:flex; flex:1; align-items:center; justify-content:center; flex-direction:column; gap:16px; color:#737373; font-size:14px; }
.is-product .gallery-modal__navigation { bottom:116px; }
.product-view-strip { display:flex; flex-shrink:0; gap:12px; overflow-x:auto; padding:12px 4px; border-top:1px solid #e5e5e5; }
.product-view-strip button { width:100px; flex-shrink:0; border:1px solid #e5e5e5; padding:6px; }
.product-view-strip button[aria-pressed=true] { border-color:#262626; box-shadow:inset 0 0 0 1px #262626; }
.product-view-strip img, .product-view-strip svg { width:100%; height:64px; object-fit:contain; }
.product-view-strip span { display:block; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:4px; }
.product-views { position:relative; }
.product-views legend { font-size:13px; font-weight:600; margin-bottom:12px; }
.select-all-views { display:block; margin-bottom:10px; font-size:12px; text-decoration:underline; text-underline-offset:3px; }
.view-options { display:flex; flex-wrap:wrap; gap:8px; }
.view-options label { display:flex; align-items:center; gap:6px; border:1px solid #e5e5e5; padding:8px; font-size:12px; cursor:pointer; }
.view-options input { accent-color:#262626; width:16px; height:16px; }
.gallery-modal button:focus-visible, .gallery-modal input:focus-visible { outline:2px solid #262626; outline-offset:3px; }
@media(max-width:640px) {
  .gallery-modal { padding:16px; overflow-y:auto; }
  .gallery-modal__body { display:flex; flex-direction:column; flex:none; gap:20px; }
  .gallery-modal__preview { flex:none; height:38dvh; }
  .gallery-modal__download-container { flex:none; overflow:visible; border-left:0; border-top:1px solid #e5e5e5; padding:20px 0 0; }
  .gallery-modal__download-action { position:static; }
  .gallery-modal__previous-file, .gallery-modal__next-file { padding:4px; }
  .gallery-modal__key-info { display:none; }
}

.file-facts { display:grid; grid-template-columns:minmax(0,max-content) minmax(0,1fr); gap:4px 16px; font-size:var(--dv-size-caption); }
.file-facts dt { color:var(--dv-text-secondary); }
.file-facts dd { overflow-wrap:anywhere; }
</style>
