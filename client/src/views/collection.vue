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
import MainPageTools from "@/components/layout-main/MainPageTools.vue"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import CollectionFavoriteButton from "@/components/collection/CollectionFavoriteButton.vue"
import PageSelectionContext from "@/components/PageSelectionContext.vue"
import CollectionDialogEdit from "@/components/collection/CollectionDialogEdit.vue"
import CollectionDialogShare from "@/components/collection/CollectionDialogShare.vue"
import CollectionRenderLayout from "@/components/collection/CollectionRenderLayout.vue"
import Loader from "@/components/Loader.vue"
import { type PathBreadcrumbItem } from "@/components/navigation/PathBreadcrumb.vue"
import { Button } from "@/components/ui/button"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import PageFilterBar from "@/components/PageFilterBar.vue"
import PageFilterToggle from "@/components/PageFilterToggle.vue"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server.ts"
import { usePageContent } from "@/composables/usePageContent"
import { useGlobalStore } from "@/stores/globalStore"
import { isRestricted, type ActionBarAction } from "@/utils/actionBar"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import {
  FilePenLine,
  Link,
  Search,
  Settings,
  Trash2,
} from "@lucide/vue"
import { storeToRefs } from "pinia"
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"

const router = useRouter()
const route = useRoute()
const globalStore = useGlobalStore()
const storeRefs = storeToRefs(globalStore)
const queryClient = useQueryClient()
const toast = useGlobalToast()
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
const recordsToRemove = computed(() => (shownProducts.value ?? []).filter(product =>
  product.collectionId === collection.value?.id && globalStore.selection.some(item => item.type === 'record' && item.id === product.id)
))
const canRemoveRecords = computed(() => recordsToRemove.value.length && collection.value?.canEdit && !collection.value?.includesAllRecords && !collection.value?.recordFilters?.length)
const { shownFiles, shownCollections, shownProducts, filterable, selectable, selection, layoutLocked, toggleSelection } = usePageContent({
  filterEnabled: computed(() => collection.value?.visibleActions?.filter ?? true),
  pageKey: () => route.params.id,
  blocks: computed(() => collection.value?.page?.blocks ?? []),
})

// The collection settings decide who sees which action. Editors always see
// all of them, and are told when others do not.
function shows(action: ActionBarAction) {
  return collection.value?.visibleActions?.[action] ?? true
}
function restricted(action: ActionBarAction) {
  const actionBar = collection.value?.actionBar
  return !!actionBar && isRestricted((actionBar.own ?? actionBar.inherited)[action])
}

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

async function removeSelectedRecords() {
  if (!canRemoveRecords.value || !confirm("Remove the selected products from this collection?")) return
  try {
    await trpc.collection.removeRecords.mutate({ id: collection.value.id, recordIds: recordsToRemove.value.map(product => product.id) })
    recordsToRemove.value.forEach(product => globalStore.removeFromSelection({ type: 'record', id: product.id }))
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["collection"] }),
      queryClient.invalidateQueries({ queryKey: ["catalogue"] }),
    ])
  } catch (error) {
    toast.error((error as Error).message)
  }
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
    <MainPageTools area="actions">
      <CollectionFavoriteButton :collection="collection" toolbar />
      <PageFilterToggle v-if="shows('filter')" :files="filterable" :restricted="restricted('filter')" />
      <DisplayPreferences v-if="shows('display')" :files="shownFiles" :collections="shownCollections" :products="shownProducts.length ? shownProducts : undefined" :layout-locked="layoutLocked" :restricted="restricted('display')" />
      <DropdownMenu v-if="collection.canEdit || shows('search')">
        <DropdownMenuTrigger as-child>
          <Button aria-label="Collection actions" title="Collection actions" type="button" variant="ghost" size="icon-sm"><Settings class="text-neutral-500" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" :collision-padding="12" class="w-56">
          <DropdownMenuItem v-if="collection.canEdit && shows('share')" @select="isShareModalOpen = true"><Link class="size-4" />Share collection</DropdownMenuItem>
          <DropdownMenuItem v-if="collection.canEdit" @select="isEditCollectionModalOpen = true"><Settings class="size-4" />Collection settings</DropdownMenuItem>
          <DropdownMenuItem v-if="collection.canEdit" as-child><router-link :to="{ name: 'collection-edit', params: { id: collection.id } }"><FilePenLine class="size-4" />Edit page</router-link></DropdownMenuItem>
          <DropdownMenuItem v-if="shows('search')" as-child><router-link :to="{ name: 'search', query: { from_collection: collection.id, search_scope: 'current_with_sub' } }"><Search class="size-4" />Search in this collection</router-link></DropdownMenuItem>
          <DropdownMenuSeparator v-if="canRemoveFiles || canRemoveRecords" />
          <DropdownMenuItem v-if="canRemoveFiles" @select="removeSelectedFiles"><Trash2 class="size-4" />Remove selected assets</DropdownMenuItem>
          <DropdownMenuItem v-if="canRemoveRecords" @select="removeSelectedRecords"><Trash2 class="size-4" />Remove selected products</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MainPageTools>
    <MainPageTools area="context">
      <PageSelectionContext :items="breadcrumbItems" :selected-count="selection.length"
        :selectable-count="selectable.length" selection-label="Select all items in this collection" @toggle="toggleSelection" />
    </MainPageTools>
    <MainPageTools area="filters">
      <PageFilterBar :show-summary="false" v-if="shows('filter')" :files="filterable" :collections="shownCollections" />
    </MainPageTools>
    <CollectionDialogShare v-if="collection.canEdit" v-model="isShareModalOpen" :collection="collection" />
    <CollectionRenderLayout :key="collection.id" :collection="collection"
      :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
    <CollectionDialogEdit v-model="isEditCollectionModalOpen" :collection="collection" />
  </div>
</template>
