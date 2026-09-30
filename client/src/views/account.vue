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
import AccountDisplay from "@/components/account/AccountDisplay.vue"
import AccountDownloads from "@/components/account/AccountDownloads.vue"
import AccountLinks from "@/components/account/AccountLinks.vue"
import AccountProfile from "@/components/account/AccountProfile.vue"
import AccountSecurity from "@/components/account/AccountSecurity.vue"
import { accountSection } from "@/components/account/accountSections"
import { useGlobalStore } from "@/stores/globalStore"
import { computed, watchEffect } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const globalStore = useGlobalStore()
const section = computed(() => accountSection(route.params.section))
const panels = { profile: AccountProfile, security: AccountSecurity, downloads: AccountDownloads, links: AccountLinks, display: AccountDisplay }

watchEffect(() => {
  const appName = globalStore.env?.appName
  document.title = appName ? `${section.value.label} · ${appName}` : section.value.label
})
</script>

<template>
  <div class="w-full max-w-[1200px] px-2 pb-16 pt-4 md:px-6" data-account-content>
    <header class="mb-8">
      <h1 class="text-[22px] font-semibold leading-8 text-neutral-950">{{ section.label }}</h1>
      <p class="mt-1 text-body text-neutral-500">{{ section.description }}</p>
    </header>
    <component :is="panels[section.id]" :key="section.id" />
  </div>
</template>
