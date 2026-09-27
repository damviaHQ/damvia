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
import { ref } from "vue"
import { useRoute } from "vue-router"
import { Monitor, Link2 } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import MobileTopBar from "./components/MobileTopBar.vue"

// Editing, configuration and dense tables stay on computers. The page still
// explains itself and keeps its address so it can be opened there later.
const route = useRoute()
const copied = ref(false)
async function copyLink() {
  await navigator.clipboard.writeText(window.location.origin + route.fullPath)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <MobileTopBar :title="String(route.meta.title ?? 'Damvia')" back />
  <section class="grid gap-4 px-4 pt-10 text-center justify-items-center">
    <Monitor :size="40" class="text-[var(--dv-text-secondary)]" aria-hidden="true" />
    <h1 class="text-lg font-semibold">Open this on a computer</h1>
    <p class="max-w-[32ch] text-[var(--dv-text-secondary)]">{{ route.meta.title ?? "This screen" }} needs a larger screen. Copy the link to open it later on your computer.</p>
    <Button type="button" variant="outline" class="min-h-11" @click="copyLink">
      <Link2 :size="18" aria-hidden="true" />{{ copied ? "Link copied" : "Copy link" }}
    </Button>
    <router-link :to="{ name: 'home' }" class="min-h-11 inline-flex items-center underline">Back to home</router-link>
  </section>
</template>
