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
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import { gridCardClasses, gridPreviewClasses } from "@/components/collection/gridStyles"
import { RouterOutput } from "@/services/server.ts"
import { computed } from "vue"

type Product = RouterOutput["catalogue"]["list"]["products"][number]

const props = defineProps<{
  product: Product
  cardTitleField: string | null
  selected: boolean
  collectionId?: string
}>()
const emit = defineEmits<{ "update:selected": [boolean] }>()

const title = computed(() => (props.cardTitleField ? props.product.metaData[props.cardTitleField] : null) || null)
const overflow = computed(() => Math.max(0, props.product.visualCount - props.product.visuals.length))
</script>

<template>
  <article :class="gridCardClasses">
    <div :class="[gridPreviewClasses, selected && 'outline-2 outline-neutral-500']">
      <router-link :to="{ name: 'product', params: { id: product.id }, query: collectionId ? { collection: collectionId } : {} }"
        class="absolute inset-0 flex size-full items-center justify-center p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-800"
        :aria-label="`Open ${product.recordKey}`">
        <img v-if="product.thumbnailURL" :src="product.thumbnailURL" :alt="product.recordKey" class="size-full object-contain" loading="lazy" decoding="async" />
        <thumbnailPlaceholder v-else class="h-20 w-auto! fill-neutral-400" aria-hidden="true" />
      </router-link>
      <CollectionCheckbox :label="`Select ${product.recordKey}`"
        class="absolute left-3 top-3 z-10 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
        :class="selected ? 'opacity-100' : 'opacity-0'" :state="selected ? 'check' : false" @click="emit('update:selected', !selected)" />
    </div>
    <router-link :to="{ name: 'product', params: { id: product.id }, query: collectionId ? { collection: collectionId } : {} }"
      class="mt-2.5 block truncate text-sm font-normal text-neutral-800 no-underline hover:text-neutral-950" :title="product.recordKey">
      {{ product.recordKey }}
    </router-link>
    <p v-if="cardTitleField" class="mt-1 truncate text-xs text-neutral-500" :title="title ?? undefined">{{ title ?? "\u00a0" }}</p>
    <div v-if="product.visuals.length" class="mt-2 flex items-center gap-1" :aria-label="`${product.visualCount} visuals`">
      <span v-for="visual in product.visuals" :key="visual.id" class="size-7 overflow-hidden bg-neutral-100">
        <img :src="visual.thumbnailURL ?? ''" :alt="visual.view ?? product.recordKey" class="size-full object-contain" loading="lazy" />
      </span>
      <span v-if="overflow" class="grid size-7 place-items-center bg-neutral-100 text-caption text-neutral-600">+{{ overflow }}</span>
    </div>
  </article>
</template>
