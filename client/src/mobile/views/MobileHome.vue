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
import { watch } from "vue"
import { useRouter } from "vue-router"
import Loader from "@/components/Loader.vue"
import { useHomeTarget } from "@/composables/useHomeTarget"
import MobileTopBar from "../components/MobileTopBar.vue"

const router = useRouter()
const { target } = useHomeTarget()
watch(target, (next) => { if (next) router.replace(next) }, { immediate: true })
</script>

<template>
  <MobileTopBar logo />
  <section v-if="target === false" class="grid gap-3 px-4 pt-10 text-center">
    <h1 class="text-lg font-semibold">Welcome</h1>
    <p class="text-[var(--dv-text-secondary)]">Browse the library or search for a file.</p>
    <div class="flex justify-center gap-3">
      <router-link :to="{ name: 'library' }" class="min-h-11 inline-flex items-center underline">Library</router-link>
      <router-link :to="{ name: 'search' }" class="min-h-11 inline-flex items-center underline">Search</router-link>
    </div>
  </section>
  <Loader v-else :text="true" />
</template>
