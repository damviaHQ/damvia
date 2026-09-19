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
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionDialogEdit from "@/components/collection/CollectionDialogEdit.vue"
import CollectionDialogShare from "@/components/collection/CollectionDialogShare.vue"
import CollectionRenderLayout from "@/components/collection/CollectionRenderLayout.vue"
import Loader from "@/components/Loader.vue"
import PathBreadcrumb, { type PathBreadcrumbItem } from "@/components/navigation/PathBreadcrumb.vue"
import { Button } from "@/components/ui/button"
import LayoutDialogMember from "@/layouts/LayoutDialogMember.vue"
import LayoutPageEditor from "@/layouts/LayoutPageEditor.vue"
import { trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import {
  ChevronRight,
  CircleX,
  FilePenLine,
  LayoutDashboard,
  Link,
  Settings,
  Trash2,
} from "lucide-vue-next"
import { storeToRefs } from "pinia"
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

const router = useRouter()
const route = useRoute()
const globalStore = useGlobalStore()
const storeRefs = storeToRefs(globalStore)
const queryClient = useQueryClient()
const isHovered = ref(false)
const isEditing = ref(false)
const isEditCollectionModalOpen = ref(false)
const isShareModalOpen = ref(false)
const isMemberDialogOpen = ref(false)

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

watch(
  () => route.params.id,
  () => {
    isEditing.value = false
  }
)

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

function openMemberDialog() {
  isMemberDialogOpen.value = true
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
        <div v-if="isEditing">
          <div class="text-neutral-600 font-medium">
            Editing {{ collection.name }} collection
          </div>
        </div>

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
          !isEditing &&
          (collection.children?.length || collection.files?.length)
        " @click="toggleSelection"
          class="flex shrink-0 items-center text-sm gap-1.5 text-neutral-500 bg-transparent border-none cursor-pointer p-0 w-max"
          @mouseenter="isHovered = true" @mouseleave="isHovered = false" @focus="isHovered = true" @blur="isHovered = false">
          <span aria-hidden="true" class="size-[18px] border border-neutral-400 bg-white" />
          <span>Select all in</span>
        </button>
        <ChevronRight aria-hidden="true" v-if="
          !selection.length &&
          !isEditing &&
          (collection.children?.length || collection.files?.length)
        " class="mx-2 size-4 shrink-0 text-neutral-500" />
        <div v-if="!isEditing" class="collection__path flex min-w-0 items-center">
          <PathBreadcrumb :items="breadcrumbItems" />
        </div>
      </div>
      <div class="collection__header-actions flex items-center gap-1">
        <Button aria-label="Remove selected assets" v-if="canRemoveFiles" @click="removeSelectedFiles" type="button" variant="ghost" size="icon">
          <Trash2 class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button aria-label="Collection settings" v-if="collection.canEdit" @click="isEditCollectionModalOpen = true" type="button" variant="ghost"
          size="icon">
          <Settings class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button aria-label="Edit page" v-if="collection.canEdit && collection.page && !isEditing" @click="isEditing = !isEditing" type="button"
          variant="ghost" size="icon">
          <FilePenLine class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button aria-label="Display preferences" v-if="!isEditing" @click="openMemberDialog" type="button" variant="ghost" size="icon">
          <LayoutDashboard class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button aria-label="Share collection" v-if="collection.canEdit && !isEditing" @click="isShareModalOpen = true" type="button" variant="ghost"
          size="icon">
          <Link class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <CollectionDialogShare v-if="collection.canEdit && !isEditing" v-model="isShareModalOpen"
          :collection="collection" />
        <div v-if="isEditing">
          <Button v-if="collection.canEdit" @click="isEditing = !isEditing" type="button" variant="ghost"
            class="flex text-md gap-1.5 collection__header-action-button text-neutral-500 hover:text-neutral-800 hover:bg-transparent pl-2.5">
            <CircleX />
            Close Edit
          </Button>
        </div>
      </div>
    </div>
    <LayoutPageEditor v-if="isEditing" :collection="collection" :page="collection.page" />
    <CollectionRenderLayout v-else :key="collection.id" :collection="collection"
      :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
    <CollectionDialogEdit v-model="isEditCollectionModalOpen" :collection="collection" />
    <LayoutDialogMember v-model:open="isMemberDialogOpen" :initial-tab="'display-preferences'" />
  </div>
</template>
