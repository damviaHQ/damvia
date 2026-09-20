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
import { LayoutGrid } from "@lucide/vue"
import { computed } from "vue"
import { RouteLocationRaw } from "vue-router"
import type { Collection, PageAssets } from "../types"
import BlockPlaceholder from "./BlockPlaceholder.vue"

const props = defineProps<{
  data: any
  assets?: PageAssets
  collection?: Collection
  generateRoute: (collection: Collection) => RouteLocationRaw
  editing?: boolean
}>()

// Chosen collections are resolved by the server alongside the page, with the
// thumbnails their cards preview. Reading them from the collection tree gave
// no previews, because that tree is built without sample files.
const collections = computed(() => {
  if (props.data?.collectionsId?.length) {
    return props.data.collectionsId
      .map((id: string) => props.assets?.collections?.[id])
      .filter((collection: unknown) => !!collection)
  }
  return props.collection?.children ?? []
})
const forceView = computed(() => (["list", "grid"].includes(props.data?.layout) ? props.data.layout : null))
</script>

<template>
  <div v-if="editing || collections.length">
    <div v-if="data.title" class="mb-0.5 text-sm font-medium text-muted-foreground">{{ data.title }}</div>
    <BlockPlaceholder v-if="editing && !collections.length" :icon="LayoutGrid" title="Collections"
      explanation="Every collection listed here appears as a card, for readers to open."
      :reason="data.collectionsId?.length
        ? 'The collections you chose are not available at the moment.'
        : 'This block follows the sub-collections of this collection, and there are none yet. Add one, or choose collections in the block settings.'" />
    <CollectionRender v-else :collections="collections" :generate-route="generateRoute" :force-view="forceView" />
  </div>
</template>
