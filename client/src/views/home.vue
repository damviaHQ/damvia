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
import { useGlobalStore } from "@/stores/globalStore.ts"
import { useQuery } from "@tanstack/vue-query"
import { ref, watch } from "vue"
import { useRouter } from "vue-router"
import { trpc } from "../services/server.ts"

const router = useRouter()
const globalStore = useGlobalStore()
const showDefaultView = ref(false)
const { data: menuItems, isFetching: isFetchingMenu } = useQuery({
  refetchOnMount: true,
  queryKey: ['menu-items'],
  queryFn: () => trpc.menuItem.list.query()
})
const { status, data: collections, isFetching: isFetchingCollections } = useQuery({
  refetchOnMount: true,
  queryKey: ['collection', 'tree'],
  queryFn: () => trpc.collection.tree.query()
})

// The home item can sit under a section heading, so the whole menu tree is
// searched rather than its first level.
function findHome(items: any[] | undefined): any {
  for (const item of items ?? []) {
    if (item.home) return item
    const found = findHome(item.children)
    if (found) return found
  }
  return null
}

watch([menuItems, () => globalStore.user, collections, status, isFetchingMenu, isFetchingCollections], () => {
  const homeItem = findHome(menuItems.value)
  if (isFetchingMenu.value || isFetchingCollections.value || status.value !== 'success') {
    return
  }

  if (!homeItem || globalStore.user?.role === 'guest') {
    if (collections.value.length) {
      router.push({ name: 'collection', params: { id: collections.value[0].id } })
      return
    }
    showDefaultView.value = true
  } else if (homeItem.type === 'page') {
    router.push({ name: 'page', params: { id: homeItem.pageId } })
  } else if (homeItem.type === 'collection') {
    router.push({ name: 'collection', params: { id: homeItem.collectionId } })
  }
}, { immediate: true })
</script>

<template>
  <div v-if="showDefaultView" class="layout-home flex flex-col items-center justify-center w-full [font-size:1rem] m-0 [color:var(--dv-text-secondary)] font-medium">
    <h1>Welcome to our Internal asset platform.</h1>
    <p>The homepage is still work in progress but you can already navigate through collections on the left or <a
        href="/search"> search</a> assets
      with th search bar on the top.</p>
  </div>
  <div v-else>
    <Loader :text="true" />
  </div>
</template>
