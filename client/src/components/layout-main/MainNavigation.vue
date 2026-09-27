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
import MainLinkTree from "@/components/layout-main/MainLinkTree.vue"
import MainMenuTree from "@/components/layout-main/MainMenuTree.vue"
import { MENU_TOUCH, menuIconClasses, menuIconSlotClasses, treeRowClasses, treeActiveRowClasses, treeConnectorStartClasses } from "@/components/layout-main/navigationStyles"
import { Button } from "@/components/ui/button"
import { useMyCollections } from "@/composables/useMyCollections"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import sortBy from "lodash/sortBy"
import { ArrowRight, ChevronDown, ChevronRight, Plus, Star } from "@lucide/vue"
import { computed, defineAsyncComponent, provide, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

// The library navigation: Favorites, My collections and the menu, with the
// branch of the current collection or page open. The computer sidebar and the
// phone menu drawer both show this one component, so they never differ.
const props = defineProps<{ touch?: boolean }>()
provide(MENU_TOUCH, !!props.touch)
const route = useRoute()
const router = useRouter()
const isDialogCreateCollectionOpen = ref<boolean>(false)

type Collection = RouterOutput["collection"]["tree"][number]

const globalStore = useGlobalStore()
const { data: collections, myCollections } = useMyCollections()
const { data: menuItems } = useQuery({
  queryKey: ["menu-items"],
  queryFn: () => trpc.menuItem.list.query(),
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
  const ids: string[] = []
  
  if (route.name === "collection" && route.params.id) {
    const currentId = route.params.id as string
    const findPath = (items: Array<{ id: string; children?: any[] }>, menu = false): string[] | null => {
      for (const item of items) {
        const id = menu ? (item as any).collectionId : item.id
        if (id === currentId) return [currentId]
        const childPath = findPath(item.children ?? [], menu)
        if (childPath) return id ? [id, ...childPath] : childPath
      }
      return null
    }
    const treePath = findPath(collections.value ?? [])
    const menuPath = findPath(menuItems.value ?? [], true)
    if (menuPath) return menuPath
    if (treePath) return treePath
    const collection = flattenCollections.value.find((item) => item.id === currentId)
    for (let current = collection; current; current = current.parent) {
      ids.push(current.id)
    }
    return ids.length ? ids.reverse() : [currentId]
  }
  
  if (route.name === "page" && route.params.id) {
    const pageId = route.params.id as string
    
    const owningCollection = flattenCollections.value.find((collection) => 
      collection.page?.id === pageId
    )
    
    if (owningCollection) {
      for (let current = owningCollection; current; current = current.parent) {
        ids.push(current.id)
      }
      ids.reverse()
    } else {
      const findMenuItemByPageId = (items: any[], pageId: string): any => {
        for (const item of items) {
          if (item.pageId === pageId) {
            return item
          }
          if (item.children) {
            const found = findMenuItemByPageId(item.children, pageId)
            if (found) return found
          }
        }
        return null
      }
      
      const menuItem = findMenuItemByPageId(menuItems.value || [], pageId)
      
      if (menuItem) {
        if (!menuItem.collectionId && menuItem.parentId) {
          const findParentCollectionId = (items: any[], parentId: string): string | null => {
            for (const item of items) {
              if (item.id === parentId) {
                return item.collectionId || (item.parentId ? findParentCollectionId(items, item.parentId) : null)
              }
              if (item.children) {
                const found = findParentCollectionId(item.children, parentId)
                if (found) return found
              }
            }
            return null
          }
          
          const parentCollectionId = findParentCollectionId(menuItems.value || [], menuItem.parentId)
          
          if (parentCollectionId) {
            const collection = flattenCollections.value.find(c => c.id === parentCollectionId)
            
            if (collection) {
              for (let current = collection; current; current = current.parent) {
                ids.push(current.id)
              }
              ids.reverse()
            }
          }
        } else if (menuItem.collectionId) {
          const collection = flattenCollections.value.find(c => c.id === menuItem.collectionId)
          
          if (collection) {
            for (let current = collection; current; current = current.parent) {
              ids.push(current.id)
            }
            ids.reverse()
          }
        }
      }
    }
    
    ids.push(pageId)
    return ids
  }
  
  return []
})

const activeMyCollectionIndex = computed(() =>
  myCollections.value.findIndex((collection: Collection) => openCollections.value.includes(collection.id))
)
const myCollectionsActive = computed(() => activeMyCollectionIndex.value >= 0)
const isMyCollectionsTabOpen = ref(route.name === "my-collections")

watch([myCollectionsActive, () => route.fullPath], () => {
  if (myCollectionsActive.value) {
    isMyCollectionsTabOpen.value = true
  }
}, { immediate: true })
const CollectionDialogCreate = defineAsyncComponent(() => import("@/components/collection/CollectionDialogCreate.vue"))
</script>

<template>
  <nav aria-label="Collections">
    <div v-if="globalStore.user?.role !== 'guest'" class="mb-4 grid gap-1">
      <router-link :to="{ name: 'favorites' }" :class="treeRowClasses" :active-class="treeActiveRowClasses">
        <span :class="menuIconSlotClasses"><Star :class="menuIconClasses" aria-hidden="true" /></span><span class="min-w-0 truncate">Favorites</span>
      </router-link>
      <div>
        <div v-if="touch && myCollections.length" class="flex items-center gap-1">
        <button type="button" :aria-expanded="isMyCollectionsTabOpen" aria-controls="my-collections-tree"
          :aria-label="`${isMyCollectionsTabOpen ? 'Collapse' : 'Expand'} My collections`"
          :class="[treeRowClasses, 'min-h-11 flex-1 text-left', route.name === 'my-collections' && treeActiveRowClasses]" @click="isMyCollectionsTabOpen = !isMyCollectionsTabOpen">
          <span :class="menuIconSlotClasses"><ChevronDown v-if="isMyCollectionsTabOpen" :class="menuIconClasses" aria-hidden="true" /><ChevronRight v-else :class="menuIconClasses" aria-hidden="true" /></span>
          <span class="min-w-0 truncate">My collections</span>
        </button>
        <Button variant="ghost" size="icon" aria-label="Create collection" class="size-9 p-1.5 [&_svg]:size-4" @click="isDialogCreateCollectionOpen = true"><Plus :class="menuIconClasses" /></Button>
        <router-link :to="{ name: 'my-collections' }" aria-label="Open My collections"
          class="grid size-11 shrink-0 place-items-center rounded-md text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-ring"><ArrowRight class="size-4" aria-hidden="true" /></router-link>
      </div>
      <div v-else class="relative flex items-center gap-1">
          <Button v-if="myCollections.length" type="button" variant="ghost"
            :aria-expanded="isMyCollectionsTabOpen" aria-controls="my-collections-tree"
            :aria-label="`${isMyCollectionsTabOpen ? 'Collapse' : 'Expand'} My collections`"
            class="peer absolute left-px top-2 z-10 size-5 min-h-0 shrink-0 border-none p-0.5 hover:bg-neutral-200"
            @click="isMyCollectionsTabOpen = !isMyCollectionsTabOpen">
            <ChevronDown v-if="isMyCollectionsTabOpen" :class="menuIconClasses" />
            <ChevronRight v-else :class="menuIconClasses" />
          </Button>
          <router-link :to="{ name: 'my-collections' }" :class="[treeRowClasses, 'flex-1 peer-hover:bg-neutral-200 peer-hover:text-neutral-900']" :active-class="treeActiveRowClasses"
            :aria-expanded="myCollections.length ? isMyCollectionsTabOpen : undefined" :aria-controls="myCollections.length ? 'my-collections-tree' : undefined"
            @click.exact="isMyCollectionsTabOpen = !isMyCollectionsTabOpen">
            <span :class="menuIconSlotClasses" aria-hidden="true" /><span class="min-w-0 truncate">My collections</span>
          </router-link>
          <Button variant="ghost" size="icon" aria-label="Create collection" class="size-7 p-1.5 [&_svg]:size-4" @click="isDialogCreateCollectionOpen = true"><Plus :class="menuIconClasses" /></Button>
        </div>
        <div v-if="isMyCollectionsTabOpen && myCollections.length" id="my-collections-tree" class="children-container relative pl-4">
          <span v-if="myCollectionsActive" aria-hidden="true" data-tree-connector :class="treeConnectorStartClasses" />
          <div v-for="(collection, index) in myCollections" :key="collection.id" class="relative">
            <span v-if="myCollectionsActive && index <= activeMyCollectionIndex" aria-hidden="true" data-tree-connector
              class="pointer-events-none absolute -left-[5px] top-0 w-px bg-[#d4d4d4]"
              :class="index === activeMyCollectionIndex ? 'h-[18px]' : 'h-full'" />
            <span v-if="index === activeMyCollectionIndex" aria-hidden="true" data-tree-connector
              class="pointer-events-none absolute -left-[5px] top-[18px] h-px w-[6px] bg-[#d4d4d4]" />
            <MainLinkTree :item="collection" :open-items="openCollections" route-name="collection" />
          </div>
        </div>
      </div>
    </div>
    <MainLinkTree v-if="globalStore.user?.role === 'guest'" v-for="collection in publicCollections" :key="collection.id" :item="collection" :open-items="openCollections ?? []" route-name="collection" />
    <MainMenuTree v-else-if="menuItems" v-for="item in sortBy(menuItems, 'position')" :key="item.id" :item="item" :open-items="openCollections ?? []" route-name="collection" />
  </nav>
  <CollectionDialogCreate v-model="isDialogCreateCollectionOpen" @created="router.push({ name: 'collection', params: { id: $event.id } })" />
</template>
