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
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"
import type { Collection } from "../types"

const props = defineProps<{ data: any; collection?: Collection; editing?: boolean }>()

const { data: lastFiles } = useQuery({
  queryKey: computed(() => ["collection", props.collection?.id, "last-files"]),
  queryFn: () => trpc.collection.lastAddedFiles.query({ collectionId: props.collection?.id ?? null }),
})
const forceView = computed(() => (["list", "grid"].includes(props.data?.layout) ? props.data.layout : null))
</script>

<template>
  <div v-if="lastFiles && (editing || lastFiles.length)">
    <div v-if="data.title" class="mb-0.5 text-sm font-medium text-muted-foreground">{{ data.title }}</div>
    <CollectionRenderFiles :files="lastFiles" :force-view="forceView"
      :placeholder="editing ? 'No recent files added.' : null" />
  </div>
</template>
