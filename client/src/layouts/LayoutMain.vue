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
import { menuIconClasses, menuIconSlotClasses, sidebarRowClasses } from "@/components/layout-main/navigationStyles"
import MainTopbar from "@/components/layout-main/MainTopbar.vue"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { sortBy } from "lodash"
import { ChevronDown, ChevronRight, CirclePlus, Menu, X, Star } from "lucide-vue-next"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useRoute } from "vue-router"

const SIDEBAR_WIDTH_KEY = "damvia.sidebarWidth"
const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 264

function readStoredWidth(): number {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SIDEBAR_WIDTH_KEY) : null
  const parsed = raw ? parseInt(raw, 10) : NaN
  if (Number.isFinite(parsed)) {
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, parsed))
  }
  return SIDEBAR_DEFAULT
}

const sidebarWidth = ref<number>(readStoredWidth())
const isResizing = ref<boolean>(false)

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return
  const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, e.clientX))
  sidebarWidth.value = next
}

function onResizeEnd() {
  if (!isResizing.value) return
  isResizing.value = false
  document.body.style.cursor = ""
  document.body.style.userSelect = ""
  document.removeEventListener("mousemove", onResizeMove)
  document.removeEventListener("mouseup", onResizeEnd)
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
  } catch (_) { /* storage unavailable */ }
}

function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  document.body.style.cursor = "col-resize"
  document.body.style.userSelect = "none"
  document.addEventListener("mousemove", onResizeMove)
  document.addEventListener("mouseup", onResizeEnd)
}

function onResizeKeydown(e: KeyboardEvent) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
  e.preventDefault()
  sidebarWidth.value = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, sidebarWidth.value + (e.key === "ArrowRight" ? 16 : -16)))
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
  } catch (_) { /* storage unavailable */ }
}

onBeforeUnmount(() => {
  document.removeEventListener("mousemove", onResizeMove)
  document.removeEventListener("mouseup", onResizeEnd)
})

const route = useRoute()
const mobileNavOpen = ref(false)
watch(() => route.fullPath, () => { mobileNavOpen.value = false })
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
  <div class="dashboard-layout flex h-dvh w-full overflow-hidden bg-white pt-[88px] md:pt-[72px]">
    <a href="#main-content" class="sr-only fixed left-3 top-3 z-50 bg-white px-3 py-2 text-sm font-medium text-neutral-950 focus:not-sr-only">Skip to content</a>
    <Button class="fixed left-3 top-[22px] z-20 size-11 md:hidden" variant="ghost" size="icon" :aria-expanded="mobileNavOpen" aria-controls="client-navigation" :aria-label="mobileNavOpen ? 'Close navigation' : 'Open navigation'" @click="mobileNavOpen = !mobileNavOpen"><X v-if="mobileNavOpen" /><Menu v-else /></Button>
    <TooltipProvider :delay-duration="0" :disable-hoverable-content="true">
      <aside id="client-navigation" class="relative shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50 px-3 py-5 max-md:fixed max-md:inset-y-[88px] max-md:left-0 max-md:z-15 max-md:w-[min(320px,calc(100vw-32px))]!" :class="mobileNavOpen ? 'block' : 'max-md:hidden'" :style="{ width: sidebarWidth + 'px' }" @keydown.esc="mobileNavOpen = false">
        <div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" :aria-valuenow="sidebarWidth" :aria-valuemin="SIDEBAR_MIN" :aria-valuemax="SIDEBAR_MAX" tabindex="0" class="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize select-none hover:bg-neutral-300 focus-visible:bg-neutral-300 max-md:hidden" :class="isResizing && 'bg-neutral-300'" @mousedown="startResize" @keydown="onResizeKeydown" />
        <nav aria-label="Collections">
          <div v-if="globalStore.user?.role !== 'guest'" class="mb-4 grid gap-1">
            <router-link :to="{ name: 'favorites' }" :class="sidebarRowClasses" active-class="bg-neutral-200/70 text-neutral-950">
              <span :class="menuIconSlotClasses"><Star :class="menuIconClasses" /></span><span>Favorites</span>
            </router-link>
            <div class="flex items-center gap-1">
              <button type="button" class="flex-1" :class="sidebarRowClasses" :aria-expanded="isMyCollectionsTabOpen" @click="isMyCollectionsTabOpen = !isMyCollectionsTabOpen">
                <span :class="menuIconSlotClasses"><ChevronDown v-if="isMyCollectionsTabOpen" :class="menuIconClasses" /><ChevronRight v-else :class="menuIconClasses" /></span><span>My collections</span>
              </button>
              <Button variant="ghost" size="icon" aria-label="Create collection" class="size-7 p-1.5 [&_svg]:size-4" @click="isDialogCreateCollectionOpen = true"><CirclePlus :class="menuIconClasses" /></Button>
            </div>
            <div v-if="isMyCollectionsTabOpen" class="ml-4 border-l border-neutral-200 pl-2">
              <MainLinkTree v-for="collection in myCollections" :key="collection.id" :item="collection" :open-items="openCollections ?? []" route-name="collection" />
            </div>
          </div>
          <div v-if="globalStore.user?.role !== 'guest'" class="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[.08em] text-neutral-500">Library</div>
          <MainLinkTree v-if="globalStore.user?.role === 'guest'" v-for="collection in publicCollections" :key="collection.id" :item="collection" :open-items="openCollections ?? []" route-name="collection" />
          <MainMenuTree v-else-if="menuItems" v-for="item in sortBy(menuItems, 'position')" :key="item.id" :item="item" :open-items="openCollections ?? []" route-name="collection" />
        </nav>
      </aside>
    </TooltipProvider>
    <MainTopbar />
    <main id="main-content" tabindex="-1" class="client-workspace min-w-0 flex-1 overflow-auto px-5 py-6 md:px-9 md:py-8 focus:outline-none"><slot /></main>
    <CollectionDialogCreate v-model="isDialogCreateCollectionOpen" />
  </div>
</template>
