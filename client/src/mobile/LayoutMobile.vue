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
import { computed, defineAsyncComponent, markRaw, ref, type Component } from "vue"
import { useRoute } from "vue-router"
import { useQuery } from "@tanstack/vue-query"
import { House, Menu, Search, Star, CircleUserRound } from "@lucide/vue"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import MobileDesktopOnly from "./MobileDesktopOnly.vue"
import MobileMenuDrawer from "./components/MobileMenuDrawer.vue"

const route = useRoute()
const globalStore = useGlobalStore()
const role = computed(() => globalStore.user?.role)

// Each route names its phone screen; the loader is wrapped once so moving
// between two routes with the same screen does not remount it.
const screens = new Map<unknown, Component>()
const screen = computed(() => {
  const loader = route.meta.mobile
  if (!loader) return MobileDesktopOnly
  if (!screens.has(loader)) screens.set(loader, markRaw(defineAsyncComponent(loader)))
  return screens.get(loader)!
})
const screenKey = computed(() => route.meta.mobile ? String(route.name) : "desktop-only")

// Managers and admins see how many people wait for access on the Account tab.
const { data: pending } = useQuery({
  queryKey: ["users", "pending-count"],
  enabled: computed(() => role.value === "admin" || role.value === "manager"),
  refetchInterval: 5 * 60_000,
  queryFn: async () => (await trpc.user.list.query()).filter((user) => user.emailVerified && !user.approved && !user.suspendedAt).length,
})

const menuOpen = ref(false)

const tabs = computed(() => [
  { id: "home", label: "Home", icon: House, to: { name: "home" }, active: route.name === "home" },
  // Menu opens the drawer; it also shows as current on the screens it leads to.
  { id: "menu", label: "Menu", icon: Menu, active: menuOpen.value || ["page", "collection", "collection-404", "product"].includes(String(route.name)) },
  { id: "search", label: "Search", icon: Search, to: { name: "search" }, active: ["search", "catalogue"].includes(String(route.name)) },
  ...(role.value === "guest" ? [] : [{ id: "saved", label: "Saved", icon: Star, to: { name: "favorites" }, active: ["favorites", "my-collections"].includes(String(route.name)) }]),
  { id: "account", label: "Account", icon: CircleUserRound, to: { name: "account" }, badge: pending.value || 0,
    active: ["account", "downloads", "admin-users", "admin-user", "admin-dashboard"].includes(String(route.name)) },
])
</script>

<template>
  <div class="mobile-shell">
    <main id="main" tabindex="-1" class="mobile-shell__main">
      <component :is="screen" :key="screenKey" />
    </main>
    <nav class="mobile-tabs" aria-label="Main">
      <component :is="tab.to ? 'router-link' : 'button'" v-for="tab in tabs" :key="tab.id" :to="tab.to" :type="tab.to ? undefined : 'button'"
        :aria-expanded="tab.to ? undefined : menuOpen" class="mobile-tabs__item" @click="tab.to ? undefined : (menuOpen = true)"
        :class="{ 'mobile-tabs__item--active': tab.active }" :aria-current="tab.to && tab.active ? 'page' : undefined">
        <span class="mobile-tabs__icon">
          <component :is="tab.icon" :size="22" :stroke-width="tab.active ? 2.4 : 1.8" aria-hidden="true" />
          <span v-if="tab.badge" class="mobile-tabs__badge">{{ tab.badge > 99 ? "99+" : tab.badge }}<span class="sr-only"> waiting for approval</span></span>
        </span>
        <span>{{ tab.label }}</span>
      </component>
    </nav>
    <MobileMenuDrawer v-model:open="menuOpen" />
  </div>
</template>

<style scoped>
.mobile-shell {
  min-height: 100dvh;
  background: var(--dv-surface-canvas);
  color: var(--dv-text-primary);
  font-size: 16px;
}
.mobile-shell__main {
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
  outline: none;
}
.mobile-tabs {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 40;
  display: flex;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--dv-surface-panel);
  border-top: 1px solid var(--dv-color-line);
}
.mobile-tabs__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 56px;
  font-size: 11px;
  font-weight: 500;
  background: none;
  border: 0;
  color: var(--dv-text-secondary);
  text-decoration: none;
}
.mobile-tabs__item--active {
  color: var(--dv-text-primary);
  font-weight: 700;
}
/* The active tab is shown three ways: a filled pill, a heavier icon and bold text. */
.mobile-tabs__icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 30px;
  border-radius: 15px;
  transition: background-color 0.15s;
}
.mobile-tabs__item--active .mobile-tabs__icon {
  background: var(--dv-action-primary);
  color: var(--dv-color-white);
}
@media (prefers-reduced-motion: reduce) {
  .mobile-tabs__icon { transition: none; }
}
.mobile-tabs__badge {
  position: absolute;
  top: -6px;
  right: 2px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--dv-color-danger);
  color: var(--dv-color-white);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
</style>
