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
import { computed } from "vue"
import type { PageAssets } from "../types"

// One place decides what a block link points at, so collections, pages and
// external addresses behave the same wherever an author can attach one.
const props = defineProps<{ link?: any; assets?: PageAssets; disabled?: boolean }>()

const target = computed(() => {
  const link = props.link
  if (!link || props.disabled) {
    return null
  }
  if (link.kind === "collection") {
    return props.assets?.collections?.[link.collectionId]
      ? { to: { name: "collection", params: { id: link.collectionId } } }
      : null
  }
  if (link.kind === "page") {
    return props.assets?.pages?.[link.pageId] ? { to: { name: "page", params: { id: link.pageId } } } : null
  }
  return { href: link.url, external: link.external !== false }
})
</script>

<template>
  <router-link v-if="target?.to" :to="target.to" class="block"><slot /></router-link>
  <a v-else-if="target?.href" :href="target.href" :target="target.external ? '_blank' : '_self'"
    :rel="target.external ? 'noopener noreferrer' : undefined" class="block"><slot /></a>
  <slot v-else />
</template>
