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
import AdminDialogCreateProductCollection from "@/components/admin/AdminDialogCreateProductCollection.vue"
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import CollectionDialogEdit from "@/components/collection/CollectionDialogEdit.vue"
import Loader from "@/components/Loader.vue"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ChevronDown, ChevronRight, CirclePlus, ExternalLink, EyeOff, FilePenLine, Image, PackageSearch, Settings, Trash2 } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const { status, data: collections, error } = useQuery({
  queryKey: ['collection', 'treeAdmin', 'public'],
  queryFn: () => trpc.collection.treeAdmin.query(),
})

// This page is for products. A collection whose products come from files
// only belongs on the (asset) collections page instead; a mixed one that
// also holds products still shows here.
type CollectionNode = RouterOutput["collection"]["treeAdmin"][number]
function pruneToProducts(items: CollectionNode[]): CollectionNode[] {
  const result: CollectionNode[] = []
  for (const item of items) {
    const children = item.children ? pruneToProducts(item.children) : undefined
    if (item.catalogueMode !== 'files' || children?.length) {
      result.push({ ...item, children: children?.length ? children : undefined })
    }
  }
  return result
}
const productCollections = computed(() => pruneToProducts(collections.value ?? []))

const isAdminDialogCreateProductCollectionOpen = ref(false)
const isEditCollectionModalOpen = ref(false)
const selectedCollectionId = ref<string | null>(null)
const collectionToDelete = ref<CollectionNode | null>(null)
const toast = useGlobalToast()
const { plural, singular, lowerPlural } = useRecordLabel()
const queryClient = useQueryClient()

const expandedIds = ref(new Set<string>())

const visibleRows = computed(() => {
  const rows: { item: CollectionNode, level: number }[] = []
  const walk = (items: CollectionNode[], level: number) => {
    for (const item of items) {
      rows.push({ item, level })
      if (item.children?.length && expandedIds.value.has(item.id)) walk(item.children, level + 1)
    }
  }
  walk(productCollections.value, 0)
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

function findCollectionById(items: CollectionNode[], id: string): CollectionNode | null {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children) {
      const found = findCollectionById(item.children, id)
      if (found) return found
    }
  }
  return null
}

function handleEditCollection(collection: CollectionNode) {
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

function handleDeleteCollection(collection: CollectionNode) {
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
    <AdminPageHeader :title="`${plural} collections`"
      :description="`Readers browse these as a catalogue. Fill each one with a list of references or with rules on the ${lowerPlural} fields.`">
      <Button type="button" variant="default" @click="isAdminDialogCreateProductCollectionOpen = true"
        class="dv-button dv-button--primary">
        <CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
        New {{ lowerPlural }} collection
      </Button>
    </AdminPageHeader>

    <div v-if="!productCollections.length" class="dv-panel admin-empty">
      <h2>No {{ lowerPlural }} collections yet</h2>
      <p>Create one to open the {{ lowerPlural }} database to readers.</p>
    </div>
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
        <PackageSearch class="h-[var(--dv-icon-default)] w-[var(--dv-icon-default)] mr-2 admin-text-secondary" />
        <span class="flex-grow">{{ item.name }}</span>

        <div class="flex items-center gap-2 mr-5">
          <Badge variant="outline" class="flex items-center gap-1">
            {{ item.numberOfRecords ?? 0 }} {{ lowerPlural }}
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
          <Button variant="link" as-child :aria-label="`Open ${item.name}`"
            class="flex items-center gap-2 admin-text-secondary admin-text-primary-hover">
            <!-- The reader's own view of the collection, left in its own tab so
                 the tree here keeps its place. -->
            <router-link :to="{ name: 'collection', params: { id: item.id } }" target="_blank" rel="noopener">
              <ExternalLink class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" /> Open
            </router-link>
          </Button>
          <Button variant="link" as-child :aria-label="`Build ${item.name}`"
            class="flex items-center gap-2 admin-text-secondary admin-text-primary-hover">
            <router-link :to="{ name: 'admin-collection-products', params: { id: item.id } }">
              <PackageSearch class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" /> Build
            </router-link>
          </Button>
          <Button variant="link" as-child :aria-label="`Edit the page of ${item.name}`"
            class="flex items-center gap-2 admin-text-secondary admin-text-primary-hover">
            <router-link :to="{ name: 'collection-edit', params: { id: item.id } }">
              <FilePenLine class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" /> Page
            </router-link>
          </Button>
          <!-- Name, thumbnail, groups: the collection's own settings, which
               "Edit" made sound like editing the page next to it. -->
          <Button variant="link" @click="handleEditCollection(item)" :aria-label="`Settings of ${item.name}`"
            class="flex items-center gap-2 admin-text-secondary admin-text-primary-hover">
            <Settings class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" /> Settings
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
                    This action is not reversible. Readers won't be able to browse these {{ lowerPlural }} anymore and
                    the collection will be removed from their favorites and their Private Collections.
                  </p>
                  <p>No {{ singular.toLowerCase() }} is deleted: only the list that brought them together here.</p>
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

    <AdminDialogCreateProductCollection v-model="isAdminDialogCreateProductCollectionOpen" />
    <CollectionDialogEdit v-if="selectedCollection" v-model="isEditCollectionModalOpen" :collection="selectedCollection"
      @updated="handleCollectionUpdated" />
  </div>
</template>
