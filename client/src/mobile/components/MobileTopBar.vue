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
import { ChevronLeft } from "@lucide/vue"
import { useRouter } from "vue-router"
import ClientLogo from "@/components/ClientLogo.vue"

const props = defineProps<{ title?: string, back?: boolean | string, logo?: boolean }>()
const router = useRouter()

// Back follows the browser history when there is one, so the previous list
// comes back with its scroll position; a shared link falls back to a parent.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push(typeof props.back === "string" ? props.back : { name: "home" })
}
</script>

<template>
  <header class="mobile-top-bar">
    <button v-if="back" type="button" class="mobile-top-bar__back" aria-label="Back" @click="goBack">
      <ChevronLeft :size="24" aria-hidden="true" />
    </button>
    <ClientLogo v-if="logo" class="!h-8 !w-auto max-w-[120px]" />
    <h1 v-else class="mobile-top-bar__title">{{ title }}</h1>
    <div class="ml-auto flex items-center gap-1"><slot /></div>
  </header>
</template>

<style scoped>
.mobile-top-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: env(safe-area-inset-top) 16px 0;
  background: var(--dv-surface-panel);
  border-bottom: 1px solid var(--dv-color-line);
}
.mobile-top-bar__back {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-left: -12px;
  background: none;
  border: 0;
  color: inherit;
}
.mobile-top-bar__title {
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
