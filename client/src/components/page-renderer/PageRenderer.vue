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
import PageBlockView from "./PageBlockView.vue"
import { spanClass } from "./layout"
import type { Collection, EditorBlock, PageAssets } from "./types"

// The one grid on the page: viewers and the editor render blocks identically,
// so what an author arranges is exactly what a reader gets.
defineProps<{
  blocks: EditorBlock[]
  assets?: PageAssets
  collection?: Collection
  generateRoute: (collection: Collection) => RouteLocationRaw
}>()
</script>

<template>
  <div class="page-renderer grid grid-cols-1 gap-4 md:grid-cols-6 md:items-start">
    <PageBlockView v-for="(block, index) in blocks" :key="block.id ?? index" :class="spanClass(block.size)"
      :block="block" :assets="assets" :collection="collection" :generate-route="generateRoute" />
  </div>
</template>
