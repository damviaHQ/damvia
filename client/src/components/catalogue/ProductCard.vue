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
type Field = RouterOutput["catalogue"]["list"]["fields"][number]

// One card for one product: its main visual, the visuals that come with it,
// its key and the first fields an administrator made visible.
const props = defineProps<{
  product: Product
  fields: Field[]
  keyLabel: string
  labels: { ready: string, incomplete: string, defined: boolean }
  selected: boolean
}>()
const emit = defineEmits<{ "update:selected": [boolean] }>()

// The first two visible fields carry the card; the rest live on the product
// page rather than crowding the grid.
const summary = computed(() => props.fields
  .slice(0, 2)
  .map((field) => ({ label: field.displayName, value: props.product.metaData[field.name] }))
  .filter((entry) => !!entry.value))
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
    <router-link :to="{ name: 'product', params: { id: product.id } }" class="mt-3 grid gap-1 no-underline">
      <span class="text-caption uppercase tracking-[.08em] text-neutral-500">{{ keyLabel }} · {{ product.recordKey }}</span>
      <span v-for="entry in summary" :key="entry.label" class="text-body text-neutral-900">{{ entry.value }}</span>
    </router-link>
    <div v-if="product.visuals.length" class="mt-3 flex items-center gap-2">
      <span v-for="visual in product.visuals" :key="visual.id" class="size-10 overflow-hidden bg-neutral-100">
        <img :src="visual.thumbnailURL ?? ''" :alt="visual.view ?? product.recordKey" class="size-full object-contain" loading="lazy" />
      </span>
      <span v-if="overflow" class="grid size-10 place-items-center bg-neutral-100 text-caption text-neutral-600">+{{ overflow }}</span>
    </div>
    <p class="mt-3 flex items-center gap-2 border-t border-neutral-200 pt-2 text-caption text-neutral-500">
      <template v-if="labels.defined">
        <span aria-hidden="true" class="size-1.5 rounded-full" :class="product.readiness.ready ? 'bg-green-600' : 'bg-amber-500'" />
        <span :class="product.readiness.ready ? 'text-green-700' : 'text-amber-700'">
          {{ product.readiness.ready ? labels.ready : `${labels.incomplete} · ${product.readiness.filled}/${product.readiness.total}` }}
        </span>
      </template>
      <span class="ml-auto">{{ product.fileCount }} {{ product.fileCount === 1 ? 'file' : 'files' }}</span>
    </p>
  </article>
</template>
