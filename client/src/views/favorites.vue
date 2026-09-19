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
import CollectionGridFiles from "@/components/collection/CollectionDisplayGridFiles.vue"
import Loader from "@/components/Loader.vue"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"

const { status, data: favorites, error } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => trpc.favorite.list.query(),
})
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="favorites__container">
    <h1 class="mb-7! text-[26px]! font-semibold! tracking-tight">Favorites</h1>
    <div v-if="!favorites?.length" class="grid justify-items-center gap-3 py-20 text-center [&_p]:max-w-sm [&_p]:text-sm [&_p]:text-neutral-500"><h2>No favorites yet</h2><p>Save assets with the star icon to find them here.</p><router-link :to="{ name: 'search' }" class="dv-button">Browse assets</router-link></div>
    <collection-grid-files v-else :files="favorites" />
  </div>
</template>
