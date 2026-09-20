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
import { DEFAULT_MASONRY_SIZE, fileDisplayGroup, MASONRY_SIZES } from '@/utils/displayPreferences'
import { gridClasses, gridCardClasses, gridPreviewClasses, masonryCardClasses, masonryColumns, masonryGridStyle, masonryPreviewClasses, masonryTile, thumbnailFavoriteButtonClasses } from './gridStyles'
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import CollectionPathTooltip from "@/components/collection/CollectionPathTooltip.vue"
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionModalGallery from "@/components/collection/CollectionModalDownloadUnique.vue"
import { useFileFavorites } from "@/composables/useFileFavorites"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { getFileExtension } from "@/utils/fileExtention"
import { formatFileSize } from "@/utils/fileSize"
import { useQueryClient } from "@tanstack/vue-query"
import { Star, StarOff, Trash2 } from "@lucide/vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

type File = RouterOutput["collection"]["findById"]["files"][number]

const toast = useGlobalToast()
const props = defineProps<{
  files?: File[]
  collection?: RouterOutput["collection"]["findById"]
  placeholder?: string | null
  getPath?: (file: File) => string | undefined
  // A page block that fixes the grid layout overrules the reader's masonry.
  uniform?: boolean
  // A page block can ask for masonry instead, at a size its author chose.
  masonry?: boolean
  masonrySize?: number | null
}>()
const globalStore = useGlobalStore()
const queryClient = useQueryClient()
const currentCollectionFileId = ref<string | null>(null)
const {
  canFavorite: haveAccessToFavorites,
  isFavorite,
  toggle: toggleFavorite,
  isSaving: isSavingFavorite,
  isSuccess: favoritesReady,
} = useFileFavorites()

const removable = computed(
  () => props.collection?.canEdit && !props.collection.synchronized
)
const files = computed(() => props.files ?? props.collection?.files)

const displayGroupId = computed(() => fileDisplayGroup(files.value ?? []).id)
const isMasonry = computed(() => props.masonry || (!props.uniform && globalStore.displayPreferences[displayGroupId.value] === 'masonry'))
const masonrySize = computed(() => {
  // A page block's own size wins over the reader's, since it also fixed the layout.
  const chosen = props.masonry ? props.masonrySize : globalStore.displayDetails[displayGroupId.value]?.masonrySize
  return MASONRY_SIZES.find(size => size.id === chosen) ?? MASONRY_SIZES.find(size => size.id === DEFAULT_MASONRY_SIZE)!
})

// Columns share the full width, so a tile's height only becomes knowable once
// the container has been measured.
const container = ref<HTMLElement>()
const containerWidth = ref(0)
let observer: ResizeObserver | undefined
onMounted(() => {
  // Resizing retiles, which resizes the container again; only a real width
  // change is worth reacting to.
  observer = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width
    if (Math.abs(width - containerWidth.value) >= 1) containerWidth.value = width
  })
  watch(container, (element, _previous, onCleanup) => {
    if (!element) return
    observer?.observe(element)
    containerWidth.value = element.clientWidth
    onCleanup(() => observer?.unobserve(element))
  }, { immediate: true })
})
onBeforeUnmount(() => observer?.disconnect())

const columns = computed(() => masonryColumns(containerWidth.value, masonrySize.value.minWidth))
const gridStyle = computed(() => (isMasonry.value && containerWidth.value ? masonryGridStyle(columns.value.count) : undefined))

// A thumbnail does not always carry the proportions the file records — a PSD is
// flattened to its own preview — so the picture itself has the last word and the
// tile is corrected once it loads, which is what keeps nothing cropped.
const measuredRatios = ref<Record<string, number>>({})
function measure(file: File, event: Event) {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth || !image.naturalHeight) return
  measuredRatios.value[file.id] = image.naturalHeight / image.naturalWidth
}

function tileStyle(file: File) {
  if (!isMasonry.value || !containerWidth.value) return undefined
  const tile = masonryTile(file.dimensions, columns.value.width, measuredRatios.value[file.id])
  return { gridRowEnd: `span ${tile.span}`, height: `${tile.height}px` }
}

function isFileSelected(file: File) {
  return globalStore.selection.some(
    (selection) => selection.type === "file" && selection.id === file.id
  )
}

function handleSelection(file: File) {
  if (isFileSelected(file)) {
    globalStore.removeFromSelection({ id: file.id, type: "file" })
    return
  }
  globalStore.addToSelection({ id: file.id, type: "file" })
}

async function remove(file: File) {
  if (!removable.value) {
    return
  }

  try {
    if (!confirm("Are you sure to delete this file?")) {
      return
    }
    await trpc.collection.removeFiles.mutate([file.id])
    await queryClient.invalidateQueries({
      queryKey: ["collection", props.collection.id],
    })
  } catch (error) {
    toast.error((error as Error).message)
  }
}

</script>

<template>
  <div ref="container" :class="isMasonry ? 'p-0.5' : gridClasses" :style="gridStyle">
    <article v-for="file in files" :key="file.id" :class="isMasonry ? masonryCardClasses : gridCardClasses"
      :style="tileStyle(file)">
      <div :class="[isMasonry ? masonryPreviewClasses : gridPreviewClasses, isFileSelected(file) && 'outline-2 outline-neutral-500']">
        <CollectionPathTooltip :path="getPath?.(file)">
          <button type="button" class="absolute inset-0 flex size-full items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-800" :class="!isMasonry && 'p-2'" :aria-label="`Preview ${file.name}`" @click="currentCollectionFileId = file.id">
            <img v-if="file.thumbnailURL" :src="file.thumbnailURL" :alt="file.name" loading="lazy" decoding="async" class="size-full" :class="isMasonry ? 'object-cover' : 'object-contain'" @load="measure(file, $event)" />
            <thumbnailPlaceholder v-else class="h-20 w-auto! fill-neutral-400" aria-hidden="true" />
          </button>
        </CollectionPathTooltip>
        <CollectionCheckbox :label="`Select ${file.name}`" class="absolute left-3 top-3 z-10 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" :class="isFileSelected(file) ? 'opacity-100' : 'opacity-0'" :state="isFileSelected(file) ? 'check' : false" @click="handleSelection(file)" />
        <div class="absolute right-[0.9rem] top-4 z-10 flex gap-2">
          <button v-if="removable" type="button" :aria-label="`Remove ${file.name}`" class="grid size-6 place-items-center bg-transparent text-neutral-600 opacity-0 hover:text-red-700 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" @click="remove(file)"><Trash2 class="size-6" /></button>
          <button v-if="haveAccessToFavorites" type="button" :disabled="isSavingFavorite(file.id) || !favoritesReady" :aria-label="`${isFavorite(file) ? 'Remove from' : 'Add to'} favorites: ${file.name}`" :aria-pressed="isFavorite(file)" class="group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" :class="[thumbnailFavoriteButtonClasses, isFavorite(file) ? 'opacity-100' : 'opacity-0']" @click="toggleFavorite(file)"><span class="relative block size-6">
            <Star aria-hidden="true" class="size-6 stroke-[2]" :class="isFavorite(file) ? 'text-neutral-600 fill-neutral-50' : 'text-neutral-500 fill-neutral-100 group-hover/favorite:fill-neutral-50 group-hover/favorite:text-neutral-800'" />
            <StarOff v-if="isFavorite(file)" aria-hidden="true" class="absolute inset-0 size-6 stroke-[2] fill-none text-neutral-500 opacity-0 group-hover/favorite:opacity-100 group-focus-visible/favorite:opacity-100" />
          </span></button>
        </div>
        <!-- Masonry drops the caption under the tile, so the details live over
             the image; pointer-events stay off to keep the whole tile clickable. -->
        <div v-if="isMasonry" class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent p-3 pt-8 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
          <p class="truncate text-sm text-white">{{ file.name }}</p>
          <p class="mt-0.5 text-xs text-white/80"><span class="uppercase">{{ getFileExtension(file.name) }}</span><span class="mx-1.5 text-white/40">·</span>{{ formatFileSize(file.size) }}</p>
        </div>
      </div>
      <CollectionPathTooltip v-if="!isMasonry" :path="getPath?.(file)">
        <button type="button" class="mt-2.5 block w-full truncate text-left text-sm font-normal text-neutral-800 hover:text-neutral-950" :title="getPath?.(file) ? undefined : file.name" @click="currentCollectionFileId = file.id">{{ file.name }}</button>
      </CollectionPathTooltip>
      <p v-if="!isMasonry" class="mt-1 text-xs text-neutral-500"><span class="uppercase">{{ getFileExtension(file.name) }}</span><span class="mx-1.5 text-neutral-300">·</span>{{ formatFileSize(file.size) }}</p>
    </article>
    <p v-if="!files?.length && placeholder" class="col-span-full py-12 text-center text-sm text-neutral-500">{{ placeholder }}</p>
  </div>
  <CollectionModalGallery v-model="currentCollectionFileId" :collection="collection" :files="$props.files" />
</template>
