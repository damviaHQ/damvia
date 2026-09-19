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
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"
import { RouteLocationRaw } from "vue-router"
import type { Collection } from "../types"

const props = defineProps<{
  data: any
  collection?: Collection
  generateRoute: (collection: Collection) => RouteLocationRaw
  editing?: boolean
}>()

const { data: collectionTree } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})

const flatCollections = computed(() => {
  function flatten(collections: RouterOutput["collection"]["tree"]): Collection[] {
    return collections.flatMap((collection: Collection) => [collection, ...flatten(collection.children ?? [])])
  }
  return collectionTree.value ? flatten(collectionTree.value) : []
})

// With no explicit choice the block lists whatever sits under this collection.
const collections = computed(() => {
  if (props.data?.collectionsId?.length) {
    return props.data.collectionsId
      .map((id: string) => flatCollections.value.find((collection) => collection.id === id))
      .filter((collection: Collection | undefined) => !!collection)
  }
  return props.collection?.children ?? []
})
const forceView = computed(() => (["list", "grid"].includes(props.data?.layout) ? props.data.layout : null))
</script>

<template>
  <div v-if="editing || collections.length">
    <div v-if="data.title" class="mb-0.5 text-sm font-medium text-muted-foreground">{{ data.title }}</div>
    <CollectionRender :collections="collections" :generate-route="generateRoute" :force-view="forceView"
      :placeholder="editing ? 'No collections found.' : null" />
  </div>
</template>
