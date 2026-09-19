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
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionModalGallery from "@/components/collection/CollectionModalDownloadUnique.vue"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { getFileExtension } from "@/utils/fileExtention"
import { formatFileSize } from "@/utils/fileSize"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Star, Trash2 } from "lucide-vue-next"
import { computed, ref } from "vue"

type File = RouterOutput["collection"]["findById"]["files"][number]

const toast = useGlobalToast()
const props = defineProps<{
  files?: File[]
  collection?: RouterOutput["collection"]["findById"]
  placeholder?: string | null
}>()
const globalStore = useGlobalStore()
const queryClient = useQueryClient()
const haveAccessToFavorites = globalStore.user?.role !== "guest"
const currentCollectionFileId = ref<string | null>(null)
const { data: favorites } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => trpc.favorite.list.query(),
})

const removable = computed(
  () => props.collection?.canEdit && !props.collection.synchronized
)
const files = computed(() => props.files ?? props.collection?.files)

function isFileSelected(file: File) {
  return globalStore.selection.some(
    (selection) => selection.type === "file" && selection.id === file.id
  )
}

function isFavorite(file: File) {
  return favorites.value?.some((favorite) => favorite.id === file.id)
}

function handleSelection(file: File) {
  if (isFileSelected(file)) {
    globalStore.removeFromSelection({ id: file.id, type: "file" })
    return
  }
  globalStore.addToSelection({ id: file.id, type: "file" })
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
  <div class="flex flex-wrap gap-6 p-0.5">
    <article v-for="file in files" :key="file.id" class="group w-[276px] max-w-full min-w-0">
      <div class="relative h-[196px] overflow-hidden bg-neutral-100" :class="isFileSelected(file) ? 'outline-2 outline-neutral-500' : ''">
        <button type="button" class="absolute inset-0 flex size-full items-center justify-center p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-800" :aria-label="`Preview ${file.name}`" @click="currentCollectionFileId = file.id">
          <img v-if="file.thumbnailURL" :src="file.thumbnailURL" :alt="file.name" loading="lazy" class="size-full object-contain" />
          <thumbnailPlaceholder v-else class="h-20 w-auto! fill-neutral-400" aria-hidden="true" />
        </button>
        <CollectionCheckbox :aria-label="`Select ${file.name}`" class="absolute left-3 top-3 z-10 group-hover:opacity-100 group-focus-within:opacity-100" :class="isFileSelected(file) ? 'opacity-100' : 'opacity-0'" :state="isFileSelected(file) ? 'check' : false" @click="handleSelection(file)" />
        <div class="absolute right-3 top-3 z-10 flex gap-1">
          <button v-if="removable" type="button" :aria-label="`Remove ${file.name}`" class="grid size-6 place-items-center bg-transparent text-neutral-600 opacity-0 hover:text-red-700 group-hover:opacity-100 group-focus-within:opacity-100" @click="remove(file)"><Trash2 class="size-6" /></button>
          <button v-if="haveAccessToFavorites" type="button" :aria-label="`${isFavorite(file) ? 'Remove from' : 'Add to'} favorites: ${file.name}`" :aria-pressed="isFavorite(file)" class="grid size-6 place-items-center bg-transparent text-[var(--dv-selection-color)] hover:text-neutral-950 group-hover:opacity-100 group-focus-within:opacity-100" :class="isFavorite(file) ? 'opacity-100' : 'opacity-0'" @click="isFavorite(file) ? removeFromFavorite(file) : addToFavorite(file)"><Star class="size-6" :class="isFavorite(file) && 'fill-current'" /></button>
        </div>
      </div>
      <button type="button" class="mt-2.5 block w-full truncate text-left text-sm font-normal text-neutral-800 hover:text-neutral-950" :title="file.name" @click="currentCollectionFileId = file.id">{{ file.name }}</button>
      <p class="mt-1 text-xs text-neutral-500"><span class="uppercase">{{ getFileExtension(file.name) }}</span><span class="mx-1.5 text-neutral-300">·</span>{{ formatFileSize(file.size) }}</p>
    </article>
    <p v-if="!files?.length && placeholder" class="col-span-full py-12 text-center text-sm text-neutral-500">{{ placeholder }}</p>
  </div>
  <CollectionModalGallery v-model="currentCollectionFileId" :collection="collection" :files="$props.files" />
</template>
