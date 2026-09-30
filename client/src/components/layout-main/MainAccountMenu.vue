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
import { accountSections } from "@/components/account/accountSections"
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
import { LogOut, Settings, User, Users } from "@lucide/vue"

const globalStore = useGlobalStore()
</script>
<template>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" type="button" class="size-9" aria-label="My account" :title="globalStore.user?.name || 'My account'">
            <User class="size-5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent :collision-padding="16" align="end" class="w-60 p-1 [&_[role=menuitem]]:min-h-9 [&_[role=menuitem]]:gap-2 [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:text-body [&_[role=menuitem]]:whitespace-nowrap">
          <DropdownMenuLabel class="grid px-3 py-2 font-normal">
            <span class="truncate text-body font-semibold text-foreground">{{ globalStore.user?.name }}</span>
            <span class="truncate text-caption text-muted-foreground">{{ globalStore.user?.email }}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-for="section in accountSections" :key="section.id" as-child class="cursor-pointer">
            <router-link :to="{ name: 'account', params: { section: section.id } }">
              <component :is="section.icon" />
              <span>{{ section.label }}</span>
            </router-link>
          </DropdownMenuItem>
          <template v-if="['admin', 'manager'].includes(globalStore.user?.role ?? '')">
            <DropdownMenuSeparator />
            <DropdownMenuLabel class="px-3 text-caption font-medium text-muted-foreground">
              {{ globalStore.user?.role === 'admin' ? 'Administrate' : 'Manage' }}
            </DropdownMenuLabel>
            <DropdownMenuItem v-if="globalStore.user?.role === 'admin'" as-child class="cursor-pointer">
              <router-link :to="{ name: 'admin-dashboard' }">
                <Settings />
                <span>Administration</span>
              </router-link>
            </DropdownMenuItem>
            <DropdownMenuItem as-child class="cursor-pointer">
              <router-link :to="{ name: 'admin-users' }">
                <Users />
                <span>Manage Users</span>
              </router-link>
            </DropdownMenuItem>
          </template>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="globalStore.logout()" class="cursor-pointer">
            <LogOut />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
</template>
