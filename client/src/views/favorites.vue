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
import PathBreadcrumb, { type PathBreadcrumbItem } from "@/components/navigation/PathBreadcrumb.vue"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"

const { status, data: favorites, error } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => trpc.favorite.list.query(),
})
const breadcrumbItems: PathBreadcrumbItem[] = [{ id: 'favorites', label: 'My Favorites' }]
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="favorites__container p-4">
    <PathBreadcrumb :items="breadcrumbItems" />
    <collection-grid-files :files="favorites" />
  </div>
</template>

<style scoped>
.heading-1 {
  color: var(--primary-color50);
  font-size: 1rem;
  margin-bottom: 1em;
}
</style>
