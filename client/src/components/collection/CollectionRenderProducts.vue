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
import ProductCard from "@/components/catalogue/ProductCard.vue"
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import { gridClasses } from "@/components/collection/gridStyles"
import { listTableClasses } from "@/components/collection/listStyles"
import { registerPageListing } from "@/composables/usePageListings"
import { usePageFilter } from "@/composables/usePageFilter"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { RouterOutput } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore.ts"
import { productDisplayGroup, type DisplayProduct } from "@/utils/displayPreferences"
import { ArrowDown, ArrowUp, ArrowUpDown } from "@lucide/vue"
import { computed, onUnmounted, ref, watch } from "vue"

type Product = RouterOutput["catalogue"]["list"]["products"][number]
type Field = RouterOutput["catalogue"]["list"]["fields"][number]

const props = defineProps<{
  products: Product[]
  fields: Field[]
  cardTitleField: string | null
  collectionId?: string
  forceView?: "grid" | "list" | null
  serverFiltered?: boolean
}>()
const emit = defineEmits<{ sort: [sort: { column: string, direction: 'asc' | 'desc' }] }>()
const globalStore = useGlobalStore()
const { singular, plural } = useRecordLabel()
const pageFilter = usePageFilter()
const sort = ref<{ column: string, direction: 'asc' | 'desc' }>({ column: 'recordKey', direction: 'asc' })

const filterable = computed<DisplayProduct[]>(() => props.products.map(product => ({
  id: product.id,
  collectionId: props.collectionId,
  recordKey: product.recordKey,
  titleField: props.cardTitleField,
  name: [product.recordKey, props.cardTitleField ? product.metaData[props.cardTitleField] : null].filter(Boolean).join(' '),
  record: {
    attributes: props.fields.flatMap(field => {
      const value = product.metaData[field.name] ?? null
      const values = field.valueType === 'multi_select' && value ? value.split('|').filter(Boolean) : [value]
      return values.map(value => ({ id: field.id ?? field.name, name: field.name, displayName: field.displayName, value, facetable: field.facetable }))
    }),
  },
})))
registerPageListing(computed(() => ({ products: filterable.value })))

const visibleProducts = computed(() => {
  if (props.serverFiltered || !pageFilter.isActive.value) return props.products
  const kept = new Set(pageFilter.filterFiles(filterable.value).map(product => product.id))
  return props.products.filter(product => kept.has(product.id))
})
const displayGroup = computed(() => productDisplayGroup(filterable.value, plural.value))
const columns = computed(() => globalStore.displayDetails.record?.columns ?? displayGroup.value.defaultColumns)
const visibleFields = computed(() => columns.value.map(name => props.fields.find(field => field.name === name)).filter((field): field is Field => !!field && field.name !== props.cardTitleField))
const view = computed(() => props.forceView ?? globalStore.displayPreferences.record ?? 'grid')
const selectedIds = computed(() => globalStore.selection.filter(item => item.type === "record").map(item => item.id))
const selected = computed(() => visibleProducts.value.filter(product => selectedIds.value.includes(product.id)))
const sortedProducts = computed(() => [...visibleProducts.value].sort((a, b) => {
  const first = sort.value.column === 'recordKey' ? a.recordKey : a.metaData[sort.value.column] ?? ''
  const second = sort.value.column === 'recordKey' ? b.recordKey : b.metaData[sort.value.column] ?? ''
  return first.localeCompare(second, undefined, { numeric: true }) * (sort.value.direction === 'asc' ? 1 : -1)
}))
const navigationProducts = computed(() => view.value === 'list' ? sortedProducts.value : visibleProducts.value)
const navigationSource = globalStore.registerProductNavigationSource()
watch(navigationProducts, products => globalStore.updateProductNavigationSource(navigationSource, products.map(product => product.id)), { immediate: true })
onUnmounted(() => globalStore.removeProductNavigationSource(navigationSource))

function toggle(id: string, selected: boolean) {
  if (selected && !selectedIds.value.includes(id)) globalStore.addToSelection({ type: "record", id })
  else if (!selected) globalStore.removeFromSelection({ type: "record", id })
}

function toggleAll() {
  const allSelected = selected.value.length === visibleProducts.value.length
  visibleProducts.value.forEach(product => toggle(product.id, !allSelected))
}

function sortBy(column: string) {
  sort.value = { column, direction: sort.value.column === column && sort.value.direction === 'asc' ? 'desc' : 'asc' }
  emit('sort', sort.value)
}
</script>

<template>
  <div v-if="view !== 'list'" :class="gridClasses">
    <ProductCard v-for="product in visibleProducts" :key="product.id" :product="product" :card-title-field="cardTitleField"
      :collection-id="collectionId" :selected="selectedIds.includes(product.id)" @update:selected="toggle(product.id, $event)" />
  </div>
  <div v-else class="relative w-full overflow-x-auto text-neutral-600">
    <table :class="listTableClasses">
      <thead>
        <tr>
          <th scope="col" :aria-sort="sort.column === 'recordKey' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined">
            <div class="flex items-center gap-4">
              <CollectionCheckbox label="Select all products" :state="selected.length && selected.length === visibleProducts.length ? 'check' : selected.length ? 'undetermined' : false" @click="toggleAll" />
              <button type="button" class="flex items-center gap-1.5" @click="sortBy('recordKey')">
                {{ singular }}<component :is="sort.column !== 'recordKey' ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown" class="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </th>
          <th v-for="field in visibleFields" :key="field.name" scope="col" :aria-sort="sort.column === field.name ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined">
            <button type="button" class="flex items-center gap-1.5" @click="sortBy(field.name)">
              {{ field.displayName }}<component :is="sort.column !== field.name ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown" class="size-3.5" aria-hidden="true" />
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="product in sortedProducts" :key="product.id" class="group">
          <td>
            <div class="flex items-center gap-4">
              <CollectionCheckbox :label="`Select ${product.recordKey}`" :state="selectedIds.includes(product.id) ? 'check' : false"
                @click="toggle(product.id, !selectedIds.includes(product.id))" />
              <router-link :to="{ name: 'product', params: { id: product.id }, query: collectionId ? { collection: collectionId } : {} }" class="flex min-w-0 items-center gap-4 text-neutral-800 no-underline hover:text-neutral-950">
                <img v-if="product.thumbnailURL" :src="product.thumbnailURL" alt="" class="h-12 w-20 min-w-20 bg-neutral-100 object-contain" loading="lazy" />
                <thumbnailPlaceholder v-else class="h-12 w-20 min-w-20 bg-neutral-100 fill-neutral-400" aria-hidden="true" />
                <span class="min-w-0 max-w-[400px]">
                  <span class="block truncate">{{ product.recordKey }}</span>
                  <span v-if="cardTitleField" class="mt-1 block truncate text-xs text-neutral-500">{{ product.metaData[cardTitleField] || "\u00a0" }}</span>
                </span>
              </router-link>
            </div>
          </td>
          <td v-for="field in visibleFields" :key="field.name"><span class="block max-w-xs truncate" :title="product.metaData[field.name]">{{ product.metaData[field.name] || '—' }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-if="!visibleProducts.length" role="status" class="py-12 text-center text-sm text-neutral-500">{{ pageFilter.isActive.value ? `No ${plural.toLowerCase()} match these filters.` : `No ${plural.toLowerCase()} here yet.` }}</p>
</template>
