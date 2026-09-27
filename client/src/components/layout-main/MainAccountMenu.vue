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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useGlobalStore } from "@/stores/globalStore"
import {
  Download,
  LayoutDashboard,
  Link,
  LogOut,
  Settings,
  User,
  Users
} from "@lucide/vue"
import { defineAsyncComponent, ref } from "vue"

const globalStore = useGlobalStore()
const showMemberDialog = ref(false)
const memberDialogInitialTab = ref<"downloads" | "links" | "profile" | "display-preferences">("downloads")
const LayoutDialogMember = defineAsyncComponent(() => import("@/layouts/LayoutDialogMember.vue"))
</script>
<template>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" type="button" class="size-9" aria-label="My account" :title="globalStore.user?.name || 'My account'">
            <User class="size-5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent :collision-padding="16" align="end" class="w-60 p-1 [&_[role=menuitem]]:min-h-9 [&_[role=menuitem]]:gap-2 [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:text-body [&_[role=menuitem]]:whitespace-nowrap">
          <DropdownMenuLabel class="px-3 text-caption font-medium text-muted-foreground">My Account</DropdownMenuLabel>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'profile';
          ">
            <User />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'downloads';
          ">
            <Download />
            <span>My Downloads</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'links';
          ">
            <Link />
            <span>My Links</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="
            showMemberDialog = true
          memberDialogInitialTab = 'display-preferences';
          ">
            <LayoutDashboard />
            <span>Display preferences</span>
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
              <Settings />
              <span>Administration</span>
            </router-link>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')">
            <router-link :to="{ name: 'admin-users' }" class="flex w-full items-center gap-2">
              <Users />
              <span>Manage Users</span>
            </router-link>
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')"
            class="my-1" />
          <DropdownMenuItem @click="globalStore.logout()" class="cursor-pointer">
            <LogOut />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  <LayoutDialogMember v-model:open="showMemberDialog" :initial-tab="memberDialogInitialTab" />
</template>
