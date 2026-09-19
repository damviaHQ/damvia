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
import { embedSrc, resolveMedia } from "../media"
import type { PageAssets } from "../types"

const props = defineProps<{ data: any; assets?: PageAssets; editing?: boolean }>()
const media = computed(() => resolveMedia(props.data?.media, props.assets))
const embed = computed(() => embedSrc(props.data?.media))
</script>

<template>
  <div v-if="embed" class="aspect-video w-full">
    <iframe :src="embed" class="h-full w-full" title="Video" all* referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen />
  </div>
  <video v-else-if="media" :src="media.url" class="w-full" controls />
  <p v-else-if="editing" class="text-sm text-neutral-500 italic">
    {{ data?.media ? "This video is no longer available." : "No video chosen yet." }}
  </p>
</template>
