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
import { computed } from "vue"
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
  <div class="flex h-screen overflow-hidden">
    <div class="bg-neutral-800 text-neutral-50 w-50 py-8 pl-5 pr-5 flex flex-col">
      <router-link :to="{ name: 'home' }" class="mb-6 flex items-center text-neutral-300 hover:text-neutral-200">
        <SquareChevronLeft class="w-5 h-5 mr-2" /> Back to the DAM
      </router-link>
      <div class="flex-1 overflow-y-auto">
        <div class="flex flex-col gap-1.5 mb-4 mt-5">
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
      </div>
      <div class="mt-4 text-neutral-400 text-xs">
        Powered by
        <a href="https://damvia.com" target="_blank" class="text-neutral-200 hover:text-neutral-100">Damvia</a>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto">
      <router-link v-if="showStorageBanner && storage" :to="{ name: 'admin-dashboard' }" active-class=""
        exact-active-class="" class="flex items-center gap-2 px-8 py-2 text-sm"
        :class="storagePercent >= 90 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'">
        <HardDrive class="w-4 h-4" />
        <span>
          Storage at {{ storagePercent }}% of the plan
          ({{ formatStorage(storage.usedBytes) }} of {{ formatStorage(storage.quotaBytes ?? 0) }}).
          <template v-if="storage.quotaReachedAt">Cloud synchronisation is paused.</template>
          <template v-else>Free space before the plan is full.</template>
        </span>
      </router-link>
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.menu-section {
  @apply mb-4;
}

.menu-section-title {
  @apply text-neutral-400 uppercase text-xs mb-1;
}

.menu-item {
  @apply flex items-center py-1.5 px-1 text-neutral-200 hover:bg-neutral-700;
}

.router-link-active {
  @apply font-medium bg-neutral-700;
}

.overflow-y-auto {
  scrollbar-width: thin;
  scrollbar-color: theme('colors.neutral.600') theme('colors.neutral.800');
}

.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: theme('colors.neutral.800');
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: theme('colors.neutral.600');
  border-radius: 3px;
}
</style>
