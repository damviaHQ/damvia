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
import { accountSection, accountSections } from "@/components/account/accountSections"
import { menuIconClasses, sidebarRowClasses, sidebarSectionTitleClasses, treeActiveRowClasses } from "@/components/layout-main/navigationStyles"
import { useDownloadStore } from "@/stores/downloadStore"
import { useGlobalStore } from "@/stores/globalStore"
import { ArrowLeft, LogOut } from "@lucide/vue"
import { storeToRefs } from "pinia"
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const globalStore = useGlobalStore()
const { downloads } = storeToRefs(useDownloadStore())

// The sidebar stays mounted while moving between sections, so the page that
// opened the account is read once and "Back" returns there.
const previous = typeof window !== "undefined" ? window.history.state?.back : null
const back = typeof previous === "string" && !previous.startsWith("/account") ? previous : "/"

const current = computed(() => accountSection(route.params.section).id)
const readyCount = computed(() => (downloads.value ?? []).filter(download => download.status === "ready").length)
const initials = computed(() => (globalStore.user?.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?")
const roleLabel: Record<string, string> = { admin: "Administrator", manager: "Manager", member: "Member", guest: "Guest" }
</script>

<template>
  <nav aria-label="Account" class="flex min-h-full flex-col gap-5">
    <router-link :to="back" :class="sidebarRowClasses" data-account-back>
      <ArrowLeft :class="menuIconClasses" aria-hidden="true" />Back to library
    </router-link>

    <div class="flex min-w-0 items-center gap-3 px-3">
      <span class="grid size-10 shrink-0 place-items-center bg-neutral-200 text-body font-semibold text-neutral-700" aria-hidden="true">{{ initials }}</span>
      <div class="min-w-0">
        <p class="truncate text-body font-semibold text-neutral-950">{{ globalStore.user?.name }}</p>
        <p class="truncate text-caption text-neutral-500" :title="globalStore.user?.email">{{ globalStore.user?.email }}</p>
        <p v-if="globalStore.user?.role" class="text-caption text-neutral-500">{{ roleLabel[globalStore.user.role] ?? globalStore.user.role }}</p>
      </div>
    </div>

    <div class="grid gap-1">
      <p :class="sidebarSectionTitleClasses" class="pb-1">Account</p>
      <router-link v-for="section in accountSections" :key="section.id" :to="{ name: 'account', params: { section: section.id } }"
        :class="[sidebarRowClasses, current === section.id && treeActiveRowClasses]" :aria-current="current === section.id ? 'page' : undefined">
        <component :is="section.icon" :class="menuIconClasses" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ section.label }}</span>
        <span v-if="section.id === 'downloads' && readyCount" class="min-w-5 bg-neutral-200 px-1.5 text-center text-caption font-semibold tabular-nums text-neutral-700">
          {{ readyCount }}<span class="sr-only"> ready</span>
        </span>
      </router-link>
    </div>

    <button type="button" :class="sidebarRowClasses" class="mt-auto w-full" @click="globalStore.logout()">
      <LogOut :class="menuIconClasses" aria-hidden="true" />Log out
    </button>
  </nav>
</template>
