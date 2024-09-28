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
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"
import { trpc } from "../../services/server.ts"
import CollectionRenderFiles from "../collection/CollectionRenderFiles.vue"

const props = defineProps<{
  title?: string
  collectionId: string
  editMode: boolean
  forceView?: "list" | "grid" | null
}>()

const { data: collection } = useQuery({
  queryKey: computed(() => ["collection", props.collectionId]),
  queryFn: () => trpc.collection.findById.query(props.collectionId),
})
</script>

<template>
  <div v-if="collection && (editMode || collection.files?.length)">
    <div v-if="title" class="text-muted-foreground text-sm font-medium mb-0.5">
      {{ title }}
    </div>
    <collection-render-files v-if="collection" :collection="collection" :force-view="forceView"
      :placeholder="editMode ? 'No files found.' : null" />
  </div>
</template>
