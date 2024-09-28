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
import CollectionDialogCreate from "@/components/collection/CollectionDialogCreate.vue"
import MainLinkTree from "@/components/layout-main/MainLinkTree.vue"
import MainMenuTree from "@/components/layout-main/MainMenuTree.vue"
import MainTopbar from "@/components/layout-main/MainTopbar.vue"
import { Button } from "@/components/ui/button"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { sortBy } from "lodash"
import { ChevronDown, ChevronRight, CirclePlus } from "lucide-vue-next"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const isDialogCreateCollectionOpen = ref<boolean>(false)

type Collection = RouterOutput["collection"]["tree"][number]

const globalStore = useGlobalStore()
const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})
const { data: menuItems, status } = useQuery({
  queryKey: ["menu-items"],
  queryFn: () => trpc.menuItem.list.query(),
})

const myCollections = computed(() => {
  return collections.value
    ?.filter((c: Collection) => c.ownerId === globalStore.user?.id && !c.public)
    .sort((a: Collection, b: Collection) => a.name.localeCompare(b.name))
})

const publicCollections = computed(() => {
  return collections.value
    ?.filter((c: Collection) => c.public || c.ownerId !== globalStore.user?.id)
    .sort((a: Collection, b: Collection) => a.name.localeCompare(b.name))
})

const flattenCollections = computed(() => {
  const items: Collection[] = []
  const pushItems = (collections: Collection[]) =>
    collections?.forEach((collection) => {
      items.push(collection)
      if (collection.children) {
        pushItems(collection.children)
      }
    })
  if (collections.value) {
    pushItems(collections.value)
  }
  return items
})

const openCollections = computed(() => {
  if (!(route.name === "collection" && route.params.id)) {
    return []
  }

  const collection = flattenCollections.value.find((item) => item.id === route.params.id)
  const ids: string[] = []
  for (let current = collection; current; current = current.parent) {
    ids.push(current.id)
  }
  return ids.reverse()
})

const myCollectionsActive = computed(
  () =>
    myCollections.value?.some((c: Collection) => openCollections.value?.includes(c.id)) ??
    false
)
const isMyCollectionsTabOpen = ref<boolean>(false)

watch([myCollectionsActive], () => {
  isMyCollectionsTabOpen.value = myCollectionsActive.value
})
</script>

<template>
  <div class="dashboard-layout flex min-h-screen h-full max-h-screen m-0 pt-[88px] w-full overflow-auto">
    <div class="dashboard-layout__menu bg-neutral-100 py-6 px-4 w-full max-w-[320px] overflow-y-auto max-h-screen">
      <div v-if="globalStore.user?.role !== 'guest'" class="mb-8 overflow-auto">
        <router-link :to="{ name: 'favorites' }">
          <Button variant="ghost" type="button"
            class="flex w-full pl-2.5 items-center justify-between text-sm font-medium no-underline text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200">
            My Favorites
          </Button>
        </router-link>
        <div
          class="dashboard-layout__menu-collection flex items-center justify-between text-sm font-medium no-underline text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200">
          <Button variant="ghost" type="button" @click="isMyCollectionsTabOpen = !isMyCollectionsTabOpen"
            class="flex cursor-pointer border-none w-fit gap-1.5 hover:bg-transparent pl-2.5"
            :class="{ 'pl-1': myCollections?.length }">
            <ChevronDown v-if="isMyCollectionsTabOpen && myCollections?.length > 0" class="w-4 h-4 min-w-4 min-h-4" />
            <ChevronRight v-else-if="myCollections?.length > 0" class="w-4 h-4 min-w-4 min-h-4" />
            My Collections
          </Button>
          <Button variant="ghost" type="button" size="icon" @click="isDialogCreateCollectionOpen = true"
            class="flex cursor-pointer border-none w-fit gap-1.5 hover:bg-transparent">
            <CirclePlus class="w-5 h-5 text-neutral-600 hover:text-neutral-900 mr-3" />
          </Button>
        </div>
        <div v-if="isMyCollectionsTabOpen" class="pl-3">
          <MainLinkTree v-if="myCollections" v-for="collection in myCollections" :key="collection.id" :item="collection"
            :open-items="openCollections ?? []" route-name="collection" />
        </div>
      </div>
      <MainLinkTree v-if="globalStore.user?.role === 'guest'" v-for="collection in publicCollections"
        :key="collection.id" :item="collection" :open-items="openCollections ?? []" route-name="collection" />
      <MainMenuTree v-else-if="menuItems" v-for="item in sortBy(menuItems, 'position')" :key="item.id" :item="item"
        :open-items="openCollections ?? []" route-name="collection" />
    </div>
    <div class="w-full overflow-auto p-2">
      <MainTopbar />
      <slot></slot>
    </div>
    <CollectionDialogCreate v-model="isDialogCreateCollectionOpen" />
  </div>
</template>

<style scoped lang="scss">
.dashboard-layout__packshot-finder {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: var(--primary-color);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border-radius: var(--border-radius);

  padding-left: 2.5rem;

  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    background: var(--terniary-color);
  }
}

.dashboard-layout__navigation-logo {
  display: block;
  margin: 0 auto 2rem;
  width: 132px;
  height: auto;
}
</style>
