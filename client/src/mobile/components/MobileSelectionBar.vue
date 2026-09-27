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
import { computed, ref } from "vue"
import { Download, FolderPlus, X } from "@lucide/vue"
import { useGlobalStore } from "@/stores/globalStore"
import { useMobileSelection } from "../composables"
import MobileDownloadSheet from "./MobileDownloadSheet.vue"
import MobileAddToCollection from "./MobileAddToCollection.vue"

const emit = defineEmits<{ done: [] }>()
const store = useGlobalStore()
const selection = useMobileSelection()
const isGuest = computed(() => store.user?.role === "guest")
const downloading = ref(false)
const adding = ref(false)
function finish() {
  selection.clear()
  emit("done")
}
</script>

<template>
  <div v-if="selection.count.value" class="mobile-selection" role="region" aria-label="Selection">
    <button type="button" class="mobile-selection__clear" aria-label="Clear selection" @click="finish"><X :size="20" aria-hidden="true" /></button>
    <span class="flex-1 font-medium" aria-live="polite">{{ selection.count.value }} selected</span>
    <button v-if="!isGuest" type="button" class="mobile-selection__action" @click="adding = true"><FolderPlus :size="20" aria-hidden="true" />Add</button>
    <button type="button" class="mobile-selection__action mobile-selection__action--primary" @click="downloading = true"><Download :size="20" aria-hidden="true" />Download</button>
    <MobileDownloadSheet v-model:open="downloading" :items="selection.selection.value" @done="finish" />
    <MobileAddToCollection v-model:open="adding" :items="selection.selection.value" @done="finish" />
  </div>
</template>

<style scoped>
.mobile-selection {
  position: fixed;
  inset: auto 8px calc(64px + env(safe-area-inset-bottom)) 8px;
  z-index: 41;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--dv-surface-panel);
  border: 1px solid var(--dv-color-line-strong);
  border-radius: var(--dv-radius-lg);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
}
.mobile-selection__clear {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  background: none;
  border: 0;
  color: inherit;
}
.mobile-selection__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--dv-color-line-strong);
  border-radius: var(--dv-radius-button);
  background: none;
  color: inherit;
  font-size: 14px;
}
.mobile-selection__action--primary {
  background: var(--dv-action-primary);
  border-color: var(--dv-action-primary);
  color: var(--dv-color-white);
}
</style>
