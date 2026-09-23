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
import { Checkbox } from "@/components/ui/checkbox"
import { gridCardClasses, gridPreviewClasses } from "@/components/collection/gridStyles"
import { RouterOutput } from "@/services/server.ts"
import { ImageOff } from "@lucide/vue"
import { computed } from "vue"

type Product = RouterOutput["catalogue"]["list"]["products"][number]

// One card for one product: its main visual, the visuals that come with it,
// its reference and the one field an administrator chose as a title. Every
// line is always drawn, so a product missing a value keeps the same height as
// its neighbours and the grid stays a grid.
const props = defineProps<{
  product: Product
  cardTitleField: string | null
  selected: boolean
}>()
const emit = defineEmits<{ "update:selected": [boolean] }>()

const title = computed(() => (props.cardTitleField ? props.product.metaData[props.cardTitleField] : null) || null)
const overflow = computed(() => Math.max(0, props.product.visualCount - props.product.visuals.length))
</script>

<template>
  <article :class="gridCardClasses">
    <div :class="[gridPreviewClasses, 'grid place-items-center']">
      <img v-if="product.thumbnailURL" :src="product.thumbnailURL" :alt="product.recordKey" class="size-full object-contain" loading="lazy" />
      <ImageOff v-else class="size-6 text-neutral-400" aria-hidden="true" />
      <Checkbox :model-value="selected" class="absolute left-2 top-2 bg-white"
        :aria-label="`Select ${product.recordKey}`" @update:model-value="emit('update:selected', !!$event)" />
    </div>
    <router-link :to="{ name: 'product', params: { id: product.id } }" class="mt-3 grid gap-0.5 no-underline">
      <span class="truncate text-body text-neutral-900">{{ product.recordKey }}</span>
      <span v-if="cardTitleField" class="truncate text-caption text-neutral-500">{{ title ?? "&nbsp;" }}</span>
    </router-link>
    <div class="mt-3 flex min-h-10 items-center gap-2">
      <span v-for="visual in product.visuals" :key="visual.id" class="size-10 overflow-hidden bg-neutral-100">
        <img :src="visual.thumbnailURL ?? ''" :alt="visual.view ?? product.recordKey" class="size-full object-contain" loading="lazy" />
      </span>
      <span v-if="overflow" class="grid size-10 place-items-center bg-neutral-100 text-caption text-neutral-600">+{{ overflow }}</span>
    </div>
  </article>
</template>
