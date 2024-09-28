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
import { Star, StarOff, Trash2 } from "lucide-vue-next"
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
  if (!removable) {
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

function onImageLoad(event: Event) {
  if (
    event.target &&
    event.target instanceof HTMLImageElement &&
    event.target.parentElement?.parentElement?.parentElement
  ) {
    event.target.parentElement.parentElement.parentElement.style.maxWidth = `${event.target.clientWidth}px`
  }
}
</script>

<template>
  <div class="collection-grid-files__root">
    <div v-if="files?.length" v-for="file in files" :key="file.id" class="collection-grid-files__file" :class="{
      'collection-grid-files__file-thumbnail-placeholder-container': !file.thumbnailURL,
    }">
      <div class="collection-grid-files__hover-area">
        <CollectionCheckbox @click="handleSelection(file)" :class="[
          'collection-grid-files__file-selection',
          isFileSelected(file) && 'collection-grid-files__file-selection--selected',
        ]" :state="isFileSelected(file) ? 'check' : false" />
        <div class="collection-grid-files__file-action-container">
          <button v-if="removable" @click="remove(file)" type="button"
            class="collection-grid-files__file-action visible-on-hover">
            <Trash2 />
          </button>
          <template v-if="haveAccessToFavorites">
            <div v-if="isFavorite(file)" class="favorite-button-container">
              <button @click="removeFromFavorite(file)" type="button"
                class="collection-grid-files__file-action file-is-favorite">
                <Star class="text-neutral-600 fill-neutral-50" />
              </button>
              <button @click="removeFromFavorite(file)" type="button"
                class="collection-grid-files__file-action star-off-button">
                <StarOff />
              </button>
            </div>
            <button v-else @click="addToFavorite(file)" type="button"
              class="collection-grid-files__file-action visible-on-hover">
              <Star class="text-neutral-500 fill-neutral-100 hover:fill-neutral-50 hover:text-neutral-800" />
            </button>
          </template>
        </div>
        <div class="collection-grid-files__file-image-container bg-neutral-100" :class="[
          isFileSelected(file)
            ? 'outline outline-2 outline-neutral-500 before:bg-opacity-20'
            : 'before:bg-opacity-0 group-hover:before:bg-opacity-10',
          'before:absolute before:inset-0 before:bg-neutral-900 before:transition-opacity',
        ]">
          <div class="collection-grid-files__file-overlay" @click="currentCollectionFileId = file.id"></div>
          <img v-if="file.thumbnailURL" v-lazy="file.thumbnailURL" :src="file.thumbnailURL" :alt="file.name"
            @load="onImageLoad" class="collection-grid-files__file-thumbnail" />
          <thumbnailPlaceholder v-else :alt="file.name" class="collection-grid-files__file-thumbnail-placeholder" />
        </div>
      </div>
      <div>
        <div class="text-neutral-500 text-sm whitespace-nowrap overflow-hidden text-ellipsis mt-[8px] max-w-full">
          {{ file.name }}
        </div>
        <div class="text-xs text-neutral-400">
          {{ getFileExtension(file.name) }} - {{ formatFileSize(file.size) }}
        </div>
      </div>
    </div>
    <div v-else-if="placeholder">
      {{ placeholder }}
    </div>
    <CollectionModalGallery v-model="currentCollectionFileId" :collection="collection" :files="$props.files" />
  </div>
</template>

<style scoped lang="scss">
.collection-grid-files__root {
  display: flex;
  flex-wrap: wrap;
  overflow-x: hidden;
  padding: 2px;
  gap: 24px;
}

.collection-grid-files__file {
  position: relative;
  width: 100%;
  min-width: 276px;
  max-width: 360px;
  align-self: center;
}

.collection-grid-files__file-image-container {
  position: relative;
  height: 196px;
  max-width: 360px;
  width: auto;
  display: flex;
  cursor: pointer;

  img {
    margin: 0 auto;
    padding: 0.5rem;
    max-width: 276px;
    object-fit: contain;
  }
}

.collection-grid-files__file-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  cursor: pointer;
}

.collection-grid-files__file-thumbnail {
  display: block;
  height: 196px;
  width: auto;
  cursor: pointer;
  object-fit: cover;
}

.collection-grid-files__file-thumbnail-placeholder {
  display: block;
  height: 140px;
  width: auto;
  cursor: pointer;
  margin: auto auto;
  object-fit: cover;
  fill: var(--primary-color35);
}

.collection-grid-files__file-thumbnail-placeholder-container {
  max-width: 190px;
}

.icon-collection {
  fill: var(--primary-color50);
}

.collection-grid-files__file-selection {
  cursor: pointer;
  display: none;
  position: absolute;
  top: 1rem;
  left: 0.9rem;
}

.collection-grid-files__file-selection--selected,
.collection-grid-files__file-selection--selected svg {
  display: flex;
  z-index: 2;
}

.collection-grid-files__file-image-container-selected {
  outline: 2px solid var(--primary-color50);
}

.collection-grid-files__file-action-container {
  position: absolute;
  top: 1rem;
  right: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.collection-grid-files__file:hover .collection-grid-files__file-selection {
  display: flex;
  z-index: 2;
}

.collection-grid-files__file:hover .collection-grid-files__file-action {
  @apply text-neutral-500 fill-neutral-100;
  display: flex;
  z-index: 2;
  border: none;
  cursor: pointer;
  padding: 0;
}

.collection-grid-files__file-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease-in-out, color 0.2s ease-in-out;

  &.visible-on-hover {
    opacity: 0;
  }

  &.file-is-favorite {
    opacity: 1;
  }
}

.collection-grid-files__file:hover .collection-grid-files__file-action.visible-on-hover {
  opacity: 1;
}

.favorite-button-container {
  z-index: 2;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.star-off-button {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
  width: 100%;
  height: 100%;
}

.favorite-button-container:hover .star-off-button {
  opacity: 1;
}
</style>
