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
import CollectionFavoriteButton from "@/components/collection/CollectionFavoriteButton.vue"
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionDialogEdit from "@/components/collection/CollectionDialogEdit.vue"
import CollectionDialogShare from "@/components/collection/CollectionDialogShare.vue"
import CollectionRenderLayout from "@/components/collection/CollectionRenderLayout.vue"
import Loader from "@/components/Loader.vue"
import PathBreadcrumb, { type PathBreadcrumbItem } from "@/components/navigation/PathBreadcrumb.vue"
import { Button } from "@/components/ui/button"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import PageFilterBar from "@/components/PageFilterBar.vue"
import PageFilterToggle from "@/components/PageFilterToggle.vue"
import { trpc } from "@/services/server.ts"
import { providePageFilter } from "@/composables/usePageFilter"
import { providePageListings } from "@/composables/usePageListings"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import {
  ChevronRight,
  FilePenLine,
  Link,
  Search,
  Settings,
  Trash2,
} from "@lucide/vue"
import { storeToRefs } from "pinia"
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

const router = useRouter()
const route = useRoute()
const globalStore = useGlobalStore()
const storeRefs = storeToRefs(globalStore)
const queryClient = useQueryClient()
const isHovered = ref(false)
const isEditCollectionModalOpen = ref(false)
const isShareModalOpen = ref(false)

const { status, data: collection, error } = useQuery({
  queryKey: computed(() => ["collection", route.params.id]),
  queryFn: async () => {
    try {
      return await trpc.collection.findById.query(route.params.id as string)
    } catch (error) {
      if (error instanceof Error && (error.message === "Collection not found." || error.message === "Invalid request.")) {
        router.push({ name: "collection-404" })
      } else {
        throw error
      }
    }
  }
})

const maxSelectableItems = computed(() => {
  if (!collection.value) {
    return 0
  }
  return (collection.value.files?.length ?? 0) + (collection.value.children?.length ?? 0)
})
const filesToRemovable = computed(() =>
  (collection.value?.files ?? []).filter((file: { id: string }) => {
    return storeRefs.selection.value.some(
      (item) => item.type === "file" && item.id === file.id
    )
  })
)
const canRemoveFiles = computed(
  () =>
    filesToRemovable.value.length &&
    collection.value?.canEdit &&
    !collection.value.synchronized
)
const selection = computed(() => {
  if (!collection.value) {
    return []
  }
  const fileIds = collection.value.files?.map((file: any) => file.id) ?? []
  const collectionIds = collection.value.children?.map((child: any) => child.id) ?? []
  return storeRefs.selection.value.filter(
    (item) =>
      (item.type === "file" && fileIds.includes(item.id)) ||
      (item.type === "collection" && collectionIds.includes(item.id))
  )
})

// What the page draws, announced by the renderers themselves: a block may list
// collections chosen by hand, or the files of another collection entirely.
const { files: shownFiles, collections: shownCollections } = providePageListings()

// The reader narrows what is on this page. The bar is switched on for good, the
// values are not: they describe the collection being read, so they start empty
// on the next one. The view is reused from one collection to the next, so the
// reset has to be asked for.
const pageFilter = providePageFilter()
watch(() => route.params.id, () => pageFilter.clear())

// A page block can fix its own layout, which quietly wins over the reader's
// choice; saying so beats a toggle that looks broken.
const layoutLocked = computed(() =>
  (collection.value?.page?.blocks ?? []).some((block: { type: string, data?: { layout?: string | null } }) =>
    ["collections", "files", "last_files"].includes(block.type) && !!block.data?.layout
  )
)

const collectionPath = computed(() => {
  if (!collection.value) {
    return []
  }
  const path = [collection.value]
  for (let current = collection.value.parent; current; current = current.parent) {
    path.push(current)
  }
  return path.reverse()
})
const breadcrumbItems = computed<PathBreadcrumbItem[]>(() => collectionPath.value.map(item => ({
  id: item.id,
  label: item.name,
  to: { name: 'collection', params: { id: item.id } },
})))

function toggleSelection() {
  if (selection.value.length === maxSelectableItems.value) {
    selection.value.forEach((item) => globalStore.removeFromSelection(item))
    isHovered.value = false
    return
  }

  collection.value.files
    ?.filter(
      (file: any) =>
        !selection.value.some((item) => item.type === "file" && item.id === file.id)
    )
    .forEach((file: any) => globalStore.addToSelection({ type: "file", id: file.id }))
  collection.value.children
    ?.filter(
      (collection: any) =>
        !selection.value.some(
          (item) => item.type === "collection" && item.id === collection.id
        )
    )
    .forEach((collection: any) =>
      globalStore.addToSelection({ type: "collection", id: collection.id })
    )
}

function removeSelectedFiles() {
  if (
    !canRemoveFiles.value ||
    !filesToRemovable.value.length ||
    !confirm("Are you sure you want to remove the selected files?")
  ) {
    return
  }

  trpc.collection.removeFiles
    .mutate(filesToRemovable.value.map((file: any) => file.id))
    .finally(() => {
      queryClient.invalidateQueries({ queryKey: ["collection", collection.value.id] })
      filesToRemovable.value.forEach((file: any) =>
        globalStore.removeFromSelection({ type: "file", id: file.id })
      )
    })
}

</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="collection__container">
    <div class="collection__header mb-6 flex flex-wrap items-center justify-between gap-4">
      <div class="flex min-w-0 flex-1 items-center">
        <div v-if="selection.length > 0" class="collection__selection-container flex items-center text-neutral-500" @mouseenter="isHovered = true"
          @mouseleave="isHovered = false" @focusin="isHovered = true" @focusout="isHovered = false">
          <CollectionCheckbox label="Select all items in this collection" @click="toggleSelection" class="mr-2"
            :state="selection.length === maxSelectableItems ? 'check' : 'undetermined'" />
          <button class="text-sm text-neutral-500 bg-transparent border-none cursor-pointer p-0 w-max"
            @click="toggleSelection">
            <span v-if="!isHovered">{{ selection.length }} item{{ selection.length > 1 ? "s" : "" }} selected

            </span>
            <span v-else>
              {{
                selection.length === maxSelectableItems
                  ? "Clear selection"
                  : "Select all"
              }}
            </span>
          </button>
          <ChevronRight aria-hidden="true" class="mx-2 size-4 shrink-0 text-neutral-500" />
        </div>
        <!-- Select ALL when empty -->
        <button v-if="
          !selection.length &&
          (collection.children?.length || collection.files?.length)
        " @click="toggleSelection"
          class="flex shrink-0 items-center text-sm gap-1.5 text-neutral-500 bg-transparent border-none cursor-pointer p-0 w-max"
          @mouseenter="isHovered = true" @mouseleave="isHovered = false" @focus="isHovered = true" @blur="isHovered = false">
          <span aria-hidden="true" class="size-[18px] border border-neutral-400 bg-white" />
          <span>Select all in</span>
        </button>
        <ChevronRight aria-hidden="true" v-if="
          !selection.length &&
          (collection.children?.length || collection.files?.length)
        " class="mx-2 size-4 shrink-0 text-neutral-500" />
        <div class="collection__path flex min-w-0 items-center">
          <PathBreadcrumb :items="breadcrumbItems" />
        </div>
      </div>
      <div class="collection__header-actions flex items-center gap-1">
        <CollectionFavoriteButton :collection="collection" toolbar />
        <Button aria-label="Remove selected assets" title="Remove selected assets" v-if="canRemoveFiles" @click="removeSelectedFiles" type="button" variant="ghost" size="icon-sm">
          <Trash2 class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button aria-label="Collection settings" title="Collection settings" v-if="collection.canEdit" @click="isEditCollectionModalOpen = true" type="button" variant="ghost"
          size="icon-sm">
          <Settings class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button aria-label="Edit page" title="Edit page" v-if="collection.canEdit" as-child type="button"
          variant="ghost" size="icon-sm">
          <router-link :to="{ name: 'collection-edit', params: { id: collection.id } }">
            <FilePenLine class="text-neutral-500 hover:text-neutral-800" />
          </router-link>
        </Button>
        <Button aria-label="Search in this collection" title="Search in this collection" as-child type="button"
          variant="ghost" size="icon-sm">
          <router-link :to="{ name: 'search', query: { from_collection: collection.id, search_scope: 'current_with_sub' } }">
            <Search class="text-neutral-500 hover:text-neutral-800" />
          </router-link>
        </Button>
        <PageFilterToggle :files="shownFiles" />
        <DisplayPreferences :files="shownFiles" :collections="shownCollections" :layout-locked="layoutLocked" />
        <Button aria-label="Share collection" title="Share collection" v-if="collection.canEdit" @click="isShareModalOpen = true" type="button" variant="ghost"
          size="icon-sm">
          <Link class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <CollectionDialogShare v-if="collection.canEdit" v-model="isShareModalOpen"
          :collection="collection" />
      </div>
    </div>
    <PageFilterBar :files="shownFiles" :collections="shownCollections" />
    <CollectionRenderLayout :key="collection.id" :collection="collection"
      :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
    <CollectionDialogEdit v-model="isEditCollectionModalOpen" :collection="collection" />
  </div>
</template>
