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
import { menuIconClasses, menuIconSlotClasses, treeRowClasses, treeActiveRowClasses, treeConnectorStartClasses } from "@/components/layout-main/navigationStyles"
import SearchPanel from "@/components/search/SearchPanel.vue"
import { useMyCollections } from "@/composables/useMyCollections"
import MainAccountMenu from "@/components/layout-main/MainAccountMenu.vue"
import Logo from "@/components/ClientLogo.vue"
import MainTopbar from "@/components/layout-main/MainTopbar.vue"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { FocusScope } from "reka-ui"
import { useMediaQuery } from "@vueuse/core"
import sortBy from "lodash/sortBy"
import { ChevronDown, ChevronRight, Plus, Menu, X, Star } from "@lucide/vue"
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, provide, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

provide('client-page-tools', true)

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
const isSearchRoute = computed(() => route.name === "search")
// The search panel needs room for counts and long attribute values.
const SEARCH_SIDEBAR_MIN = 320
const asideWidth = computed(() => isSearchRoute.value ? Math.max(sidebarWidth.value, SEARCH_SIDEBAR_MIN) : sidebarWidth.value)
const router = useRouter()
const mobileNavOpen = ref(false)
const isMobile = useMediaQuery('(max-width: 767px)')
watch(mobileNavOpen, async open => {
  if (!isMobile.value) return
  await nextTick()
  if (open) document.querySelector<HTMLElement>('#client-navigation button, #client-navigation a')?.focus()
  else document.getElementById('client-navigation-toggle')?.focus()
})
watch(() => route.fullPath, () => { mobileNavOpen.value = false })
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
  <div class="dashboard-layout flex h-dvh w-full overflow-hidden bg-white">
    <a href="#main-content" class="sr-only fixed left-3 top-3 z-50 bg-white px-3 py-2 text-sm font-medium text-neutral-950 focus:not-sr-only">Skip to content</a>
    <Button id="client-navigation-toggle" class="fixed left-3 top-[14px] z-20 size-11 md:hidden" variant="ghost" size="icon" :aria-expanded="mobileNavOpen" aria-controls="client-navigation" :aria-label="mobileNavOpen ? (isSearchRoute ? 'Close search filters' : 'Close navigation') : (isSearchRoute ? 'Open search filters' : 'Open navigation')" @click="mobileNavOpen = !mobileNavOpen"><X v-if="mobileNavOpen" /><Menu v-else /></Button>
    <TooltipProvider :delay-duration="0" :disable-hoverable-content="true">
      <FocusScope as-child :trapped="mobileNavOpen && isMobile" :loop="mobileNavOpen && isMobile" @mount-auto-focus.prevent @unmount-auto-focus.prevent>
      <aside :role="mobileNavOpen && isMobile ? 'dialog' : undefined" :aria-modal="mobileNavOpen && isMobile ? true : undefined" aria-label="Navigation" id="client-navigation" class="relative flex shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 max-md:fixed max-md:top-[72px] max-md:bottom-0 max-md:left-0 max-md:z-20 max-md:w-[min(320px,calc(100vw-32px))]!" :class="mobileNavOpen ? 'flex' : 'max-md:hidden'" :style="{ width: asideWidth + 'px' }" @keydown.esc="mobileNavOpen = false">
        <div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" :aria-valuenow="sidebarWidth" :aria-valuemin="SIDEBAR_MIN" :aria-valuemax="SIDEBAR_MAX" tabindex="0" class="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize select-none hover:bg-neutral-300 focus-visible:bg-neutral-300 max-md:hidden" :class="isResizing && 'bg-neutral-300'" @mousedown="startResize" @keydown="onResizeKeydown" />
        <router-link :to="{ name: 'home' }" class="flex h-[72px] shrink-0 items-center border-b border-neutral-200 px-5 max-md:hidden" aria-label="Home"><Logo class="w-[124px]" /></router-link>
        <Button class="mx-3 mt-3 justify-start md:hidden" variant="ghost" @click="mobileNavOpen = false"><X class="size-4" />Close navigation</Button>
        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <SearchPanel v-if="isSearchRoute" />
        <nav v-else aria-label="Collections">
          <div v-if="globalStore.user?.role !== 'guest'" class="mb-4 grid gap-1">
            <router-link :to="{ name: 'favorites' }" :class="treeRowClasses" :active-class="treeActiveRowClasses">
              <span :class="menuIconSlotClasses"><Star :class="menuIconClasses" aria-hidden="true" /></span><span class="min-w-0 truncate">Favorites</span>
            </router-link>
            <div>
              <div class="relative flex items-center gap-1">
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
        </div>
        <div class="flex shrink-0 items-center gap-1 border-t border-neutral-200 p-2">
          <div class="min-w-0 flex-1"><MainAccountMenu /></div>
        </div>
      </aside>
      </FocusScope>
    </TooltipProvider>
    <div :inert="mobileNavOpen && isMobile" class="flex min-w-0 flex-1 flex-col">
    <MainTopbar />
    <!-- Search keeps its top inset inside the opaque sticky toolbar. -->
    <main id="main-content" tabindex="-1" class="client-workspace isolate min-h-0 min-w-0 flex-1 overflow-auto px-5 pb-5 pt-5 focus:outline-none"><slot /></main>
    </div>
    <CollectionDialogCreate v-model="isDialogCreateCollectionOpen" @created="router.push({ name: 'collection', params: { id: $event.id } })" />
  </div>
</template>
