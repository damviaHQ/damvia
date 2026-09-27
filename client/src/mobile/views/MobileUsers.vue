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
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useQuery } from "@tanstack/vue-query"
import { ChevronRight, Search } from "@lucide/vue"
import Loader from "@/components/Loader.vue"
import { trpc } from "@/services/server"
import { userState, type AdminUser } from "@/utils/adminUsers"
import MobileTopBar from "../components/MobileTopBar.vue"

type Tab = "pending" | "active" | "unverified" | "suspended"
const route = useRoute()
const router = useRouter()
const search = ref("")
const { data: users, isLoading, error, refetch } = useQuery({ queryKey: ["users"], queryFn: () => trpc.user.list.query() })

// A suspended account keeps its approval, so it gets its own tab rather than
// showing among active people.
function stateOf(user: AdminUser & { suspendedAt?: Date | string | null }): Tab {
  return user.suspendedAt ? "suspended" : userState(user)
}
const counts = computed(() => {
  const result: Record<Tab, number> = { pending: 0, active: 0, unverified: 0, suspended: 0 }
  for (const user of users.value ?? []) result[stateOf(user)]++
  return result
})
const tab = computed<Tab>(() => {
  const asked = route.query.tab as Tab | undefined
  if (asked && asked in counts.value) return asked
  return counts.value.pending ? "pending" : "active"
})
watch(() => route.query.needsApproval, (value) => { if (value) router.replace({ query: { tab: "pending" } }) }, { immediate: true })
const tabs: { id: Tab, label: string }[] = [
  { id: "pending", label: "Needs approval" },
  { id: "active", label: "Active" },
  { id: "unverified", label: "Unverified" },
  { id: "suspended", label: "Suspended" },
]
const shown = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (users.value ?? [])
    .filter((user) => query ? [user.name, user.email, user.company].some((value) => value.toLocaleLowerCase().includes(query)) : stateOf(user) === tab.value)
    .sort((a, b) => a.name.localeCompare(b.name))
})
</script>

<template>
  <MobileTopBar title="Users" back="/account" :trail="[{ label: 'Account', to: { name: 'account' } }]" />
  <div class="sticky top-[52px] z-20 grid gap-2 border-b border-[var(--dv-color-line)] bg-[var(--dv-surface-panel)] px-4 py-2">
    <label class="flex min-h-11 items-center gap-2 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3">
      <Search :size="18" aria-hidden="true" class="text-[var(--dv-text-secondary)]" />
      <span class="sr-only">Search people</span>
      <input v-model="search" type="search" placeholder="Name, email or company" autocomplete="off" class="min-w-0 flex-1 bg-transparent text-base outline-none" />
    </label>
    <div v-if="!search" class="flex gap-2 overflow-x-auto" role="tablist" aria-label="Status">
      <router-link v-for="entry in tabs" :key="entry.id" :to="{ query: { tab: entry.id } }" replace role="tab" :aria-selected="tab === entry.id"
        class="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[var(--dv-radius-pill)] border px-3 text-sm no-underline"
        :class="tab === entry.id ? 'border-[var(--dv-action-primary)] bg-[var(--dv-action-primary)] text-[var(--dv-color-white)]' : 'border-[var(--dv-color-line-strong)] text-inherit'">
        {{ entry.label }}<span>{{ counts[entry.id] }}</span>
      </router-link>
    </div>
  </div>
  <Loader v-if="isLoading" :text="true" />
  <p v-else-if="error" role="alert" class="grid gap-3 px-4 pt-8 text-center">People could not be loaded.<button type="button" class="min-h-11 underline" @click="refetch()">Try again</button></p>
  <ul v-else class="m-0 list-none p-0 pb-24">
    <li v-for="user in shown" :key="user.id">
      <router-link :to="{ name: 'admin-user', params: { id: user.id } }" class="flex min-h-16 items-center gap-3 border-b border-[var(--dv-color-line)] px-4 py-2 no-underline text-inherit">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ user.name }}</p>
          <p class="truncate text-sm text-[var(--dv-text-secondary)]">{{ user.email }}</p>
          <p class="truncate text-sm text-[var(--dv-text-secondary)]">{{ [user.company, user.region, user.role].filter(Boolean).join(" · ") }}</p>
        </div>
        <ChevronRight :size="18" aria-hidden="true" />
      </router-link>
    </li>
    <li v-if="!shown.length" class="px-4 pt-8 text-center text-[var(--dv-text-secondary)]">{{ search ? "Nobody matches." : "Nobody here." }}</li>
  </ul>
</template>
