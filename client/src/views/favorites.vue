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
import CollectionDisplayGrid from "@/components/collection/CollectionDisplayGrid.vue"
import { useCollectionFavorites } from "@/composables/useCollectionFavorites"
import CollectionGridFiles from "@/components/collection/CollectionDisplayGridFiles.vue"
import Loader from "@/components/Loader.vue"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"

const { data: collections, status: collectionsStatus, isLoading: collectionsLoading, error: collectionsError } = useCollectionFavorites()
const { status, data: favorites, error } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => trpc.favorite.list.query(),
})
</script>

<template>
  <div v-if="status === 'pending' || collectionsLoading">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error' || collectionsStatus === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message || collectionsError?.message }}
  </div>
  <div v-else-if="status === 'success'" class="favorites__container">
    <h1 class="mb-7! text-[26px]! font-semibold! tracking-tight">Favorites</h1>
    <div v-if="!favorites?.length && !collections?.length" class="grid justify-items-center gap-3 py-20 text-center [&_p]:max-w-sm [&_p]:text-sm [&_p]:text-neutral-500"><h2>No favorites yet</h2><p>Save collections and assets with the star icon to find them here.</p><router-link :to="{ name: 'search' }" class="dv-button">Browse assets</router-link></div>
    <div v-else class="grid gap-8">
      <section v-if="collections?.length" aria-labelledby="favorite-collections-heading">
        <h2 id="favorite-collections-heading" class="mb-4 text-body font-semibold">Collections</h2>
        <CollectionDisplayGrid :collections="collections" :generate-route="collection => ({ name: 'collection', params: { id: collection.id } })" />
      </section>
      <section v-if="favorites?.length" aria-labelledby="favorite-assets-heading">
        <h2 id="favorite-assets-heading" class="mb-4 text-body font-semibold">Assets</h2>
        <collection-grid-files :files="favorites" />
      </section>
    </div>
  </div>
</template>
