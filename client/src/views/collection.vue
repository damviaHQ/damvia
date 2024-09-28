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
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
const itemsToDisplay = 3

const { status, data: collection, error } = useQuery({
  queryKey: computed(() => ["collection", route.params.id]),
  queryFn: async () => {
    try {
      return await trpc.collection.findById.query(route.params.id as string)
    } catch (error) {
      if (error.message === "Collection not found." || error.message === "Invalid request.") {
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
const dropdownItems = computed(() => {
  if (collectionPath.value.length <= itemsToDisplay) return []
  return collectionPath.value.slice(1, -2)
})
const visibleItems = computed(() => {
  if (collectionPath.value.length <= itemsToDisplay) return collectionPath.value
  return [
    collectionPath.value[0],
    { id: "ellipsis", name: "...", isEllipsis: true },
    ...collectionPath.value.slice(-2),
  ]
})

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
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="collection__container p-4">
    <div class="collection__header flex items-center justify-between mb-4">
      <div class="flex items-center">
        <div v-if="isEditing">
          <div class="text-neutral-600 font-medium">
            Editing {{ collection.name }} collection
          </div>
        </div>
        <div v-if="!isEditing && !collection.children?.length && !collection.files?.length"
          class="font-medium text-neutral-800 text-sm">
          {{ collection.name }}
        </div>
        <div v-if="selection.length > 0" class="collection__selection-container" @mouseenter="isHovered = true"
          @mouseleave="isHovered = false">
          <CollectionCheckbox @click="toggleSelection" class="mr-2"
            :state="selection.length === maxSelectableItems ? 'check' : 'undetermined'" />
          <button class="text-sm text-neutral-500 bg-transparent border-none cursor-pointer p-0 w-max"
            @click="toggleSelection">
            <span v-if="!isHovered">{{ selection.length }} item{{ selection.length > 1 ? "s" : "" }} selected
              in
            </span>
            <span v-else>
              {{
                selection.length === maxSelectableItems
                  ? "Remove Selection in "
                  : "Select All in"
              }}
            </span>
          </button>
          <ChevronRight class="h-4 w-4 text-neutral-500 mx-2" />
        </div>
        <!-- Select ALL when empty -->
        <button v-if="
          !selection.length &&
          !isEditing &&
          (collection.children?.length || collection.files?.length)
        " @click="toggleSelection"
          class="flex items-center text-sm gap-1.5 text-neutral-500 bg-transparent border-none cursor-pointer p-0 w-max"
          @mouseenter="isHovered = true" @mouseleave="isHovered = false">
          <CollectionCheckbox :state="false" />
          <span>Select All in</span>
        </button>
        <ChevronRight v-if="
          !selection.length &&
          !isEditing &&
          (collection.children?.length || collection.files?.length)
        " class="h-4 w-4 text-neutral-500 mx-2" />
        <div v-if="!isEditing && (collection.children?.length || collection.files?.length)" class="collection__path">
          <Breadcrumb>
            <BreadcrumbList>
              <template v-for="(item, index) in visibleItems" :key="item.id">
                <BreadcrumbItem class="text-neutral-500 hover:text-neutral-800">
                  <template v-if="item.isEllipsis">
                    <DropdownMenu>
                      <DropdownMenuTrigger class="flex items-center gap-1 hover:bg-transparent"
                        aria-label="Toggle menu">
                        <BreadcrumbEllipsis class="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem v-for="dropItem in dropdownItems" :key="dropItem.id">
                          <router-link :to="{ name: 'collection', params: { id: dropItem.id } }">
                            {{ dropItem.name }}
                          </router-link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </template>
                  <template v-else>
                    <BreadcrumbLink v-if="index < visibleItems.length - 1" as-child>
                      <router-link :to="{ name: 'collection', params: { id: item.id } }"
                        class="max-w-20 truncate md:max-w-none">
                        {{ item.name }}
                      </router-link>
                    </BreadcrumbLink>
                    <BreadcrumbPage v-else class="max-w-20 truncate md:max-w-none font-medium text-neutral-800">
                      {{ item.name }}
                    </BreadcrumbPage>
                  </template>
                </BreadcrumbItem>
                <BreadcrumbSeparator v-if="index < visibleItems.length - 1" />
              </template>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
      <div class="collection__header-actions flex items-center gap-0.5">
        <Button v-if="canRemoveFiles" @click="removeSelectedFiles" type="button" variant="ghost" size="icon">
          <Trash2 class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button v-if="collection.canEdit" @click="isEditCollectionModalOpen = true" type="button" variant="ghost"
          size="icon">
          <Settings class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button v-if="collection.canEdit && collection.page && !isEditing" @click="isEditing = !isEditing" type="button"
          variant="ghost" size="icon">
          <FilePenLine class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button v-if="!isEditing" @click="openMemberDialog" type="button" variant="ghost" size="icon">
          <LayoutDashboard class="text-neutral-500 hover:text-neutral-800" />
        </Button>
        <Button v-if="collection.canEdit && !isEditing" @click="isShareModalOpen = true" type="button" variant="ghost"
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

<style scoped>
.collection__path {
  display: flex;
  align-items: center;
}

.collection__path-item {
  position: relative;
  display: flex;
  align-items: center;
  color: var(--primary-color50);
  font-weight: 500;
  text-decoration: none;
}

.collection__selection-container {
  @apply flex items-center text-neutral-500;
}

.collection__selection {
  cursor: pointer;
  display: none;
  background: transparent;
  border: none;
}

.collection__selection {
  padding-inline: 0;
  padding-right: 0.5rem;
}

.collection__selection--active,
.collection__selection--active svg {
  display: flex;
}

.collection__path-item--ellipsis:hover .tooltip {
  display: block;
}
</style>
