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
import CatalogueFacetPanel from "@/components/catalogue/CatalogueFacetPanel.vue"
import ProductCard from "@/components/catalogue/ProductCard.vue"
import CollectionDialogAddToCollection from "@/components/collection/CollectionDialogAddToCollection.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { gridClasses } from "@/components/collection/gridStyles"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore.ts"
import { useQuery } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { computed, onUnmounted, ref, watch } from "vue"
import { useRoute } from "vue-router"

const PAGE_SIZE = 48

const route = useRoute()
const globalStore = useGlobalStore()
const { plural, lowerPlural } = useRecordLabel()

const collectionId = computed(() => (route.query.collection as string | undefined) || undefined)
const search = ref("")
const debouncedSearch = refDebounced(search, 300)
const chosen = ref<Record<string, string[]>>({})
const readiness = ref<"ready" | "incomplete" | undefined>(undefined)
// A catalogue can be read model by model when an administrator named a family
// field; opening one model lists the entries it holds.
const groupByFamily = ref(false)
const openFamily = ref<{ key: string, label: string } | null>(null)
const page = ref(0)
const isAddToCollectionOpen = ref(false)

// Values chosen inside one field widen the list, and the fields narrow each
// other: that is exactly what the record filters already express.
const filters = computed(() => Object.entries(chosen.value)
  .filter(([, values]) => values.length)
  .map(([column, values]) => ({ column, op: "has_any" as const, values })))
const queryInput = computed(() => ({
  collectionId: collectionId.value,
  readiness: readiness.value,
  familyKey: openFamily.value?.key,
  search: debouncedSearch.value || undefined,
  filters: filters.value.length ? filters.value : undefined,
}))

watch([collectionId, debouncedSearch, filters, readiness, openFamily], () => { page.value = 0 })
watch(groupByFamily, () => { openFamily.value = null })

const { data, isFetching } = useQuery({
  queryKey: computed(() => ["catalogue", "list", queryInput.value, page.value]),
  queryFn: () => trpc.catalogue.list.query({ ...queryInput.value, offset: page.value * PAGE_SIZE, limit: PAGE_SIZE }),
})
const { data: families } = useQuery({
  queryKey: computed(() => ["catalogue", "families", queryInput.value]),
  queryFn: () => trpc.catalogue.families.query({ ...queryInput.value, familyKey: undefined, offset: 0, limit: 96 }),
})
const { data: facets } = useQuery({
  queryKey: computed(() => ["catalogue", "facets", queryInput.value]),
  queryFn: () => trpc.catalogue.facets.query(queryInput.value),
})
const { data: collection } = useQuery({
  enabled: computed(() => !!collectionId.value),
  queryKey: computed(() => ["collection", collectionId.value]),
  queryFn: () => trpc.collection.findById.query(collectionId.value as string),
})

const products = computed(() => data.value?.products ?? [])
const total = computed(() => data.value?.total ?? 0)
const fields = computed(() => data.value?.fields ?? [])
const keyLabel = computed(() => data.value?.keyColumnName ?? "Key")
const labels = computed(() => data.value?.readinessLabels ?? { ready: "Ready to use", incomplete: "To complete", defined: false })
const pages = computed(() => Math.ceil(total.value / PAGE_SIZE))
const selectedIds = computed(() => globalStore.selection.filter((item) => item.type === "record").map((item) => item.id))

// The selection is shared with the library, where a product means nothing:
// leaving the catalogue drops the products picked here.
onUnmounted(() => {
  globalStore.setSelection(globalStore.selection.filter((item) => item.type !== "record"))
})

function toggle(id: string, selected: boolean) {
  if (selected) globalStore.addToSelection({ type: "record", id })
  else globalStore.removeFromSelection({ type: "record", id })
}
</script>

<template>
  <div class="flex gap-8">
    <CatalogueFacetPanel v-model="chosen" :facets="facets ?? []" />
    <section class="min-w-0 flex-1">
      <header class="mb-6 grid gap-2">
        <h1 class="text-2xl font-semibold text-neutral-900">{{ collection?.name ?? plural }}</h1>
        <p v-if="collection?.description" class="text-body text-neutral-600">{{ collection.description }}</p>
        <div class="flex items-center gap-3">
          <Input v-model="search" type="search" class="max-w-[320px]" :placeholder="`Search ${lowerPlural}`" :aria-label="`Search ${lowerPlural}`" />
          <select v-if="labels.defined" v-model="readiness" class="record-native-select" aria-label="Readiness">
            <option :value="undefined">All {{ lowerPlural }}</option>
            <option value="ready">{{ labels.ready }}</option>
            <option value="incomplete">{{ labels.incomplete }}</option>
          </select>
          <label v-if="(families?.total ?? 0) > 0" class="flex items-center gap-2 text-body text-neutral-700">
            <Checkbox v-model="groupByFamily" />By model
          </label>
          <span role="status" class="text-caption text-neutral-500">{{ total }} {{ lowerPlural }}</span>
          <Button v-if="selectedIds.length" type="button" variant="outline" size="sm" class="ml-auto" @click="isAddToCollectionOpen = true">
            Add {{ selectedIds.length }} to a collection
          </Button>
        </div>
      </header>

      <nav v-if="openFamily" class="mb-4 flex items-center gap-2 text-body">
        <button type="button" class="border-none bg-transparent p-0 text-neutral-600 underline" @click="openFamily = null">All models</button>
        <span class="text-neutral-400" aria-hidden="true">/</span>
        <span class="font-semibold text-neutral-900">{{ openFamily.label }}</span>
      </nav>

      <div v-if="groupByFamily && !openFamily" class="flex flex-wrap gap-4">
        <button v-for="family in families?.rows ?? []" :key="family.key" type="button"
          class="w-[220px] cursor-pointer border border-neutral-200 bg-white p-4 text-left"
          @click="openFamily = { key: family.key, label: family.label }">
          <span class="block text-body font-semibold text-neutral-900">{{ family.label }}</span>
          <span class="block text-caption text-neutral-500">{{ family.count }} {{ family.count === 1 ? 'entry' : 'entries' }}</span>
        </button>
      </div>

      <Loader v-else-if="isFetching && !products.length" :text="true" />
      <p v-else-if="!products.length" class="text-body text-neutral-600">No {{ lowerPlural }} here yet.</p>
      <div v-else :class="gridClasses">
        <ProductCard v-for="product in products" :key="product.id" :product="product" :fields="fields" :key-label="keyLabel" :labels="labels"
          :selected="selectedIds.includes(product.id)" @update:selected="toggle(product.id, $event)" />
      </div>

      <nav v-if="pages > 1 && !(groupByFamily && !openFamily)" class="mt-8 flex items-center gap-3" aria-label="Pages">
        <Button type="button" variant="outline" size="sm" :disabled="page === 0" @click="page = page - 1">Previous</Button>
        <span class="text-caption text-neutral-600">Page {{ page + 1 }} of {{ pages }}</span>
        <Button type="button" variant="outline" size="sm" :disabled="page + 1 >= pages" @click="page = page + 1">Next</Button>
      </nav>
    </section>
    <CollectionDialogAddToCollection v-model:model-value="isAddToCollectionOpen" />
  </div>
</template>
