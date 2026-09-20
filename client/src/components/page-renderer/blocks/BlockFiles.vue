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
import CollectionRenderFiles from "@/components/collection/CollectionRenderFiles.vue"
import { Files } from "@lucide/vue"
import BlockPlaceholder from "./BlockPlaceholder.vue"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"
import type { Collection } from "../types"

const props = defineProps<{ data: any; collection?: Collection; editing?: boolean }>()

const collectionId = computed(() => props.data?.collectionId || props.collection?.id)
const { data: collection } = useQuery({
  queryKey: computed(() => ["collection", collectionId.value]),
  queryFn: () => trpc.collection.findById.query(collectionId.value as string),
  enabled: computed(() => !!collectionId.value),
})
const forceView = computed(() => (["list", "grid", "masonry"].includes(props.data?.layout) ? props.data.layout : null))
</script>

<template>
  <div v-if="collection && (editing || collection.files?.length)">
    <div v-if="data.title" class="mb-0.5 text-sm font-medium text-muted-foreground">{{ data.title }}</div>
    <BlockPlaceholder v-if="editing && !collection.files?.length" :icon="Files" title="Files"
      explanation="Every file of the collection appears here, with its preview and its download."
      :reason="data.collectionId
        ? 'The collection you chose holds no file yet.'
        : 'This block shows the files of this collection, and there are none yet. They appear as soon as files are added.'" />
    <CollectionRenderFiles v-else :collection="collection" :force-view="forceView"
      :force-masonry-size="data.masonrySize ?? null" />
  </div>
</template>
