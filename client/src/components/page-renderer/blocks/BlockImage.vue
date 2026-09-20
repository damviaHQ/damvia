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
import { imageHeightOf, resolveMedia } from "../media"
import type { PageAssets } from "../types"
import BlockLink from "./BlockLink.vue"

const props = defineProps<{ data: any; assets?: PageAssets; editing?: boolean }>()
const media = computed(() => resolveMedia(props.data?.media, props.assets))

// A picture keeps its proportions and stays within the height its author
// dragged it to, rather than filling the whole page.
const heightStyle = computed(() => `max-height:${imageHeightOf(props.data?.height)}px`)
</script>

<template>
  <figure v-if="media" class="m-0">
    <BlockLink :link="data.link" :assets="assets" :disabled="editing">
      <img :src="media.displayURL" :alt="data.alt || ''" class="h-auto w-full object-contain object-left"
        :style="heightStyle" />
    </BlockLink>
    <figcaption v-if="data.caption" class="mt-1 text-sm text-neutral-500">{{ data.caption }}</figcaption>
  </figure>
  <p v-else-if="editing" class="text-sm text-neutral-500 italic">
    {{ data?.media ? "This image is no longer available." : "No image chosen yet." }}
  </p>
</template>
