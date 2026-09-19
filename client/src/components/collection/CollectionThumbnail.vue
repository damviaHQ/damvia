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
  <img v-if="collection.thumbnailURL" :src="collection.thumbnailURL" :alt="collection.name" loading="lazy" class="size-full object-cover" />
  <div v-else-if="collection.sampleFiles?.length" class="grid size-full grid-cols-2 grid-rows-2 gap-1 bg-neutral-100 p-1">
    <div v-for="index in array" :key="index" class="min-h-0 overflow-hidden bg-neutral-50"><img v-if="collection.sampleFiles[index]?.thumbnailURL" :src="collection.sampleFiles[index].thumbnailURL" :alt="collection.sampleFiles[index].name" loading="lazy" class="size-full object-cover" /></div>
  </div>
  <div v-else class="flex size-full items-center justify-center bg-neutral-100"><collection-placeholder class="h-20 w-auto! [&>*]:fill-neutral-400" aria-hidden="true" /></div>
</template>
