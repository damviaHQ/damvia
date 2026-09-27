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
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useQuery } from "@tanstack/vue-query"
import { ChevronRight, Folder, Plus } from "@lucide/vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { useCollectionFavorites } from "@/composables/useCollectionFavorites"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useMyCollections } from "@/composables/useMyCollections"
import { trpc } from "@/services/server"
import type { MobileFile } from "../composables"
import { usePreviewQuery } from "../composables"
import MobileFileGrid from "../components/MobileFileGrid.vue"
import MobilePreview from "../components/MobilePreview.vue"

// Favorites and the person's own collections: one tab, two views, following
// the two desktop routes so shared links keep working.
const route = useRoute()
const router = useRouter()
const toast = useGlobalToast()
const tab = computed(() => route.name === "my-collections" ? "collections" : "favorites")
const { data: favoriteFiles, isLoading: filesLoading } = useQuery({ queryKey: ["favorites", "files-mobile"], queryFn: () => trpc.favorite.list.query() })
const favoriteCollections = useCollectionFavorites()
const { myCollections, isLoading: collectionsLoading, refetch } = useMyCollections()
const files = computed(() => (favoriteFiles.value ?? []) as MobileFile[])
const preview = usePreviewQuery(() => files.value)
const creating = ref(false)
const name = ref("")

async function create() {
  if (!name.value.trim()) return
  try {
    const created = await trpc.collection.createUserCollection.mutate({ name: name.value.trim() })
    await refetch()
    creating.value = false
    name.value = ""
    router.push({ name: "collection", params: { id: created.id } })
  } catch (error) {
    toast.error((error as Error).message)
  }
}
</script>

<template>
  <h1 class="sr-only">Saved</h1>
  <div class="sticky top-0 z-30 flex border-b border-[var(--dv-color-line)] bg-[var(--dv-surface-panel)] px-4 pt-[env(safe-area-inset-top)]" role="tablist" aria-label="Saved">
    <router-link :to="{ name: 'favorites' }" replace role="tab" :aria-selected="tab === 'favorites'" class="min-h-12 flex-1 content-center text-center no-underline text-inherit" :class="tab === 'favorites' && 'border-b-2 border-[var(--dv-text-primary)] font-semibold'">Favorites</router-link>
    <router-link :to="{ name: 'my-collections' }" replace role="tab" :aria-selected="tab === 'collections'" class="min-h-12 flex-1 content-center text-center no-underline text-inherit" :class="tab === 'collections' && 'border-b-2 border-[var(--dv-text-primary)] font-semibold'">My collections</router-link>
  </div>

  <section v-if="tab === 'favorites'" class="grid gap-4 pt-4 pb-24">
    <Loader v-if="filesLoading" :text="true" />
    <template v-else>
      <div v-if="favoriteCollections.data.value?.length">
        <h2 class="px-4 pb-1 text-sm font-semibold text-[var(--dv-text-secondary)]">Collections</h2>
        <router-link v-for="collection in favoriteCollections.data.value" :key="collection.id" :to="{ name: 'collection', params: { id: collection.id } }"
          class="flex min-h-[52px] items-center gap-3 border-b border-[var(--dv-color-line)] px-4 no-underline text-inherit">
          <Folder :size="20" aria-hidden="true" /><span class="flex-1 truncate">{{ collection.name }}</span><ChevronRight :size="18" aria-hidden="true" />
        </router-link>
      </div>
      <div v-if="files.length" class="grid gap-2">
        <h2 class="px-4 text-sm font-semibold text-[var(--dv-text-secondary)]">Files</h2>
        <MobileFileGrid :files="files" @open="preview.open" />
      </div>
      <p v-if="!files.length && !favoriteCollections.data.value?.length" class="px-4 pt-8 text-center text-[var(--dv-text-secondary)]">Tap the star on a file or a collection to find it here.</p>
    </template>
  </section>

  <section v-else class="grid gap-3 pt-4 pb-24">
    <Loader v-if="collectionsLoading" :text="true" />
    <template v-else>
      <router-link v-for="collection in myCollections" :key="collection.id" :to="{ name: 'collection', params: { id: collection.id } }"
        class="flex min-h-[52px] items-center gap-3 border-b border-[var(--dv-color-line)] px-4 no-underline text-inherit">
        <Folder :size="20" aria-hidden="true" /><span class="flex-1 truncate">{{ collection.name }}</span>
        <span class="text-sm text-[var(--dv-text-secondary)]">{{ collection.numberOfFiles }}</span><ChevronRight :size="18" aria-hidden="true" />
      </router-link>
      <p v-if="!myCollections.length" class="px-4 pt-4 text-center text-[var(--dv-text-secondary)]">Gather files for a project or a client in your own collection.</p>
      <form v-if="creating" class="flex gap-2 px-4" @submit.prevent="create">
        <label class="sr-only" for="mobile-saved-new">Collection name</label>
        <input id="mobile-saved-new" v-model="name" maxlength="80" autocomplete="off" placeholder="Collection name" class="min-h-11 flex-1 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3 text-base" />
        <Button type="submit" class="min-h-11" :disabled="!name.trim()">Create</Button>
      </form>
      <Button v-else type="button" variant="outline" class="mx-4 min-h-12" @click="creating = true"><Plus :size="18" aria-hidden="true" />New collection</Button>
    </template>
  </section>
  <MobilePreview v-if="preview.index.value >= 0" :files="files" :index="preview.index.value" @close="preview.close" @show="preview.show" />
</template>
