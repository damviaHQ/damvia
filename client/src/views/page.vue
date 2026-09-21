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
import Loader from "@/components/Loader.vue"
import PageFilterBar from "@/components/PageFilterBar.vue"
import PageFilterToggle from "@/components/PageFilterToggle.vue"
import PageRenderer from "@/components/page-renderer/PageRenderer.vue"
import { providePageFilter } from "@/composables/usePageFilter"
import { providePageListings } from "@/composables/usePageListings"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed, watch } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const { status, data: page, error } = useQuery({
  queryKey: computed(() => ["pages", route.params.id]),
  queryFn: () => trpc.page.findById.query(route.params.id as string),
})

// A custom page lists files and collections like a collection does, so it gets
// the same filter. The blocks announce what they draw, which is what the bar
// counts and builds its facets from.
const { files: shownFiles, collections: shownCollections } = providePageListings()
const pageFilter = providePageFilter()
watch(() => route.params.id, () => pageFilter.clear())
</script>

<template>
  <div v-if="page" class="page__container">
    <div class="page__header-actions mb-4 flex items-center justify-end">
      <PageFilterToggle :files="shownFiles" />
    </div>
    <PageFilterBar :files="shownFiles" :collections="shownCollections" />
    <PageRenderer :blocks="page.blocks ?? []" :assets="page.assets"
      :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
  </div>
  <div v-else-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message }}
  </div>
</template>
