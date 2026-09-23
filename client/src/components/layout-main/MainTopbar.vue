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
import MainFilterRail from "@/components/layout-main/MainFilterRail.vue"
import MainSearchBar from "@/components/layout-main/MainSearchBar.vue"
import MainTopbarDownloadNotification from "@/components/layout-main/MainTopbarDownloadNotification.vue"
import { useGlobalStore, type SelectionItem } from "@/stores/globalStore"
import { Combine, Download, SquareX } from "@lucide/vue"
import { defineAsyncComponent, ref } from "vue"
const globalStore = useGlobalStore()
const isDownloadAssetModalOpen = ref(false)
const isAddToCollectionModalOpen = ref(false)
const singleDownload = ref<SelectionItem | null>(null)
const selectionButtonClasses = "inline-flex min-h-9 items-center gap-2 px-2 text-body font-medium leading-5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
function openDownload() {
  const [item] = globalStore.selection
  if (globalStore.selection.length === 1 && item.type !== 'collection') singleDownload.value = item
  else isDownloadAssetModalOpen.value = true
}
function updateSingleDownload(id: string | null) {
  singleDownload.value = id && singleDownload.value ? { ...singleDownload.value, id } : null
}
const CollectionDialogAddToCollection = defineAsyncComponent(() => import("@/components/collection/CollectionDialogAddToCollection.vue"))
const CollectionModalDownloadUnique = defineAsyncComponent(() => import("@/components/collection/CollectionModalDownloadUnique.vue"))
const CollectionModalDownloadMulti = defineAsyncComponent(() => import("@/components/collection/CollectionModalDownloadMulti.vue"))
</script>
<template>
  <header class="client-topbar z-10 shrink-0 border-b border-neutral-200 bg-white" aria-label="Page tools">
    <div class="flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 max-md:pl-16">
      <MainSearchBar class="min-w-[min(100%,240px)] basis-[240px]" />
      <div class="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <div v-if="globalStore.selection.length > 0"
        class="dashboard-layout-topbar__selector flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
        <div class="flex items-center gap-1 font-medium text-neutral-500">
          <button type="button" class="grid size-9 shrink-0 place-items-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" @click="globalStore.clearSelection()"
            title="Clear selection" aria-label="Clear selection">
            <SquareX class="size-5 shrink-0 stroke-[1.75]" aria-hidden="true" />
          </button>
          <div class="whitespace-nowrap">
            {{ globalStore.selection.length }} item{{
              globalStore.selection.length > 1 ? "s" : ""
            }}
            selected
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1">
          <button type="button" :class="selectionButtonClasses" @click="openDownload"
            title="Download selection" aria-label="Download selection">
            <Download class="size-5 shrink-0 stroke-[1.75]" aria-hidden="true" />Download
          </button>
          <button v-if="globalStore.user?.role !== 'guest'" type="button" @click="isAddToCollectionModalOpen = true"
            title="Add selection to your collection" aria-label="Add selection to your collection" :class="selectionButtonClasses">
            <Combine class="size-5 shrink-0 stroke-[1.75]" aria-hidden="true" />Add to collection
          </button>
        </div>
      </div>
        <div id="client-page-actions" class="flex flex-wrap items-center gap-1 empty:hidden" />
        <MainTopbarDownloadNotification />
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 px-5">
    <div id="client-page-context" class="min-w-0 max-w-full pb-3 empty:hidden" />
      <MainFilterRail />
    </div>
  </header>
  <CollectionModalDownloadUnique v-if="singleDownload" :model-value="singleDownload.id"
    :record-id="singleDownload.type === 'record' ? singleDownload.id : undefined"
    :product-ids="globalStore.productNavigationIds" @update:model-value="updateSingleDownload" />
  <CollectionModalDownloadMulti v-model="isDownloadAssetModalOpen" />
  <CollectionDialogAddToCollection v-model="isAddToCollectionModalOpen" />
</template>

<style scoped>
.dashboard-layout-topbar__selector + #client-page-actions:not(:empty)::before {
  content: "";
  width: 1px;
  height: 20px;
  flex: none;
  margin-inline: 4px 8px;
  background: var(--color-neutral-300);
}
</style>
