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
import Logo from "@/assets/logo.svg"
import CollectionDialogAddToCollection from "@/components/collection/CollectionDialogAddToCollection.vue"
import CollectionDialogCreate from "@/components/collection/CollectionDialogCreate.vue"
import CollectionModalDownloadMulti from "@/components/collection/CollectionModalDownloadMulti.vue"
import MainSearchBar from "@/components/layout-main/MainSearchBar.vue"
import MainTopbarDownloadNotification from "@/components/layout-main/MainTopbarDownloadNotification.vue"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import LayoutDialogMember from "@/layouts/LayoutDialogMember.vue"
import { useGlobalStore } from "@/stores/globalStore"
import {
  Combine,
  Download,
  LayoutDashboard,
  Link,
  LogOut,
  Settings,
  SquareX,
  User,
  Users
} from "lucide-vue-next"
import { ref } from "vue"

const globalStore = useGlobalStore()
const isDownloadAssetModalOpen = ref<boolean>(false)
const isCreateCollectionModalOpen = ref<boolean>(false)
const isAddToCollectionModalOpen = ref<boolean>(false)
const showMemberDialog = ref(false)
const memberDialogInitialTab = ref<"downloads" | "links" | "profile" | "display-preferences">("downloads")
</script>

<template>
  <div class="fixed top-0 left-0 w-full h-[88px] flex items-center justify-between z-[9] px-4 pl-6 pr-7 shadow">
    <div class="dashboard-layout-topbar__left flex items-center gap-9">
      <router-link :to="{ name: 'home' }">
        <Logo class="mr-8" />
      </router-link>
      <MainSearchBar />
      <div v-if="globalStore.selection.length > 0"
        class="dashboard-layout-topbar__selector flex items-center gap-3 px-4 py-3 space-between outline-dashed outline-2 outline-neutral-500 hover:outline-solid hover:outline-neutral-600">
        <div class="flex items-center gap-1.5 font-medium text-neutral-500 mr-2">
          <button class="text-neutral-500 hover:text-neutral-800" @click="globalStore.clearSelection()"
            title="Clear selection">
            <SquareX />
          </button>
          <div class="whitespace-nowrap">
            {{ globalStore.selection.length }} item{{
              globalStore.selection.length > 1 ? "s" : ""
            }}
            selected in total
          </div>
        </div>
        <div class="flex items-center gap-3.5">
          <button class="text-neutral-500 hover:text-neutral-800" @click="isDownloadAssetModalOpen = true"
            title="Download selection">
            <Download />
          </button>
          <button v-if="globalStore.user?.role !== 'guest'" @click="isAddToCollectionModalOpen = true"
            title="Add selection to your collection" class="text-neutral-500 hover:text-neutral-800">
            <Combine />
          </button>
        </div>
      </div>
    </div>
    <div class="topbar__right flex items-center gap-2">
      <MainTopbarDownloadNotification />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" type="button" class="p-0">
            <User class="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent :collision-padding="40" class="flex flex-col gap-1 w-42 p-5">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'profile';
          ">
            <User class="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'downloads';
          ">
            <Download class="mr-2 h-4 w-4" />
            <span>My Downloads</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'links';
          ">
            <Link class="mr-2 h-4 w-4" />
            <span>My Links</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'display-preferences';
          ">
            <LayoutDashboard class="mr-2 h-4 w-4" />
            <span>Display Preferences</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel v-if="globalStore.user?.role === 'manager'">
            Manage
          </DropdownMenuLabel>
          <DropdownMenuLabel v-if="globalStore.user?.role === 'admin'">
            Administrate
          </DropdownMenuLabel>
          <DropdownMenuItem v-if="['admin'].includes(globalStore.user?.role ?? '')">
            <Settings class="mr-2 h-4 w-4" />
            <router-link :to="{ name: 'admin-menu-items' }">Settings</router-link>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')">
            <router-link :to="{ name: 'admin-users' }" class="flex items-center">
              <Users class="mr-2 h-4 w-4" />
              <span>Manage Users</span>
            </router-link>
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')"
            class="bg-neutral-400 text-neutral-400 my-3" />
          <DropdownMenuItem @click="globalStore.logout()" class="cursor-pointer">
            <LogOut class="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
  <CollectionModalDownloadMulti v-model="isDownloadAssetModalOpen" />
  <CollectionDialogCreate v-model="isCreateCollectionModalOpen" />
  <CollectionDialogAddToCollection v-model="isAddToCollectionModalOpen" />
  <LayoutDialogMember v-model:open="showMemberDialog" :initial-tab="memberDialogInitialTab" />
</template>

<style scoped lang="scss">
.dashboard-layout-topbar__selection-text {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 1rem;
  color: var(--primary-color50);
}

.dashboard-layout-topbar__user-button {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
}

.dashboard-layout-topbar__user-button svg {
  width: 1.5rem;
  height: 1.5rem;
}
</style>
