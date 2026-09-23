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
import CollectionDialogAddToCollection from "@/components/collection/CollectionDialogAddToCollection.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
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
const page = ref(0)
const isAddToCollectionOpen = ref(false)

// Narrowing a catalogue is the business of whoever builds it: a reader gets
// the list they were given, and the search box over it.
const queryInput = computed(() => ({
  collectionId: collectionId.value,
  search: debouncedSearch.value || undefined,
}))

watch([collectionId, debouncedSearch], () => { page.value = 0 })

const { data, isFetching } = useQuery({
  queryKey: computed(() => ["catalogue", "list", queryInput.value, page.value]),
  queryFn: () => trpc.catalogue.list.query({ ...queryInput.value, offset: page.value * PAGE_SIZE, limit: PAGE_SIZE }),
})
const { data: collection } = useQuery({
  enabled: computed(() => !!collectionId.value),
  queryKey: computed(() => ["collection", collectionId.value]),
  queryFn: () => trpc.collection.findById.query(collectionId.value as string),
})

const products = computed(() => data.value?.products ?? [])
const total = computed(() => data.value?.total ?? 0)
const cardTitleField = computed(() => data.value?.cardTitleField ?? null)
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
  <div>
    <section class="min-w-0 flex-1">
      <header class="mb-6 grid gap-2">
        <h1 class="text-2xl font-semibold text-neutral-900">{{ collection?.name ?? plural }}</h1>
        <p v-if="collection?.description" class="text-body text-neutral-600">{{ collection.description }}</p>
        <div class="flex items-center gap-3">
          <Input v-model="search" type="search" class="max-w-[320px]" :placeholder="`Search ${lowerPlural}`" :aria-label="`Search ${lowerPlural}`" />
          <span role="status" class="text-caption text-neutral-500">{{ total }} {{ lowerPlural }}</span>
          <Button v-if="selectedIds.length" type="button" variant="outline" size="sm" class="ml-auto" @click="isAddToCollectionOpen = true">
            Add {{ selectedIds.length }} to a collection
          </Button>
        </div>
      </header>

      <Loader v-if="isFetching && !products.length" :text="true" />
      <p v-else-if="!products.length" class="text-body text-neutral-600">No {{ lowerPlural }} here yet.</p>
      <div v-else :class="gridClasses">
        <ProductCard v-for="product in products" :key="product.id" :product="product" :card-title-field="cardTitleField"
          :selected="selectedIds.includes(product.id)" @update:selected="toggle(product.id, $event)" />
      </div>

      <nav v-if="pages > 1" class="mt-8 flex items-center gap-3" aria-label="Pages">
        <Button type="button" variant="outline" size="sm" :disabled="page === 0" @click="page = page - 1">Previous</Button>
        <span class="text-caption text-neutral-600">Page {{ page + 1 }} of {{ pages }}</span>
        <Button type="button" variant="outline" size="sm" :disabled="page + 1 >= pages" @click="page = page + 1">Next</Button>
      </nav>
    </section>
    <CollectionDialogAddToCollection v-model:model-value="isAddToCollectionOpen" />
  </div>
</template>
