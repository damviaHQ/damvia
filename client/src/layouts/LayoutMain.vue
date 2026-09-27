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
import MainNavigation from "@/components/layout-main/MainNavigation.vue"
import SearchPanel from "@/components/search/SearchPanel.vue"
import Logo from "@/components/ClientLogo.vue"
import MainTopbar from "@/components/layout-main/MainTopbar.vue"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FocusScope } from "reka-ui"
import { useMediaQuery } from "@vueuse/core"
import { Menu, X } from "@lucide/vue"
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from "vue"
import { useRoute } from "vue-router"

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
const mobileNavOpen = ref(false)
const isMobile = useMediaQuery('(max-width: 767px)')
watch(mobileNavOpen, async open => {
  if (!isMobile.value) return
  await nextTick()
  if (open) document.querySelector<HTMLElement>('#client-navigation button, #client-navigation a')?.focus()
  else document.getElementById('client-navigation-toggle')?.focus()
})
watch(() => route.fullPath, () => { mobileNavOpen.value = false })
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
        <MainNavigation v-else />
        </div>
      </aside>
      </FocusScope>
    </TooltipProvider>
    <div :inert="mobileNavOpen && isMobile" class="flex min-w-0 flex-1 flex-col">
    <MainTopbar />
    <!-- Search keeps its top inset inside the opaque sticky toolbar. -->
    <main id="main-content" tabindex="-1" class="client-workspace isolate min-h-0 min-w-0 flex-1 overflow-auto px-5 pb-5 pt-5 focus:outline-none"><slot /></main>
    </div>
  </div>
</template>
