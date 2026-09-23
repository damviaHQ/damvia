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
import ProductCard from "@/components/catalogue/ProductCard.vue"
import { Checkbox } from "@/components/ui/checkbox"
import { gridClasses } from "@/components/collection/gridStyles"
import { listTableClasses } from "@/components/collection/listStyles"
import { registerPageListing } from "@/composables/usePageListings"
import { usePageFilter } from "@/composables/usePageFilter"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { RouterOutput } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore.ts"
import type { FilterableFile } from "@/utils/pageFilter"
import { ImageOff } from "@lucide/vue"
import { computed } from "vue"

type Product = RouterOutput["catalogue"]["list"]["products"][number]
type Field = RouterOutput["catalogue"]["list"]["fields"][number]

// Products are drawn the way files are, grid or list, so a reader meets one
// catalogue and not a second application. The chrome around them, selection,
// action bar and filters, belongs to the page holding this block.
const props = defineProps<{
  products: Product[]
  fields: Field[]
  cardTitleField: string | null
  forceView?: "grid" | "list" | null
}>()
const globalStore = useGlobalStore()
const { singular } = useRecordLabel()

// A product joins the filter as its reference plus the fields an
// administrator made facetable, which is the shape the file facets already
// read. The field name is its identity: stable, and unique within a catalogue.
const facetable = computed(() => props.fields.filter((field) => field.facetable))
function asFilterable(product: Product): FilterableFile {
  return {
    name: product.recordKey,
    record: {
      attributes: facetable.value.map((field) => ({
        id: field.name,
        name: field.name,
        displayName: field.displayName,
        value: product.metaData[field.name] ?? null,
      })),
    },
  }
}

// Tell the collection page which products it is actually showing, so its
// filters offer the fields on screen. The whole list, not the narrowed one:
// the facets must not move while the reader filters.
registerPageListing(computed(() => ({ products: props.products.map(asFilterable) })))

// Narrowing happens here, above the choice between grid and list, so both
// views obey the same filter without knowing it exists.
const pageFilter = usePageFilter()
const visibleProducts = computed(() => {
  if (!pageFilter.isActive.value) {
    return props.products
  }
  const kept = new Set(pageFilter.filterFiles(props.products.map(asFilterable)).map((item) => item.name))
  return props.products.filter((product) => kept.has(product.recordKey))
})
const hiddenByFilter = computed(() => pageFilter.isActive.value && !visibleProducts.value.length)

const view = computed(() => props.forceView ?? "grid")
const selectedIds = computed(() => globalStore.selection.filter((item) => item.type === "record").map((item) => item.id))
const titleOf = (product: Product) => (props.cardTitleField ? product.metaData[props.cardTitleField] : null) || null

function toggle(id: string, selected: boolean) {
  if (selected) globalStore.addToSelection({ type: "record", id })
  else globalStore.removeFromSelection({ type: "record", id })
}
</script>

<template>
  <template v-if="!hiddenByFilter">
    <div v-if="view === 'grid'" :class="gridClasses">
      <ProductCard v-for="product in visibleProducts" :key="product.id" :product="product" :card-title-field="cardTitleField"
        :selected="selectedIds.includes(product.id)" @update:selected="toggle(product.id, $event)" />
    </div>

    <table v-else :class="listTableClasses">
      <thead>
        <tr>
          <th scope="col"><span class="sr-only">Select</span></th>
          <th scope="col"><span class="sr-only">Visual</span></th>
          <th scope="col">{{ singular }}</th>
          <th v-if="cardTitleField" scope="col">Name</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="product in visibleProducts" :key="product.id" class="group">
          <td>
            <Checkbox :model-value="selectedIds.includes(product.id)" :aria-label="`Select ${product.recordKey}`"
              @update:model-value="toggle(product.id, !!$event)" />
          </td>
          <td>
            <span class="grid size-10 place-items-center overflow-hidden bg-neutral-100">
              <img v-if="product.thumbnailURL" :src="product.thumbnailURL" :alt="product.recordKey"
                class="size-full object-contain" loading="lazy" />
              <ImageOff v-else class="size-4 text-neutral-400" aria-hidden="true" />
            </span>
          </td>
          <td>
            <router-link :to="{ name: 'product', params: { id: product.id } }" class="text-neutral-900 no-underline">
              {{ product.recordKey }}
            </router-link>
          </td>
          <td v-if="cardTitleField" class="text-neutral-500">{{ titleOf(product) ?? "-" }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
