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
import CollectionRender from "@/components/collection/CollectionRender.vue"
import { useMyCollections } from "@/composables/useMyCollections"
import { useGlobalStore } from "@/stores/globalStore"
import { computed } from "vue"
import { useCollectionFavorites } from "@/composables/useCollectionFavorites"
import CollectionRenderFiles from "@/components/collection/CollectionRenderFiles.vue"
import MainPageTools from "@/components/layout-main/MainPageTools.vue"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import Loader from "@/components/Loader.vue"
import { useFileFavorites } from "@/composables/useFileFavorites"

const store = useGlobalStore()
const { data: tree } = useMyCollections()
const { data: collections, status: collectionsStatus, isLoading: collectionsLoading, error: collectionsError } = useCollectionFavorites()
const { status, data: favorites, error } = useFileFavorites()

const collectionPaths = computed(() => {
  const paths = new Map<string, string>()
  type TreeCollection = { id: string; name: string; public: boolean; ownerId?: string; children?: TreeCollection[] }
  function visit(collection: TreeCollection, parents: string[]) {
    const path = [...parents, collection.name]
    paths.set(collection.id, path.join(' / '))
    collection.children?.forEach(child => visit(child, path))
  }
  tree.value?.forEach((collection: TreeCollection) => visit(collection, [
    !collection.public && collection.ownerId === store.user?.id ? 'My collections' : 'Library',
  ]))
  return paths
})

function collectionPath(collection: { id: string }) {
  return collectionPaths.value.get(collection.id)
}

function filePath(file: { collectionId: string | null; name: string }) {
  const parentPath = file.collectionId ? collectionPaths.value.get(file.collectionId) : undefined
  return parentPath ? `${parentPath} / ${file.name}` : undefined
}
</script>

<template>
  <div v-if="status === 'pending' || collectionsLoading">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error' || collectionsStatus === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message || collectionsError?.message }}
  </div>
  <div v-else-if="status === 'success'" class="favorites__container">
    <MainPageTools area="context">
      <h1 class="text-body font-semibold leading-5 tracking-normal">Favorites</h1>
    </MainPageTools>
    <MainPageTools area="actions">
      <DisplayPreferences v-if="favorites?.length || collections?.length" :files="favorites ?? []" :collections="collections ?? []" />
    </MainPageTools>
    <div v-if="!favorites?.length && !collections?.length" class="grid justify-items-center gap-3 py-20 text-center [&_p]:max-w-sm [&_p]:text-sm [&_p]:text-neutral-500"><h2>No favorites yet</h2><p>Save collections and assets with the star icon to find them here.</p><router-link :to="{ name: 'search' }" class="dv-button">Browse assets</router-link></div>
    <div v-else class="grid gap-8">
      <section v-if="collections?.length" aria-labelledby="favorite-collections-heading">
        <h2 id="favorite-collections-heading" class="mb-4 text-body font-semibold">Collections</h2>
        <CollectionRender :collections="collections" :get-path="collectionPath" :generate-route="collection => ({ name: 'collection', params: { id: collection.id } })" />
      </section>
      <section v-if="favorites?.length" aria-labelledby="favorite-assets-heading">
        <h2 id="favorite-assets-heading" class="mb-4 text-body font-semibold">Assets</h2>
        <CollectionRenderFiles :files="favorites" :get-path="filePath" />
      </section>
    </div>
  </div>
</template>
