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
import { RouteLocationRaw } from "vue-router"
import BlockCollections from "./blocks/BlockCollections.vue"
import BlockFiles from "./blocks/BlockFiles.vue"
import BlockHero from "./blocks/BlockHero.vue"
import BlockImage from "./blocks/BlockImage.vue"
import BlockLastFiles from "./blocks/BlockLastFiles.vue"
import BlockProducts from "./blocks/BlockProducts.vue"
import BlockText from "./blocks/BlockText.vue"
import BlockVideo from "./blocks/BlockVideo.vue"
import type { Collection, EditorBlock, PageAssets } from "./types"

defineProps<{
  block: EditorBlock
  assets?: PageAssets
  collection?: Collection
  generateRoute: (collection: Collection) => RouteLocationRaw
  editing?: boolean
}>()
</script>

<template>
  <BlockHero v-if="block.type === 'hero'" :data="block.data" :assets="assets" :editing="editing" />
  <BlockText v-else-if="block.type === 'text'" :data="block.data" :editing="editing" />
  <BlockImage v-else-if="block.type === 'image'" :data="block.data" :assets="assets" :editing="editing" />
  <BlockVideo v-else-if="block.type === 'video'" :data="block.data" :assets="assets" :editing="editing" />
  <BlockCollections v-else-if="block.type === 'collections'" :data="block.data" :assets="assets"
    :collection="collection" :generate-route="generateRoute" :editing="editing" />
  <BlockFiles v-else-if="block.type === 'files'" :data="block.data" :collection="collection" :editing="editing" />
  <BlockLastFiles v-else-if="block.type === 'last_files'" :data="block.data" :collection="collection"
    :editing="editing" />
  <BlockProducts v-else-if="block.type === 'products'" :data="block.data" :collection="collection"
    :editing="editing" />
</template>
