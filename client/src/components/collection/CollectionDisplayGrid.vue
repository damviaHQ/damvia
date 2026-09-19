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
  <div class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-5 gap-y-6">
    <article v-for="collection in collections" :key="collection.id" class="group min-w-0">
      <div class="relative border bg-neutral-50 transition-colors" :class="isCollectionSelected(collection) ? 'border-neutral-800 ring-1 ring-neutral-800' : 'border-neutral-200 hover:border-neutral-400'">
        <router-link :to="generateRoute(collection)" class="block aspect-[4/3] overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-800" :aria-label="`Open ${collection.name}`"><CollectionThumbnail :collection="collection" /></router-link>
        <CollectionCheckbox v-if="collection.numberOfFiles > 0" class="absolute left-3 top-3 z-10 group-hover:opacity-100 group-focus-within:opacity-100" :class="isCollectionSelected(collection) ? 'opacity-100' : 'opacity-0'" :aria-label="`Select ${collection.name}`" :state="isCollectionSelected(collection) ? 'check' : false" @click.stop="handleSelection($event, collection)" />
        <div class="absolute right-3 top-3 z-10 bg-white group-hover:opacity-100 group-focus-within:opacity-100" :class="elementsOpen[collection.id] ? 'opacity-100' : 'opacity-0'"><CollectionDropdownActions :collection="collection" @update:open="elementsOpen[collection.id] = $event" /></div>
      </div>
      <div class="mt-2.5 flex min-w-0 items-center gap-2"><Folder class="size-5 text-neutral-400" /><router-link :to="generateRoute(collection)" class="truncate text-[13px] font-medium text-neutral-800 hover:text-neutral-950" :title="collection.name">{{ collection.name }}</router-link><span v-if="collection.draft" class="ml-auto bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">Draft</span></div>
    </article>
    <p v-if="!collections?.length && placeholder" class="col-span-full py-12 text-center text-sm text-neutral-500">{{ placeholder }}</p>
  </div>
</template>
