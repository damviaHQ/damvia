<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { computed, provide, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useQuery } from "@tanstack/vue-query"
import { ChevronRight, Folder, Share2, Star } from "@lucide/vue"
import Loader from "@/components/Loader.vue"
import PageRenderer from "@/components/page-renderer/PageRenderer.vue"
import { PAGE_FILES_RENDERER } from "@/components/page-renderer/filesRenderer"
import { useCollectionFavorites } from "@/composables/useCollectionFavorites"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import type { MobileFile } from "../composables"
import { usePreviewQuery, useMobileSelection } from "../composables"
import MobileTopBar from "../components/MobileTopBar.vue"
import MobileFileGrid from "../components/MobileFileGrid.vue"
import MobilePreview from "../components/MobilePreview.vue"
import MobileSelectionBar from "../components/MobileSelectionBar.vue"
import MobilePageFiles from "../components/MobilePageFiles.vue"
import MobileShareSheet from "../components/MobileShareSheet.vue"

provide(PAGE_FILES_RENDERER, MobilePageFiles)
const route = useRoute()
const router = useRouter()
const store = useGlobalStore()
const { plural } = useRecordLabel()
const favorites = useCollectionFavorites()
const selection = useMobileSelection()
const id = computed(() => route.params.id as string)
const selecting = ref(false)
const sharing = ref(false)

const { data: collection, isLoading, error } = useQuery({
  queryKey: computed(() => ["collection", id.value]),
  queryFn: () => trpc.collection.findById.query(id.value),
})
watch(error, (value) => { if (value) router.replace({ name: "collection-404", params: { id: id.value } }) })

const files = computed(() => (collection.value?.files ?? []) as MobileFile[])
const children = computed(() => collection.value?.children ?? [])
const hasPage = computed(() => !!collection.value?.page?.blocks?.length)
const isGuest = computed(() => store.user?.role === "guest")
// The same visibility rule as the desktop menu: editors see Share unless the
// collection hides it from its audience.
const canShare = computed(() => !isGuest.value && !!collection.value?.canEdit && (collection.value?.visibleActions?.share ?? true))
const preview = usePreviewQuery(() => files.value)
const favorite = computed(() => collection.value ? favorites.isFavorite(collection.value.id) : false)
function stopSelecting() {
  selecting.value = false
  selection.clear()
}
</script>

<template>
  <MobileTopBar :title="collection?.name ?? 'Collection'" :back="true">
    <button v-if="collection && !isGuest" type="button" class="grid size-11 place-items-center" :aria-label="favorite ? 'Remove from favorites' : 'Add to favorites'" :aria-pressed="favorite" @click="favorites.toggle(collection as any)">
      <Star :size="20" aria-hidden="true" :fill="favorite ? 'currentColor' : 'none'" />
    </button>
    <button v-if="canShare" type="button" class="grid size-11 place-items-center" aria-label="Share collection" @click="sharing = true"><Share2 :size="20" aria-hidden="true" /></button>
  </MobileTopBar>
  <Loader v-if="isLoading" :text="true" />
  <article v-else-if="collection" class="grid gap-6 pt-4 pb-24">
    <p v-if="collection.description" class="px-4 text-[var(--dv-text-secondary)]">{{ collection.description }}</p>

    <div v-if="hasPage" class="px-4">
      <PageRenderer stacked :blocks="collection.page!.blocks as any" :assets="(collection.page as any).assets" :collection="collection as any"
        :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
    </div>

    <template v-else>
      <section v-if="children.length" aria-labelledby="collections-heading">
        <h2 id="collections-heading" class="px-4 pb-2 text-sm font-semibold text-[var(--dv-text-secondary)]">Collections</h2>
        <router-link v-for="child in children" :key="child.id" :to="{ name: 'collection', params: { id: child.id }, query: route.query.from ? { from: route.query.from } : {} }"
          class="flex min-h-[52px] items-center gap-3 border-b border-[var(--dv-color-line)] px-4 no-underline text-inherit">
          <Folder :size="20" aria-hidden="true" /><span class="flex-1 truncate">{{ child.name }}</span><ChevronRight :size="18" aria-hidden="true" />
        </router-link>
      </section>

      <router-link v-if="collection.numberOfRecords" :to="{ name: 'catalogue', query: { collection: collection.id } }"
        class="mx-4 flex min-h-[52px] items-center gap-3 rounded-[var(--dv-radius-md)] border border-[var(--dv-color-line)] px-4 no-underline text-inherit">
        <span class="flex-1">{{ collection.numberOfRecords }} {{ plural }}</span><ChevronRight :size="18" aria-hidden="true" />
      </router-link>

      <section v-if="files.length" aria-labelledby="files-heading" class="grid gap-2">
        <div class="flex items-center px-4">
          <h2 id="files-heading" class="flex-1 text-sm font-semibold text-[var(--dv-text-secondary)]">{{ files.length }} files</h2>
          <button type="button" class="min-h-11 px-2 font-medium" @click="selecting ? stopSelecting() : (selecting = true)">{{ selecting ? "Done" : "Select" }}</button>
        </div>
        <MobileFileGrid :files="files" :selecting="selecting" @open="preview.open" />
      </section>
      <p v-if="!files.length && !children.length && !collection.numberOfRecords" class="px-4 text-center text-[var(--dv-text-secondary)]">This collection is empty.</p>
    </template>

    <MobilePreview v-if="preview.index.value >= 0" :files="files" :index="preview.index.value" @close="preview.close" @show="preview.show" />
    <MobileSelectionBar @done="selecting = false" />
    <MobileShareSheet v-if="canShare" v-model:open="sharing" :collection-id="collection.id" :collection-name="collection.name" />
  </article>
</template>
