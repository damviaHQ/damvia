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
import { useGlobalStore } from "@/stores/globalStore"
import { computed } from "vue"
import { RouteLocationRaw } from "vue-router"

type Collection = RouterOutput["collection"]["findById"]

const props = defineProps<{
  collections: Collection[]
  generateRoute: (collection: Collection) => RouteLocationRaw
  placeholder?: string | null
  forceView?: "list" | "grid" | null
}>()
const globalStore = useGlobalStore()

const folderDisplayPreference = computed<"list" | "grid">(
  () => (props.forceView || globalStore.displayPreferences["asset_folder"]) ?? "grid"
)
</script>

<template>
  <CollectionDisplayListCollection v-if="folderDisplayPreference === 'list'" :collections="collections"
    :generate-route="generateRoute" :placeholder="placeholder" />
  <CollectionDisplayGrid v-else :collections="collections" :generate-route="generateRoute" :placeholder="placeholder" />
</template>
