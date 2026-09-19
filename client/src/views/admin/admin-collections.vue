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
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ChevronDown, ChevronRight, CirclePlus, EyeOff, FilePenLine, Folder, Image, PencilLine, Trash2 } from "lucide-vue-next"
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

const expandedIds = ref(new Set<string>())

const visibleRows = computed(() => {
  const rows: { item: RouterOutput["collection"]["treeAdmin"][number], level: number }[] = []
  const walk = (items: RouterOutput["collection"]["treeAdmin"], level: number) => {
    for (const item of items) {
      rows.push({ item, level })
      if (item.children?.length && expandedIds.value.has(item.id)) walk(item.children, level + 1)
    }
  }
  walk(collections.value ?? [], 0)
  return rows
})

function toggleExpanded(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

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
  queryClient.invalidateQueries({ queryKey: ['collection', 'treeAdmin', 'public'] })
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
  <div v-else-if="status === 'error'" class="admin-error" role="alert">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="admin-page admin-resource-page">
    <div class="admin-heading">
      <h1>Collections</h1>
      <Button type="button" variant="default" @click="handleCreateCollection"
        class="dv-button dv-button--primary">
        <CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
        Add collection
      </Button>
    </div>

    <div v-if="!collections?.length" class="dv-panel admin-empty"><h2>No collections yet</h2><p>Create a collection to organize and share your assets.</p></div>
    <ul v-else class="admin-tree dv-panel">
      <li v-for="{ item, level } in visibleRows" :key="item.id"
        :style="{ paddingLeft: `${(level + 1) * 16}px` }"
        class="flex items-center py-2 hover:bg-neutral-100" @click="item.children?.length && toggleExpanded(item.id)">
        <button v-if="item.children?.length" type="button" class="mr-2" :aria-expanded="expandedIds.has(item.id)"
          :aria-label="`Subcollections of ${item.name}`" @click.stop="toggleExpanded(item.id)">
          <ChevronDown v-if="expandedIds.has(item.id)" class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" />
          <ChevronRight v-else class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" />
        </button>
        <div v-else class="w-4 h-4 mr-2"></div>
        <IconCloudSync v-if="item.synchronized" class="h-5 w-5 mr-2 admin-text-secondary" />
        <Folder v-else class="h-[var(--dv-icon-default)] w-[var(--dv-icon-default)] mr-2 admin-text-secondary" />
        <span class="flex-grow">{{ item.name }}</span>

        <div class="flex items-center gap-2 mr-5">
          <Badge v-if="item.page" variant="outline" class="flex items-center gap-1">
            <FilePenLine class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" />
            page
          </Badge>
          <Badge v-if="item.draft" variant="outline" class="flex items-center gap-1">
            <EyeOff class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" />
            draft
          </Badge>
          <Badge v-if="item.thumbnailURL" variant="outline" class="flex items-center gap-1">
            <Image class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" />
            thumbnail
          </Badge>
        </div>

        <div class="flex items-center gap-2 ml-5" @click="stopPropagation">
          <Button variant="link" @click="handleEditCollection(item)" :aria-label="`Edit ${item.name}`"
            class="flex items-center gap-2 admin-text-secondary admin-text-primary-hover">
            <PencilLine class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button variant="link" @click="handleDeleteCollection(item)" :aria-label="`Delete ${item.name}`"
                class="flex items-center gap-2 admin-text-secondary admin-text-primary-hover">
                <Trash2 class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" /> Delete
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
                  <h2 class="text-base font-medium admin-text-secondary">What will happens to the files?</h2>
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
      </li>
    </ul>

    <AdminDialogCreateCollection v-model="isAdminDialogCreateCollectionOpen" />
    <CollectionDialogEdit v-if="selectedCollection" v-model="isEditCollectionModalOpen" :collection="selectedCollection"
      @updated="handleCollectionUpdated" />
  </div>
</template>
