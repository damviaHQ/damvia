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
import Loader from "@/components/Loader.vue"
import { useHomeTarget } from "@/composables/useHomeTarget"
import MobileTopBar from "../components/MobileTopBar.vue"
import MobileCollection from "./MobileCollection.vue"
import MobilePage from "./MobilePage.vue"

// Home is the first screen: it shows the tenant's home collection or page
// itself, so the address stays "/" and there is nothing to go back to.
const { home } = useHomeTarget()
</script>

<template>
  <MobileCollection v-if="home && home.type === 'collection'" :key="home.id" :home-id="home.id" />
  <MobilePage v-else-if="home && home.type === 'page'" :key="home.id" :home-id="home.id" />
  <template v-else>
    <MobileTopBar logo />
    <section v-if="home === false" class="grid gap-3 px-4 pt-10 text-center">
      <h1 class="text-lg font-semibold">Welcome</h1>
      <p class="text-[var(--dv-text-secondary)]">Open the menu below to browse the library, or search for a file.</p>
      <div class="flex justify-center">
        <router-link :to="{ name: 'search' }" class="min-h-11 inline-flex items-center underline">Search</router-link>
      </div>
    </section>
    <Loader v-else :text="true" />
  </template>
</template>
