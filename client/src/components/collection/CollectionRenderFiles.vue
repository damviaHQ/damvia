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
import CollectionDisplayGridFiles from "@/components/collection/CollectionDisplayGridFiles.vue"
import CollectionDisplayListFiles from "@/components/collection/CollectionDisplayListFiles.vue"
import { RouterOutput } from "@/services/server.ts"
import { registerPageListing } from "@/composables/usePageListings"
import { usePageFilter } from "@/composables/usePageFilter"
import { useGlobalStore } from "@/stores/globalStore"
import type { DisplayView } from "@/utils/displayPreferences"
import { computed } from "vue"

type Collection = RouterOutput["collection"]["findById"]
type CollectionFile = RouterOutput["collection"]["findById"]["files"][number]
type File = RouterOutput["collection"]["findById"]["files"][number]

const props = defineProps<{
  collection?: Collection
  files?: CollectionFile[]
  placeholder?: string | null
  forceView?: "list" | "grid" | "masonry" | null
  // A page block that asks for masonry also sets the size everyone sees.
  forceMasonrySize?: number | null
  // The path tooltip only exists in the grid; the list has its own columns.
  getPath?: (file: File) => string | undefined
}>()
const globalStore = useGlobalStore()

const rawFiles = computed<CollectionFile[]>(() => props.files ?? props.collection?.files ?? [])

// Tell the collection page which files it is actually showing, so its display
// preferences offer the asset types on screen. The whole list, not the narrowed
// one: the facets and the preferences must not move while the reader filters.
registerPageListing(computed(() => ({ files: rawFiles.value })))

// Narrowing happens here, above the choice between grid, masonry and list, so
// the three views obey the same filter without knowing it exists.
const pageFilter = usePageFilter()
const visibleFiles = computed(() => pageFilter.filterFiles(rawFiles.value))
const hiddenByFilter = computed(() => pageFilter.isActive.value && !visibleFiles.value.length)

const fileDisplayPreference = computed<DisplayView>(() => {
  const files = rawFiles.value
  const assetType = files?.[0]?.assetType
  if (props.forceView) {
    return props.forceView
  } else if (!assetType) {
    return globalStore.displayPreferences["asset_file"] ?? "grid"
  } else if (!files.every((file: File) => file.assetType?.id === assetType.id)) {
    return globalStore.displayPreferences["asset_file"] ?? "grid"
  }
  return globalStore.displayPreferences[assetType.id] ?? assetType.defaultDisplay
})
</script>

<template>
  <template v-if="!hiddenByFilter">
    <CollectionDisplayListFiles v-if="fileDisplayPreference === 'list'" :collection="collection" :files="visibleFiles"
      :placeholder="placeholder" />
    <CollectionDisplayGridFiles v-else :collection="collection" :files="visibleFiles" :placeholder="placeholder"
      :get-path="getPath" :uniform="forceView === 'grid'" :masonry="forceView === 'masonry'"
      :masonry-size="forceMasonrySize ?? null" />
  </template>
</template>
