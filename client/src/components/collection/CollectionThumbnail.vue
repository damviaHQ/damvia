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
import collectionPlaceholder from "@/assets/collection-placeholder.svg"
import { RouterOutput } from "@/services/server.ts"
import { computed } from "vue"

type Collection = RouterOutput["collection"]["findById"][number]

defineProps<{ collection: Collection }>()

const array = computed(() => new Array(4).fill(0).map((_, index) => index))
</script>

<template>
  <div v-if="collection.thumbnailURL" class="collection-thumbnail__thumbnail-wrapper">
    <img :src="collection.thumbnailURL" :alt="collection.name" />
  </div>
  <div v-else-if="collection.sampleFiles.length > 0" class="collection-thumbnail__items-wrapper">
    <div v-for="index in array" class="collection-thumbnail__item">
      <img v-if="collection.sampleFiles[index]" :src="collection.sampleFiles[index].thumbnailURL"
        :alt="collection.sampleFiles[index].name" />
    </div>
  </div>
  <div v-else class="collection-thumbnail__placeholder-wrapper">
    <collection-placeholder class="collection-thumbnail__placeholder" />
  </div>
</template>

<style scoped>
.collection-thumbnail__thumbnail-wrapper {
  @apply fill-neutral-800;
  min-width: 276px;
  width: 276px;
  min-height: 212px;
  height: 212px;
}

.collection-thumbnail__thumbnail-wrapper img {
  max-width: 276px;
  width: 100%;
  max-height: 212px;
  height: 100%;
  object-fit: cover;
}

.collection-thumbnail__items-wrapper {
  @apply bg-neutral-100 hover:opacity-50;
  display: grid;
  grid-template-columns: repeat(auto-fill, 134px);
  gap: 8px;
  min-width: 276px;
  width: 276px;
  min-height: 212px;
  height: 212px;
  transition: background 0.2s ease;
}

.collection-thumbnail__item {
  @apply bg-neutral-200;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 102px;
  max-height: 102px;
  width: 134px;
  max-width: 134px;
}

.collection-thumbnail__item img {
  height: 100%;
  max-height: 102px;
  width: 100%;
  max-width: 134px;
  object-fit: cover;
}

.collection-thumbnail__placeholder-wrapper {
  @apply flex items-end min-w-[276px] min-h-[212px] w-[276px] h-[212px] bg-neutral-100 transition-colors hover:bg-neutral-200;
}

.collection-thumbnail__placeholder {
  @apply block h-[140px] w-auto cursor-pointer object-cover mx-auto my-auto [&>*]:fill-neutral-500;
}
</style>
