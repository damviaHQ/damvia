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
import { useGlobalStore } from "@/stores/globalStore"
import { computed } from "vue"

type Collection = RouterOutput["collection"]["findById"]
type CollectionFile = RouterOutput["collection"]["findById"]["files"][number]
type File = RouterOutput["collection"]["findById"]["files"][number]

const props = defineProps<{
  collection?: Collection
  files?: CollectionFile[]
  placeholder?: string | null
  forceView?: "list" | "grid" | null
}>()
const globalStore = useGlobalStore()

const fileDisplayPreference = computed<"list" | "grid">(() => {
  const files = props.files || props.collection.files
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
  <CollectionDisplayListFiles v-if="fileDisplayPreference === 'list'" :collection="collection" :files="files"
    :placeholder="placeholder" />
  <CollectionDisplayGridFiles v-else :collection="collection" :files="files" :placeholder="placeholder" />
</template>
