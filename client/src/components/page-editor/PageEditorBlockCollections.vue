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
import type { Collection } from "@/layouts/LayoutPageEditor.vue"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"
import { RouteLocationRaw } from "vue-router"

const props = defineProps<{
  subCollections?: Collection[]
  collectionsId?: string[]
  title?: string
  generateRoute: (collection: Collection) => RouteLocationRaw
  editMode: boolean
  forceView?: "list" | "grid" | null
}>()

const { data: collectionTree } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})
const collections = computed(() => {
  if (!collectionTree.value) {
    return []
  }
  function formatCollectionArray(collections: RouterOutput["collection"]["tree"]) {
    return [
      ...collections,
      ...collections.flatMap((collection: Collection) =>
        formatCollectionArray(collection.children ?? [])
      ),
    ]
  }
  return formatCollectionArray(collectionTree.value)
})
const collectionsToDisplay = computed(() => {
  if (props.collectionsId?.length) {
    return props.collectionsId
      .map((id) =>
        collections.value.find((collection: Collection) => collection.id === id)
      )
      .filter((item) => item)
  }
  return props.subCollections ?? []
})
</script>

<template>
  <div v-if="collectionsToDisplay && (editMode || collectionsToDisplay.length)">
    <div v-if="title" class="text-muted-foreground text-sm font-medium mb-0.5">
      {{ title }}
    </div>
    <CollectionRender :collections="collectionsToDisplay" :generate-route="generateRoute" :force-view="forceView"
      :placeholder="editMode ? 'No collections found.' : null" />
  </div>
</template>
