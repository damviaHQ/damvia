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
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionDropdownActions from "@/components/collection/CollectionDropdownActions.vue"
import CollectionThumbnail from "@/components/collection/CollectionThumbnail.vue"
import { RouterOutput } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { Folder } from "lucide-vue-next"
import { ref } from "vue"
import { RouteLocationRaw } from "vue-router"

type Collection = RouterOutput["collection"]["findById"][number]

defineProps<{
  collections: Collection[]
  generateRoute: (collection: Collection) => RouteLocationRaw
  placeholder?: string | null
}>()

const globalStore = useGlobalStore()
const elementsOpen = ref<Record<string, boolean>>({})

function isCollectionSelected(collection: Collection) {
  return globalStore.selection.some(
    (selection) => selection.type === "collection" && selection.id === collection.id
  )
}

function handleSelection(event: Event, collection: Collection) {
  event.preventDefault()
  if (isCollectionSelected(collection)) {
    globalStore.removeFromSelection({ id: collection.id, type: "collection" })
    return
  }
  globalStore.addToSelection({ id: collection.id, type: "collection" })
}
</script>

<template>
  <div class="collection-grid-collections__root">
    <div v-if="collections?.length" v-for="collection in collections" :key="collection.id"
      class="collection-grid-collections__item flex flex-col items-center relative group">
      <router-link :to="generateRoute(collection)" class="collection-grid-collections__collection relative" :class="[
        isCollectionSelected(collection)
          ? 'outline outline-[2.5px] outline-neutral-500 before:bg-opacity-20'
          : 'before:bg-opacity-0 group-hover:before:bg-opacity-10',
        'before:absolute before:inset-0 before:bg-neutral-900 before:transition-opacity',
      ]">
        <CollectionCheckbox v-if="collection.numberOfFiles > 0" @click.stop="handleSelection($event, collection)"
          :class="[
            'collection-grid-collections__collection-selection z-10',
            isCollectionSelected(collection) &&
            'collection-grid-collections__collection-selection--selected',
          ]" :state="isCollectionSelected(collection) ? 'check' : false" />
        <CollectionThumbnail :collection="collection" />
      </router-link>
      <div class="collection-grid-collections__collection-actions" :class="elementsOpen[collection.id] &&
        'collection-grid-collections__collection-actions--open'
        ">
        <CollectionDropdownActions :collection="collection" @update:open="elementsOpen[collection.id] = $event" />
      </div>
      <div class="flex items-center w-[276px] py-1.5">
        <Folder class="text-neutral-600" />
        <div
          class="w-full px-1.5 text-base text-neutral-600 font-normal whitespace-nowrap overflow-hidden text-ellipsis"
          :title="collection.name">
          {{ collection.name }}
          <template v-if="collection.draft"> (draft)</template>
        </div>
      </div>
    </div>
    <div v-else-if="placeholder">
      {{ placeholder }}
    </div>
  </div>
</template>

<style scoped>
.collection-grid-collections__root {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.collection-grid-collections__collection-selection {
  display: none;
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  justify-content: center;
  align-items: center;
  z-index: 3;
}

.collection-grid-collections__collection-selection--selected,
.collection-grid-collections__collection-selection--selected svg {
  display: flex;
  z-index: 2;
}

.collection-grid-collections__collection:hover .collection-grid-collections__collection-selection {
  display: flex;
  align-items: center;
  justify-content: center;
}

.collection-grid-collections__collection-actions {
  display: none;
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.collection-grid-collections__item:hover .collection-grid-collections__collection-actions,
.collection-grid-collections__collection-actions--open {
  display: block;
}
</style>
