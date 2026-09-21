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
import { trpc } from "@/services/server.ts"
import { usePageFilter } from "@/composables/usePageFilter"
import { matchesCollection } from "@/utils/pageFilter"
import { useQuery } from "@tanstack/vue-query"
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
// A page never shows a card for the collection it belongs to, including on
// pages saved before that became impossible to choose.
const chosen = computed<string[]>(() =>
  (props.data?.collectionsId ?? []).filter((id: string) => id !== props.collection?.id)
)

// A collection picked a moment ago is not in the page's assets yet, since
// those are resolved when the page is read. Asking for the missing ones keeps
// the editor honest without waiting for a save.
const missing = computed(() => chosen.value.filter((id) => !props.assets?.collections?.[id]))
const { data: resolved } = useQuery({
  queryKey: computed(() => ["page", "collection-previews", missing.value.join(",")]),
  queryFn: () => trpc.page.collectionPreviews.query({ collectionIds: missing.value }),
  enabled: computed(() => missing.value.length > 0),
})

const collections = computed(() => {
  const listed = chosen.value.length
    ? chosen.value
      .map((id: string) => props.assets?.collections?.[id] ?? (resolved.value as any)?.[id])
      .filter((collection: unknown) => !!collection)
    : props.collection?.children ?? []
  if (!props.data?.layoutFilter) return listed
  return listed.filter((collection: any) => !!collection.page === (props.data.layoutFilter === "with_layout"))
})
const forceView = computed(() => (["list", "grid"].includes(props.data?.layout) ? props.data.layout : null))

// The renderer below narrows the cards; the block asks the same question so its
// title goes away with it rather than standing over nothing. Never while
// editing, where the author is looking at the block itself.
const pageFilter = usePageFilter()
const hiddenByFilter = computed(() => !props.editing && pageFilter.isActive.value &&
  !collections.value.some((collection: any) => matchesCollection(collection, pageFilter.state.value)))
</script>

<template>
  <div v-if="(editing || collections.length) && !hiddenByFilter">
    <div v-if="data.title" class="mb-0.5 text-sm font-medium text-muted-foreground">{{ data.title }}</div>
    <BlockPlaceholder v-if="editing && !collections.length" :icon="LayoutGrid" title="Collections"
      explanation="Every collection listed here appears as a card, for readers to open."
      :reason="data.collectionsId?.length
        ? 'The collections you chose are not available at the moment.'
        : 'This block follows the sub-collections of this collection, and there are none yet. Add one, or choose collections in the block settings.'" />
    <CollectionRender v-else :collections="collections" :generate-route="generateRoute" :force-view="forceView" />
  </div>
</template>
