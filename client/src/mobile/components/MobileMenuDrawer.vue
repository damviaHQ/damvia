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
import { watch } from "vue"
import { useRoute } from "vue-router"
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui"
import { X } from "@lucide/vue"
import ClientLogo from "@/components/ClientLogo.vue"
import MainNavigation from "@/components/layout-main/MainNavigation.vue"
import { TooltipProvider } from "@/components/ui/tooltip"

// The computer sidebar, slid in from the left over most of the screen.
const open = defineModel<boolean>("open", { default: false })
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="mobile-drawer__overlay" />
      <DialogContent class="mobile-drawer dv-theme dv-neutral dv-client">
        <header class="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 px-4">
          <router-link :to="{ name: 'home' }" aria-label="Home" class="flex items-center"><ClientLogo class="!h-8 !w-auto max-w-[140px]" /></router-link>
          <DialogTitle class="sr-only">Menu</DialogTitle>
          <DialogClose class="-mr-2 ml-auto grid size-11 place-items-center" aria-label="Close menu"><X :size="22" aria-hidden="true" /></DialogClose>
        </header>
        <DialogDescription class="sr-only">Favorites, your collections and the library menu.</DialogDescription>
        <TooltipProvider :delay-duration="0" :disable-hoverable-content="true">
          <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4"><MainNavigation touch /></div>
        </TooltipProvider>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.mobile-drawer__overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(0 0 0 / 0.4);
}
.mobile-drawer {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 51;
  display: flex;
  flex-direction: column;
  width: 80vw;
  max-width: 420px;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  background: #fafafa;
  border-right: 1px solid #e5e5e5;
  box-shadow: 8px 0 24px rgb(0 0 0 / 0.12);
  animation: mobile-drawer-in 0.2s ease-out;
}
@keyframes mobile-drawer-in {
  from { transform: translateX(-100%); }
}
@media (prefers-reduced-motion: reduce) {
  .mobile-drawer { animation: none; }
}
</style>
