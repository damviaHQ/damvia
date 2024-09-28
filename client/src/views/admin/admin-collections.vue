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
import AdminDialogCreateCollection from "@/components/admin/AdminDialogCreateCollection.vue"
import CollectionDialogEdit from "@/components/collection/CollectionDialogEdit.vue"
import IconCloudSync from "@/components/icons/IconCloudSync.vue"
import Loader from "@/components/Loader.vue"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ChevronDown, ChevronRight, CirclePlus, EyeOff, FilePenLine, Folder, Image, PencilLine, Trash2 } from "lucide-vue-next"
import { TreeItem, TreeRoot } from 'radix-vue'
import { computed, ref, watch } from "vue"

const { status, data: collections, error } = useQuery({
  queryKey: ['collection', 'treeAdmin', 'public'],
  queryFn: () => trpc.collection.treeAdmin.query(),
})

const isAdminDialogCreateCollectionOpen = ref(false)
const isEditCollectionModalOpen = ref(false)
const selectedCollectionId = ref<string | null>(null)
const collectionToDelete = ref<RouterOutput["collection"]["treeAdmin"][number] | null>(null)
const toast = useGlobalToast()
const queryClient = useQueryClient()

const selectedCollection = computed(() => {
  if (!selectedCollectionId.value || !collections.value) return null
  return findCollectionById(collections.value, selectedCollectionId.value)
})

function findCollectionById(items: RouterOutput["collection"]["treeAdmin"], id: string): RouterOutput["collection"]["treeAdmin"][number] | null {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children) {
      const found = findCollectionById(item.children, id)
      if (found) return found
    }
  }
  return null
}

function handleCreateCollection() {
  isAdminDialogCreateCollectionOpen.value = true
}

function handleEditCollection(collection: RouterOutput["collection"]["treeAdmin"][number]) {
  selectedCollectionId.value = collection.id
  isEditCollectionModalOpen.value = true
}

function handleCollectionUpdated() {
  queryClient.invalidateQueries({ queryKey: ['collections', 'treeAdmin', 'public'] })
  toast.success('Collection updated successfully')
}

watch(isEditCollectionModalOpen, (newValue) => {
  if (!newValue) {
    selectedCollectionId.value = null
  }
})

function handleDeleteCollection(collection: RouterOutput["collection"]["treeAdmin"][number]) {
  collectionToDelete.value = collection
}

function stopPropagation(event: Event) {
  event.stopPropagation()
}

async function confirmDeleteCollection() {
  if (collectionToDelete.value) {
    try {
      await trpc.collection.remove.mutate(collectionToDelete.value.id)
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['asset', 'tree'] })
      toast.success('Collection deleted successfully')
    } catch (error) {
      toast.error('Failed to delete collection')
    }
    collectionToDelete.value = null
  }
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="flex flex-col p-8">
    <div class="collections__top flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Collections</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button type="button" variant="link" @click="handleCreateCollection"
        class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
        <CirclePlus class="w-4 h-4" />
        Add new collection
      </Button>
    </div>

    <TreeRoot v-slot="{ flattenItems }" :items="collections" :get-key="(item) => item.id"
      :get-children="(item) => item.children" class="mt-4 max-w-[80%]">
      <TreeItem v-for="item in flattenItems" :key="item._id" v-slot="{ isExpanded }"
        :style="{ paddingLeft: `${(item.level + 1) * 16}px` }" v-bind="item.bind"
        class="flex items-center py-2 hover:bg-neutral-100 rounded">
        <template v-if="item.value.children && item.value.children.length > 0">
          <ChevronDown v-if="isExpanded" class="h-4 w-4 mr-2" />
          <ChevronRight v-else class="h-4 w-4 mr-2" />
        </template>
        <div v-else class="w-4 h-4 mr-2"></div>
        <IconCloudSync v-if="item.value.synchronized" class="h-5 w-5 mr-2 text-neutral-600" />
        <Folder v-else class="h-5 w-5 mr-2 text-neutral-600" />
        <span class="flex-grow">{{ item.value.name }}</span>

        <div class="flex items-center gap-2 mr-5">
          <Badge v-if="item.value.page" variant="outline" class="flex items-center gap-1">
            <FilePenLine class="h-3 w-3" />
            page
          </Badge>
          <Badge v-if="item.value.draft" variant="outline" class="flex items-center gap-1">
            <EyeOff class="h-3 w-3" />
            draft
          </Badge>
          <Badge v-if="item.value.thumbnailURL" variant="outline" class="flex items-center gap-1">
            <Image class="h-3 w-3" />
            thumbnail
          </Badge>
        </div>

        <div class="flex items-center gap-2 ml-5" @click="stopPropagation">
          <Button variant="link" @click="handleEditCollection(item.value)"
            class="flex items-center gap-2 text-neutral-600 hover:text-neutral-900">
            <PencilLine class="h-4 w-4" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger as="div">
              <Button variant="link" @click="handleDeleteCollection(item.value)"
                class="flex items-center gap-2 text-neutral-600 hover:text-neutral-900">
                <Trash2 class="h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to delete "{{ collectionToDelete?.name }}"?</AlertDialogTitle>
                <AlertDialogDescription class="flex flex-col gap-4">
                  <p>
                    This action is not reversible. Users won't be able to access those files anymore and they will be
                    removed
                    from their favorites and
                    their Private Collections.
                  </p>
                  <h2 class="text-base font-medium text-neutral-600">What will happens to the files?</h2>
                  <p>
                    You can safely remove the collection no file will be deleted from your cloud storage. You can always
                    create
                    a new collection with
                    those files inside.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel @click="collectionToDelete = null">Cancel</AlertDialogCancel>
                <AlertDialogAction @click="confirmDeleteCollection" class="bg-red-600 hover:bg-red-700">Delete
                  collection
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TreeItem>
    </TreeRoot>

    <AdminDialogCreateCollection v-model="isAdminDialogCreateCollectionOpen" />
    <CollectionDialogEdit v-if="selectedCollection" v-model="isEditCollectionModalOpen" :collection="selectedCollection"
      @updated="handleCollectionUpdated" />
  </div>
</template>

<style scoped>
.tree-item {
  transition: padding-left 0.2s ease-in-out;
}
</style>