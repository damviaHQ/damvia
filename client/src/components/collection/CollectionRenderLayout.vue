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
import CollectionRenderFiles from "@/components/collection/CollectionRenderFiles.vue"
import PageRenderer from "@/components/page-renderer/PageRenderer.vue"
import { usePageFilter } from "@/composables/usePageFilter"
import { RouterOutput } from "@/services/server.ts"
import { matchesCollection, matchesFile } from "@/utils/pageFilter"
import { computed } from "vue"
import { RouteLocationRaw } from "vue-router"

type Collection = RouterOutput["collection"]["findById"]
type File = RouterOutput["collection"]["findById"]["files"][number]

const props = defineProps<{
  collection: Collection
  generateRoute: (collection: Collection) => RouteLocationRaw
}>()

const childrenCollections = computed<Collection[]>(() => props.collection.children)

// A section whose every item is filtered out goes away, heading included, so the
// page does not keep a title over nothing.
const pageFilter = usePageFilter()
const showCollections = computed(() => !!childrenCollections.value?.length &&
  (!pageFilter.isActive.value || childrenCollections.value.some(collection => matchesCollection(collection, pageFilter.state.value))))
const showFiles = computed(() => !!props.collection?.files &&
  (!pageFilter.isActive.value || props.collection.files.some((file: File) => matchesFile(file, pageFilter.state.value))))

const getGlobalAssetType = computed(() => {
  if (!props.collection.files?.length) return null

  const firstAssetTypeId = props.collection.files[0].assetTypeId
  const allSameAssetType = props.collection.files.every(
    (f: File) => f.assetTypeId === firstAssetTypeId
  )

  return allSameAssetType ? props.collection.files[0].assetType : null
})
</script>

<template>
  <PageRenderer v-if="collection.page" :blocks="collection.page.blocks ?? []" :assets="collection.page.assets"
    :collection="collection" :generate-route="generateRoute" />
  <div v-else class="collection-layout-renderer__container flex flex-col gap-8 mb-6">
    <div v-if="showCollections">
      <div class="mb-4 text-[12px] font-semibold text-neutral-500">Collections</div>
      <CollectionRender :collections="childrenCollections" :generate-route="generateRoute" />
    </div>
    <div v-if="showFiles">
      <div class="mb-4 text-[12px] font-semibold text-neutral-500">
        {{ getGlobalAssetType?.name ?? "Files" }}
      </div>
      <CollectionRenderFiles :collection="collection" />
    </div>
  </div>
</template>
