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
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed, defineAsyncComponent } from "vue"
import { useRoute } from "vue-router"

// The editor, TipTap and the drag-and-drop library only load for authors.
const PageEditor = defineAsyncComponent(() => import("@/components/page-editor/PageEditor.vue"))

const route = useRoute()
const isCollectionPage = computed(() => route.name === "collection-edit")
const id = computed(() => route.params.id as string)

const { status, data, error } = useQuery({
  queryKey: computed(() => (isCollectionPage.value ? ["collection", id.value] : ["pages", id.value])),
  queryFn: () => isCollectionPage.value
    ? trpc.collection.findById.query(id.value)
    : trpc.page.findById.query(id.value),
})

// A collection whose layout has never been arranged has no page yet; the
// editor opens on a draft of the default one and creates it when saved.
const page = computed(() => (isCollectionPage.value ? (data.value as any)?.page : data.value) ?? undefined)
const collection = computed(() => (isCollectionPage.value ? (data.value as any) : undefined))
const title = computed(() => (isCollectionPage.value ? `${collection.value?.name} collection` : `"${page.value?.name}"`))
const exitTo = computed(() => isCollectionPage.value
  ? { name: "collection", params: { id: id.value } }
  : { name: "admin-pages" })
</script>

<template>
  <div v-if="status === 'pending'" class="p-8"><Loader :text="true" /></div>
  <div v-else-if="status === 'error'" class="p-8" role="alert">{{ error?.message }}</div>
  <PageEditor v-else :page="page" :collection="collection" :title="title" :exit-to="exitTo" />
</template>
