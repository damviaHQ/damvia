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
import Loader from "@/components/Loader.vue"
import CollectionRenderProducts from "@/components/collection/CollectionRenderProducts.vue"
import { PackageSearch } from "@lucide/vue"
import BlockPlaceholder from "./BlockPlaceholder.vue"
import { trpc } from "@/services/server.ts"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"
import type { Collection } from "../types"

// The catalogue is paginated server side; a block has no page controls of its
// own, so it asks for as much as one call allows and points to the full
// catalogue when a collection outgrows it.
const BLOCK_PAGE_SIZE = 96

const props = defineProps<{ data: any; collection?: Collection; editing?: boolean }>()
const { plural, lowerPlural } = useRecordLabel()

const collectionId = computed(() => props.data?.collectionId || props.collection?.id)
const { data: catalogue, isPending, error } = useQuery({
  queryKey: computed(() => ["catalogue", "list", collectionId.value]),
  queryFn: () => trpc.catalogue.list.query({ collectionId: collectionId.value as string, offset: 0, limit: BLOCK_PAGE_SIZE }),
  enabled: computed(() => !!collectionId.value),
})
const forceView = computed(() => (["list", "grid"].includes(props.data?.layout) ? props.data.layout : null))
const products = computed(() => catalogue.value?.products ?? [])
const fields = computed(() => catalogue.value?.fields ?? [])
const cardTitleField = computed(() => catalogue.value?.cardTitleField ?? null)
const truncated = computed(() => (catalogue.value?.total ?? 0) > products.value.length)
</script>

<template>
  <div v-if="editing || collectionId">
    <div v-if="data.title" class="mb-0.5 text-sm font-medium text-muted-foreground">{{ data.title }}</div>
    <BlockPlaceholder v-if="editing && !products.length" :icon="PackageSearch" :title="plural"
      :explanation="`The ${lowerPlural} of the collection appear here, each with its reference and its visuals.`"
      :reason="data.collectionId
        ? `The collection you chose holds no ${lowerPlural} yet.`
        : `This block shows the ${lowerPlural} of this collection, and there are none yet. Add them by reference or with rules.`" />
    <Loader v-else-if="isPending" :text="true" />
    <p v-else-if="error" role="alert" class="text-body text-red-700">{{ error.message }}</p>
    <template v-else>
      <CollectionRenderProducts :collection-id="collectionId" :products="products" :fields="fields" :card-title-field="cardTitleField"
        :force-view="forceView" />
      <router-link v-if="!products.length" :to="{ name: 'catalogue' }" class="block text-center text-body text-neutral-600 underline">Browse {{ lowerPlural }}</router-link>
      <router-link v-if="truncated" :to="{ name: 'catalogue', query: { collection: collectionId } }"
        class="mt-2 inline-block text-body text-neutral-600">
        Showing {{ products.length }} of {{ catalogue?.total }} {{ lowerPlural }}. See them all
      </router-link>
    </template>
  </div>
</template>
