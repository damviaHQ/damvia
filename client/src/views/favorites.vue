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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
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
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="favorites__container p-4">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem class="text-neutral-500 hover:text-neutral-800">
          <BreadcrumbPage>My Favorites</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
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
