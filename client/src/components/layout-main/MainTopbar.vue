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
import Logo from "@/components/ClientLogo.vue"
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
  <header class="client-topbar fixed inset-x-0 top-0 z-10 flex h-[88px] items-center justify-between gap-6 border-b border-neutral-200 bg-white px-6 max-md:pl-16 md:h-[72px]">
    <div class="dashboard-layout-topbar__left flex min-w-0 flex-1 items-center gap-8">
      <router-link :to="{ name: 'home' }">
        <Logo class="w-[124px] shrink-0 max-md:w-[88px]" />
      </router-link>
      <MainSearchBar />
      <div v-if="globalStore.selection.length > 0"
        class="dashboard-layout-topbar__selector flex items-center gap-4 border-l border-neutral-200 pl-6 text-body max-md:hidden">
        <div class="flex items-center gap-1.5 font-medium text-neutral-500 mr-2">
          <button class="text-neutral-500 hover:text-neutral-800" @click="globalStore.clearSelection()"
            title="Clear selection" aria-label="Clear selection">
            <SquareX class="size-6 shrink-0" />
          </button>
          <div class="whitespace-nowrap">
            {{ globalStore.selection.length }} item{{
              globalStore.selection.length > 1 ? "s" : ""
            }}
            selected
          </div>
        </div>
        <div class="flex items-center gap-3.5">
          <button class="text-neutral-500 hover:text-neutral-800" @click="isDownloadAssetModalOpen = true"
            title="Download selection" aria-label="Download selection">
            <Download class="size-6 shrink-0" />
          </button>
          <button v-if="globalStore.user?.role !== 'guest'" @click="isAddToCollectionModalOpen = true"
            title="Add selection to your collection" aria-label="Add selection to your collection" class="text-neutral-500 hover:text-neutral-800">
            <Combine class="size-6 shrink-0" />
          </button>
        </div>
      </div>
    </div>
    <div class="topbar__right flex items-center gap-2">
      <MainTopbarDownloadNotification />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" type="button" class="p-0" aria-label="My account">
            <User class="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent :collision-padding="16" align="end" class="w-60 p-1 [&_[role=menuitem]]:min-h-9 [&_[role=menuitem]]:gap-2 [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:text-body [&_[role=menuitem]]:whitespace-nowrap">
          <DropdownMenuLabel class="px-3 text-caption font-medium text-muted-foreground">My Account</DropdownMenuLabel>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'profile';
          ">
            <User class="size-4 shrink-0" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'downloads';
          ">
            <Download class="size-4 shrink-0" />
            <span>My Downloads</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'links';
          ">
            <Link class="size-4 shrink-0" />
            <span>My Links</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'display-preferences';
          ">
            <LayoutDashboard class="size-4 shrink-0" />
            <span>Display Preferences</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel class="px-3 text-caption font-medium text-muted-foreground" v-if="globalStore.user?.role === 'manager'">
            Manage
          </DropdownMenuLabel>
          <DropdownMenuLabel class="px-3 text-caption font-medium text-muted-foreground" v-if="globalStore.user?.role === 'admin'">
            Administrate
          </DropdownMenuLabel>
          <DropdownMenuItem v-if="['admin'].includes(globalStore.user?.role ?? '')">
            <router-link :to="{ name: 'admin-dashboard' }" class="flex w-full items-center gap-2">
              <Settings class="size-4 shrink-0" />
              <span>Administration</span>
            </router-link>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')">
            <router-link :to="{ name: 'admin-users' }" class="flex w-full items-center gap-2">
              <Users class="size-4 shrink-0" />
              <span>Manage Users</span>
            </router-link>
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')"
            class="my-1" />
          <DropdownMenuItem @click="globalStore.logout()" class="cursor-pointer">
            <LogOut class="size-4 shrink-0" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
  <CollectionModalDownloadMulti v-model="isDownloadAssetModalOpen" />
  <CollectionDialogCreate v-model="isCreateCollectionModalOpen" />
  <CollectionDialogAddToCollection v-model="isAddToCollectionModalOpen" />
  <LayoutDialogMember v-model:open="showMemberDialog" :initial-tab="memberDialogInitialTab" />
</template>
