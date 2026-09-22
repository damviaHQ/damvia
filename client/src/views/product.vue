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
import CollectionDialogAddToCollection from "@/components/collection/CollectionDialogAddToCollection.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { gridClasses, gridCardClasses, gridPreviewClasses } from "@/components/collection/gridStyles"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore.ts"
import { useQuery } from "@tanstack/vue-query"
import { ChevronLeft, FolderOpen, ImageOff } from "@lucide/vue"
import { computed, onUnmounted, ref, watch } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const globalStore = useGlobalStore()
const { plural } = useRecordLabel()

const id = computed(() => route.params.id as string)
const isAddToCollectionOpen = ref(false)
const shown = ref<string | null>(null)

const { data: product, isFetching, error } = useQuery({
  queryKey: computed(() => ["catalogue", "product", id.value]),
  queryFn: () => trpc.catalogue.get.query(id.value),
})

watch(product, (next) => { shown.value = next?.visuals[0]?.thumbnailURL ?? next?.thumbnailURL ?? null })

// The key column sits in the values too; it is already shown as the heading.
const values = computed(() => (product.value?.fields ?? [])
  .map((field) => ({ label: field.displayName, value: product.value?.metaData[field.name] }))
  .filter((entry) => !!entry.value))
const title = computed(() => values.value[0]?.value ?? product.value?.recordKey ?? "")

onUnmounted(() => {
  globalStore.setSelection(globalStore.selection.filter((item) => item.type !== "record"))
})

function addToCollection() {
  globalStore.setSelection([{ type: "record", id: id.value }])
  isAddToCollectionOpen.value = true
}
</script>

<template>
  <Loader v-if="isFetching && !product" :text="true" />
  <p v-else-if="error" role="alert" class="text-body text-neutral-700">This {{ plural.toLowerCase() }} entry is not available to you.</p>
  <article v-else-if="product" class="grid gap-8">
    <header class="flex flex-wrap items-center gap-3">
      <router-link :to="{ name: 'catalogue' }" class="flex items-center gap-1 text-body text-neutral-600 no-underline">
        <ChevronLeft class="size-4" aria-hidden="true" />{{ plural }}
      </router-link>
      <span class="text-body font-semibold text-neutral-900">{{ product.recordKey }}</span>
      <span v-if="product.readinessLabels.defined" class="flex items-center gap-2 text-caption"
        :class="product.readiness.ready ? 'text-green-700' : 'text-amber-700'">
        <span aria-hidden="true" class="size-1.5 rounded-full" :class="product.readiness.ready ? 'bg-green-600' : 'bg-amber-500'" />
        {{ product.readiness.ready ? product.readinessLabels.ready : `${product.readinessLabels.incomplete} · ${product.readiness.filled}/${product.readiness.total}` }}
      </span>
      <Button type="button" variant="outline" size="sm" class="ml-auto" @click="addToCollection">Add to collection</Button>
    </header>

    <div class="flex flex-wrap gap-8">
      <section class="min-w-[280px] flex-1" aria-label="Visuals">
        <div class="grid h-[420px] place-items-center overflow-hidden bg-neutral-100">
          <img v-if="shown" :src="shown" :alt="title" class="size-full object-contain" />
          <ImageOff v-else class="size-8 text-neutral-400" aria-hidden="true" />
        </div>
        <div v-if="product.visuals.length > 1" class="mt-3 flex flex-wrap gap-2">
          <button v-for="visual in product.visuals" :key="visual.id" type="button"
            class="size-16 overflow-hidden border bg-neutral-100 p-0"
            :class="shown === visual.thumbnailURL ? 'border-neutral-900' : 'border-transparent'"
            :aria-label="`Show view ${visual.view ?? ''}`" @click="shown = visual.thumbnailURL">
            <img :src="visual.thumbnailURL ?? ''" :alt="visual.view ?? ''" class="size-full object-contain" loading="lazy" />
          </button>
        </div>
      </section>

      <section class="min-w-[280px] flex-1" aria-label="Details">
        <h1 class="text-2xl font-semibold text-neutral-900">{{ title }}</h1>
        <dl class="mt-6 grid gap-0">
          <div v-for="entry in values" :key="entry.label" class="grid grid-cols-2 gap-4 border-b border-neutral-200 py-3">
            <dt class="text-body text-neutral-500">{{ entry.label }}</dt>
            <dd class="m-0 text-body text-neutral-900">{{ entry.value }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <section v-if="product.siblings.length" aria-labelledby="product-siblings-heading">
      <h2 id="product-siblings-heading" class="mb-4 text-body font-semibold text-neutral-900">
        Other entries of {{ product.family?.label }}
      </h2>
      <div class="flex flex-wrap gap-4">
        <router-link v-for="sibling in product.siblings" :key="sibling.id" :to="{ name: 'product', params: { id: sibling.id } }"
          class="grid w-[120px] gap-2 no-underline">
          <span class="grid h-[90px] place-items-center overflow-hidden bg-neutral-100">
            <img v-if="sibling.thumbnailURL" :src="sibling.thumbnailURL" :alt="sibling.recordKey" class="size-full object-contain" loading="lazy" />
            <ImageOff v-else class="size-5 text-neutral-400" aria-hidden="true" />
          </span>
          <span class="truncate text-caption text-neutral-600">{{ sibling.recordKey }}</span>
        </router-link>
      </div>
    </section>

    <section aria-labelledby="product-files-heading">
      <div class="mb-4 flex items-baseline gap-3">
        <h2 id="product-files-heading" class="text-body font-semibold text-neutral-900">Files linked to this entry</h2>
        <span class="text-caption text-neutral-500">{{ product.files.length }}</span>
      </div>
      <p v-if="!product.files.length" class="text-body text-neutral-600">No file you can open is linked to it yet.</p>
      <div v-else :class="gridClasses">
        <article v-for="file in product.files" :key="file.id" :class="gridCardClasses">
          <div :class="[gridPreviewClasses, 'grid place-items-center']">
            <img v-if="file.thumbnailURL" :src="file.thumbnailURL" :alt="file.name" class="size-full object-contain" loading="lazy" />
            <FolderOpen v-else class="size-6 text-neutral-400" aria-hidden="true" />
          </div>
          <p class="mt-2 truncate text-body text-neutral-900" :title="file.name">{{ file.name }}</p>
          <p v-if="file.view" class="text-caption text-neutral-500">View {{ file.view }}</p>
        </article>
      </div>
    </section>
    <CollectionDialogAddToCollection v-model:model-value="isAddToCollectionOpen" />
  </article>
</template>
