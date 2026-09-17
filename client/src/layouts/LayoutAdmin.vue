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
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { formatStorage } from "@/utils/fileSize"
import { useQuery } from "@tanstack/vue-query"
import {
  AtSign,
  Blocks,
  ContactRound,
  Copyright,
  FileCog,
  FilePenLine,
  Folders,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  SquareChevronLeft,
  Users,
} from "lucide-vue-next"
import { computed, ref, watch, provide } from "vue"
import { useRoute } from "vue-router"
import ClientLogo from '@/components/ClientLogo.vue'
import PathBreadcrumb, { type PathBreadcrumbItem } from '@/components/navigation/PathBreadcrumb.vue'
import '../../../packages/design-system/src/tokens.css'
import '../../../packages/design-system/src/fonts.css'
import '../../../packages/design-system/src/components.css'
import '@/styles/admin.css'
provide('damvia-admin-theme', true)
const route = useRoute()
const mobileOpen = ref(false)
watch(() => route.fullPath, () => { mobileOpen.value = false })
const pageTitle = computed(() => String(route.name ?? 'Administration').replace(/^admin-/, '').replace(/-/g, ' '))
const adminBreadcrumbItems = computed<PathBreadcrumbItem[]>(() => [
  { id: 'workspace', label: 'Workspace', to: { name: 'admin-dashboard' } },
  { id: String(route.name ?? 'administration'), label: pageTitle.value },
])
export type Asset = RouterOutput["asset"]["tree"][number]

const globalStore = useGlobalStore()
const isAdmin = computed(() => globalStore.user?.role === 'admin')
const { data: summary } = useQuery({
  queryKey: ['dashboard'],
  queryFn: () => trpc.dashboard.summary.query(),
  enabled: isAdmin,
  refetchInterval: 5 * 60 * 1000,
})
const storage = computed(() => summary.value?.storage)
const storagePercent = computed(() => Math.round(storage.value?.percent ?? 0))
const showStorageBanner = computed(() => isAdmin.value && storage.value?.percent != null && storage.value.percent >= 80)
</script>

<template>
  <div class="dv-theme dv-admin admin-shell">
    <button class="mobile-nav-toggle" :aria-expanded="mobileOpen" aria-controls="admin-navigation" @click="mobileOpen = !mobileOpen"><Menu />{{ mobileOpen ? 'Close navigation' : 'Open navigation' }}</button>
    <aside id="admin-navigation" class="admin-sidebar" :class="{ 'is-open': mobileOpen }">
      <router-link :to="{ name: 'home' }" class="admin-brand" aria-label="Back to the DAM" title="Back to the DAM" @click="mobileOpen = false"><ClientLogo admin /><span>ADMIN</span></router-link>
      <div v-if="storage" class="sidebar-storage"><span>Storage used</span><strong>{{ formatStorage(storage.usedBytes) }}</strong><progress v-if="storage.quotaBytes" :value="Math.min(storagePercent, 100)" max="100" aria-label="Storage used" /><small v-if="storage.quotaBytes">of {{ formatStorage(storage.quotaBytes) }} plan</small></div>
      <nav aria-label="Administration" class="admin-nav" @click="mobileOpen = false">
        <div class="flex flex-col gap-1 mb-3 mt-2">
          <div v-if="globalStore.user?.role === 'admin'" class="menu-section">
            <router-link :to="{ name: 'admin-dashboard' }" class="menu-item" active-class=""
              exact-active-class="router-link-active">
              <LayoutDashboard class="w-4 h-4 mr-2" />
              Dashboard
            </router-link>
            <router-link :to="{ name: 'admin-settings' }" class="menu-item">
              <Settings class="w-4 h-4 mr-2" />
              Global Settings
            </router-link>
          </div>
          <!-- Content Management -->
          <div v-if="globalStore.user?.role === 'admin'" class="menu-section">
            <div class="menu-section-title">Content Management</div>
            <router-link :to="{ name: 'admin-menu-items' }" class="menu-item">
              <Menu class="w-4 h-4 mr-2" />
              Menu
            </router-link>
            <router-link :to="{ name: 'admin-collections' }" class="menu-item">
              <FilePenLine class="w-4 h-4 mr-2" />
              Collections
            </router-link>
            <router-link :to="{ name: 'admin-pages' }" class="menu-item">
              <FilePenLine class="w-4 h-4 mr-2" />
              Pages
            </router-link>
          </div>
          <!-- User Management -->
          <div class="menu-section" v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')">
            <div class="menu-section-title">User Management</div>
            <router-link :to="{ name: 'admin-users' }" class="menu-item">
              <ContactRound class="w-4 h-4 mr-2" />
              Users
            </router-link>
            <template v-if="globalStore.user?.role === 'admin'">
              <router-link :to="{ name: 'admin-groups' }" class="menu-item">
                <Users class="w-4 h-4 mr-2" />
                Groups
              </router-link>
              <router-link :to="{ name: 'admin-regions' }" class="menu-item">
                <KeyRound class="w-4 h-4 mr-2" />
                Regions
              </router-link>
              <router-link :to="{ name: 'admin-authorized-domains' }" class="menu-item">
                <AtSign class="w-4 h-4 mr-2" />
                Authorized Domains
              </router-link>
            </template>
          </div>
          <!-- Asset Management -->
          <div v-if="globalStore.user?.role === 'admin'" class="menu-section">
            <div class="menu-section-title">Asset Management</div>
            <router-link :to="{ name: 'admin-assets' }" class="menu-item">
              <Folders class="w-4 h-4 mr-2" />
              Assets
            </router-link>
            <router-link :to="{ name: 'admin-asset-types' }" class="menu-item">
              <FileCog class="w-4 h-4 mr-2" />
              Asset Types
            </router-link>
            <router-link :to="{ name: 'admin-licenses' }" class="menu-item">
              <Copyright class="w-4 h-4 mr-2" />
              Licenses
            </router-link>
          </div>
          <!-- Product Information Management -->
          <div v-if="globalStore.user?.role === 'admin'" class="menu-section">
            <div class="menu-section-title">PIM</div>
            <router-link :to="{ name: 'admin-products' }" class="menu-item">
              <Package class="w-4 h-4 mr-2" />
              Products
            </router-link>
            <router-link :to="{ name: 'admin-product-attributes' }" class="menu-item">
              <Blocks class="w-4 h-4 mr-2" />
              Attributes
            </router-link>
          </div>
        </div>
      </nav>
      <div class="sidebar-profile"><span class="workspace-mark">{{ globalStore.user?.name?.slice(0, 1) }}</span><div><strong>{{ globalStore.user?.name }}</strong><small>{{ globalStore.user?.role }}</small></div></div>
      <div class="sidebar-credit">
        Powered by
        <a href="https://damvia.com" target="_blank">Damvia</a>
      </div>
    </aside>
    <div class="admin-workspace">
      <header class="admin-topbar"><PathBreadcrumb :items="adminBreadcrumbItems" /><router-link :to="{ name: 'home' }" class="dv-button">Open your DAM <SquareChevronLeft /></router-link></header>
      <div v-if="showStorageBanner && storage" role="status" class="storage-banner flex items-center gap-2 px-8 py-2 text-sm"
        :class="storagePercent >= 90 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'">
        <HardDrive class="w-4 h-4" />
        <span><router-link :to="{ name: 'admin-dashboard' }" class="underline">Storage at {{ storagePercent }}% of the plan</router-link>
          ({{ formatStorage(storage.usedBytes) }} of {{ formatStorage(storage.quotaBytes ?? 0) }}).
          <template v-if="storage.quotaReachedAt">Cloud synchronisation is paused.</template>
          <template v-else>Free space before the plan is full.</template>
          <template v-if="storage.serverContactEmails.length"> Contact <a :href="`mailto:${storage.serverContactEmails.join(',')}`" class="underline">{{ storage.serverContactEmails.join(', ') }}</a>.</template>
        </span>
      </div>
      <main id="admin-content"><slot></slot></main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell { display:flex; height:100dvh; overflow:hidden; background:var(--dv-surface-canvas); }
.admin-sidebar { width:228px; flex-shrink:0; background:var(--dv-surface-nav); color:var(--dv-text-on-dark-secondary); padding:22px 4px 16px 18px; display:flex; flex-direction:column; overflow:hidden; }
.admin-brand { display:flex; align-items:center; gap:16px; padding:0 10px 18px; }
.admin-brand :deep(.client-logo--default) { width:108px; filter:brightness(0) invert(1); }
.admin-brand :deep(.client-logo--uploaded) { filter:none; background:white; padding:8px; border-radius:var(--dv-radius-graphic); width:128px; height:56px; object-fit:contain; }
.admin-brand span { font-size:9px; letter-spacing:.1em; border:1px solid #46527c; padding:3px 5px; border-radius:var(--dv-radius-data); }
.sidebar-profile { display:flex; align-items:center; gap:10px; padding:14px 8px; border-top:1px solid #252d52; border-bottom:1px solid #252d52; margin-bottom:22px; }
.workspace-mark { display:grid; place-items:center; flex-shrink:0; width:32px; height:34px; border-radius:var(--dv-radius-graphic); background:#242d57; color:white; }
.sidebar-profile strong { display:block; font-size:11px; color:var(--dv-text-on-dark); overflow-wrap:anywhere; }
.sidebar-profile small { display:block; font-size:10px; color:var(--dv-text-on-dark-muted); margin-top:3px; }
.admin-nav { flex:1; min-height:0; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#39436b transparent; }
.admin-nav::-webkit-scrollbar { width:5px; }
.admin-nav::-webkit-scrollbar-thumb { background:#39436b; }
.menu-section { margin-bottom:8px; }
.menu-section-title { color:var(--dv-text-on-dark-muted); font-size:10px; padding:8px 12px 4px; }
.menu-item { display:flex; align-items:center; padding:7px 12px; color:var(--dv-text-on-dark-secondary); font-size:12px; border-radius:0; margin:1px 0; }
.menu-item:hover { background:#172049; }
.menu-item.router-link-active { background:#193674; color:white; font-weight:550; }
.storage-banner { overflow-wrap:anywhere; }
.sidebar-storage { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; font-size:11px; padding:18px 10px; }
.sidebar-storage progress { width:100%; height:4px; border-radius:var(--dv-radius-data); accent-color:#85aaff; }
.sidebar-storage progress::-webkit-progress-bar { border-radius:var(--dv-radius-data); background:#28315a; }
.sidebar-storage progress::-webkit-progress-value { border-radius:var(--dv-radius-data); background:#85aaff; }
.sidebar-storage progress::-moz-progress-bar { border-radius:var(--dv-radius-data); background:#85aaff; }
.sidebar-storage small { color:var(--dv-text-on-dark-muted); }
.sidebar-profile { margin:0; }
.sidebar-credit { margin-top:16px; color:var(--dv-text-on-dark-muted); font-size:12px; }
.sidebar-credit a { color:var(--dv-text-on-dark-secondary); }
.sidebar-credit a:hover { color:var(--dv-text-on-dark); }
.admin-workspace { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; overflow:hidden; }
.admin-workspace > #admin-content { flex:1; min-height:0; overflow-y:auto; }
.admin-topbar { min-height:65px; padding:12px 36px; display:flex; align-items:center; justify-content:space-between; gap:16px; background:white; border-bottom:1px solid var(--dv-color-line); font-size:11px; color:var(--dv-text-secondary); }
.admin-topbar > :deep(.dv-breadcrumb) { flex:1; min-width:0; }
.admin-topbar :deep(.dv-breadcrumb__current) { text-transform:capitalize; }
.admin-topbar .dv-button { font-size:11px; }
.mobile-nav-toggle { display:none; }
@media(max-width:760px) {
 .admin-shell { height:auto; min-height:100dvh; display:block; overflow:visible; }
 .mobile-nav-toggle { display:flex; align-items:center; gap:10px; background:var(--dv-surface-nav); color:white; width:100%; padding:16px; font-size:13px; }
 .mobile-nav-toggle svg { width:18px; }
 .admin-sidebar { display:none; width:100%; }
 .admin-sidebar.is-open { display:flex; }
 .admin-nav { overflow:visible; }
 .admin-topbar { padding:12px 20px; }
 .admin-workspace { display:block; overflow-x:clip; overflow-y:visible; }
 .admin-workspace > #admin-content { overflow:visible; }
}
</style>
