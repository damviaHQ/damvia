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
import { nextTick, ref, watch } from "vue"
import { ChevronLeft, ChevronRight } from "@lucide/vue"
import { useRouter } from "vue-router"
import ClientLogo from "@/components/ClientLogo.vue"
import type { Crumb } from "../composables"

// One row: Back, then where the person is. With a trail, the last step is the
// current screen, so no separate title takes up room.
const props = defineProps<{ title?: string, back?: boolean | string, logo?: boolean, trail?: Crumb[] }>()
const router = useRouter()
const scroller = ref<HTMLElement | null>(null)

// Back follows the browser history when there is one, so the previous list
// comes back with its scroll position; a shared link falls back to a parent.
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push(typeof props.back === "string" ? props.back : { name: "home" })
}
// A long trail keeps its end, the current screen, in view.
watch(() => [props.trail, props.title], async () => {
  await nextTick()
  if (scroller.value) scroller.value.scrollLeft = scroller.value.scrollWidth
}, { immediate: true, deep: true })
</script>

<template>
  <header class="mobile-top-bar">
    <button v-if="back" type="button" class="mobile-top-bar__back" aria-label="Back" @click="goBack">
      <ChevronLeft :size="24" aria-hidden="true" />
    </button>
    <template v-if="logo">
      <ClientLogo class="!h-8 !w-auto max-w-[120px]" />
      <h1 v-if="title" class="sr-only">{{ title }}</h1>
    </template>
    <nav v-else-if="trail" ref="scroller" class="mobile-trail" aria-label="You are here">
      <ol>
        <li v-for="crumb in trail" :key="`${crumb.label}-${JSON.stringify(crumb.to)}`">
          <router-link v-if="crumb.to" :to="crumb.to" class="mobile-trail__link">{{ crumb.label }}</router-link>
          <ChevronRight :size="14" aria-hidden="true" class="mobile-trail__separator" />
        </li>
        <li><h1 class="mobile-trail__current" aria-current="page">{{ title }}</h1></li>
      </ol>
    </nav>
    <h1 v-else class="mobile-top-bar__title">{{ title }}</h1>
    <div class="ml-auto flex shrink-0 items-center gap-1"><slot /></div>
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
  min-height: 52px;
  padding: env(safe-area-inset-top) 16px 0;
  background: var(--dv-surface-panel);
  border-bottom: 1px solid var(--dv-color-line);
}
.mobile-top-bar__back {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-left: -12px;
  margin-right: -8px;
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
.mobile-trail {
  min-width: 0;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}
.mobile-trail::-webkit-scrollbar {
  display: none;
}
.mobile-trail ol {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
  white-space: nowrap;
}
.mobile-trail li {
  display: flex;
  align-items: center;
}
.mobile-trail__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 2px;
  font-size: 14px;
  color: var(--dv-text-secondary);
  text-decoration: none;
}
.mobile-trail__separator {
  margin: 0 2px;
  color: var(--dv-text-secondary);
}
.mobile-trail__current {
  font-size: 16px;
  font-weight: 600;
}
</style>
