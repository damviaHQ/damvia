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
import Block from "@/components/page-editor/PageEditorBlock.vue"
import type { Block as BlockType } from "@/layouts/LayoutPageEditor.vue"
import { RouterOutput } from "@/services/server.ts"
import { groupBy, sortBy, sumBy } from "lodash"
import { computed, ref, watch } from "vue"
import { RouteLocationRaw } from "vue-router"

type Collection = RouterOutput["collection"]["findById"]
type File = RouterOutput["collection"]["findById"]["files"][number]

const childrenCollections = ref<Collection[]>([])
const props = defineProps<{
  collection: Collection
  generateRoute: (collection: Collection) => RouteLocationRaw
}>()

watch(
  () => props.collection,
  (value) => {
    childrenCollections.value = value.children
  },
  { deep: true, immediate: true }
)

const rows = computed(() => {
  return sortBy(
    Object.entries(
      groupBy(props.collection.page?.blocks ?? [], (block: BlockType) => block.row)
    ),
    ([value]: [string]) => parseInt(value, 10)
  ).map(([value, blocks]: any) => ({
    value: parseInt(value, 10),
    columns: sortBy(blocks, "column"),
  }))
})

const getGlobalAssetType = computed(() => {
  if (!props.collection.files?.length) return null

  const firstAssetTypeId = props.collection.files[0].assetTypeId
  const allSameAssetType = props.collection.files.every(
    (f: File) => f.assetTypeId === firstAssetTypeId
  )

  return allSameAssetType ? props.collection.files[0].assetType : null
})

function getBlockStyle(blocks: BlockType[], block: BlockType) {
  return { width: `${(block.width / sumBy(blocks, "width")) * 100}%` }
}
</script>

<template>
  <div v-if="collection.page" class="collection-layout-renderer__block-row flex flex-col gap-4">
    <div v-for="row in rows" :key="row.value" class="collection-layout-renderer__block-col flex flex-row gap-4">
      <block v-for="block in row.columns" :key="block.id" :block="block" :collection="collection"
        :page="collection.page" :style="getBlockStyle(row.columns, block)" :generate-route="generateRoute" />
    </div>
  </div>
  <div v-else class="collection-layout-renderer__container flex flex-col gap-8 mb-6">
    <div v-if="childrenCollections?.length">
      <div class="mb-4 text-[12px] font-semibold text-neutral-500">Collections</div>
      <CollectionRender :collections="childrenCollections" :generate-route="generateRoute" />
    </div>
    <div v-if="collection?.files">
      <div class="mb-4 text-[12px] font-semibold text-neutral-500">
        {{ getGlobalAssetType?.name ?? "Files" }}
      </div>
      <CollectionRenderFiles :collection="collection" />
    </div>
  </div>
</template>
