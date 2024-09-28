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

watch([menuItems, () => globalStore.user, collections, status, isFetchingMenu, isFetchingCollections], () => {
  const homeItem = menuItems.value?.find((item: any) => item.home)
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
  <div v-if="showDefaultView" class="layout-home">
    <h1>Welcome to our Internal asset platform.</h1>
    <p>The homepage is still work in progress but you can already navigate through collections on the left or <a
        href="/search"> search</a> assets
      with th search bar on the top.</p>
  </div>
  <div v-else>
    <Loader :text="true" />
  </div>
</template>

<style scoped>
.layout-home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 1rem;
  padding: 1rem;
  margin: 0;
  color: var(--primary-color65);
  font-weight: 500;
}
</style>
