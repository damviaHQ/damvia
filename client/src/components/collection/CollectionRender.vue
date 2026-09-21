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
import CollectionDisplayListCollection from "@/components/collection/CollectionDisplayListCollection.vue"
import { RouterOutput } from "@/services/server.ts"
import { registerPageListing } from "@/composables/usePageListings"
import { usePageFilter } from "@/composables/usePageFilter"
import { useGlobalStore } from "@/stores/globalStore"
import { computed } from "vue"
import { RouteLocationRaw } from "vue-router"

type Collection = RouterOutput["collection"]["findById"]

const props = defineProps<{
  collections: Collection[]
  generateRoute: (collection: Collection) => RouteLocationRaw
  placeholder?: string | null
  forceView?: "list" | "grid" | null
  // The path tooltip only exists in the grid; the list has its own columns.
  getPath?: (collection: Collection) => string | undefined
}>()
const globalStore = useGlobalStore()

// Chosen collections are not the sub-collections of the page's own collection,
// so the page says which cards it draws rather than letting anyone assume. The
// whole list, so the filter bar counts against the page, not against itself.
registerPageListing(computed(() => ({ collections: props.collections })))

// Narrowing happens here, above the choice between cards and rows, so both obey
// the same filter without knowing it exists.
const pageFilter = usePageFilter()
const visibleCollections = computed(() => pageFilter.filterCollections(props.collections))
const hiddenByFilter = computed(() => pageFilter.isActive.value && !visibleCollections.value.length)

// Collections are cards or rows; masonry only ever applies to files.
const folderDisplayPreference = computed<"list" | "grid">(() =>
  (props.forceView || globalStore.displayPreferences["asset_folder"]) === "list" ? "list" : "grid"
)
</script>

<template>
  <template v-if="!hiddenByFilter">
    <CollectionDisplayListCollection v-if="folderDisplayPreference === 'list'" :collections="visibleCollections"
      :generate-route="generateRoute" :placeholder="placeholder" />
    <CollectionDisplayGrid v-else :collections="visibleCollections" :generate-route="generateRoute" :placeholder="placeholder"
      :get-path="getPath" />
  </template>
</template>
