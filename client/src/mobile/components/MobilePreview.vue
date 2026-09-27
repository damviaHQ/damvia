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
import { DialogContent, DialogDescription, DialogPortal, DialogRoot, DialogTitle } from "reka-ui"
import { ChevronLeft, ChevronRight, Download, FolderPlus, Link2, Star, X } from "@lucide/vue"
import { useFileFavorites } from "@/composables/useFileFavorites"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useGlobalStore } from "@/stores/globalStore"
import { formatFileSize } from "@/utils/fileSize"
import type { MobileFile } from "../composables"
import MobileDownloadSheet from "./MobileDownloadSheet.vue"
import MobileAddToCollection from "./MobileAddToCollection.vue"

const props = defineProps<{ files: MobileFile[], index: number }>()
const emit = defineEmits<{ close: [], show: [index: number] }>()
const store = useGlobalStore()
const toast = useGlobalToast()
const favorites = useFileFavorites()
const isGuest = computed(() => store.user?.role === "guest")
const file = computed(() => props.files[props.index])
const downloading = ref(false)
const adding = ref(false)

const facts = computed(() => [
  ...(file.value?.record?.attributes ?? []).flatMap((attribute) => attribute ? [{ label: attribute.displayName || attribute.name, value: String(attribute.value ?? "") }] : []),
  ...(file.value?.metadata ?? []).map((entry) => ({ label: entry.displayName || entry.label || entry.name || "", value: String(entry.value ?? "") })),
].filter((fact) => fact.value))

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast.success(`${what} copied`)
}
// The link opens the same file in its collection. It gives no access by itself:
// the person receiving it signs in and sees it only if they may.
function copyLink() {
  const current = file.value
  if (!current?.collectionId) return
  const url = new URL(`/collections/${current.collectionId}`, window.location.origin)
  url.searchParams.set("preview", current.id)
  copy(url.toString(), "Link")
}

let startX = 0
function touchStart(event: TouchEvent) { startX = event.changedTouches[0].clientX }
function touchEnd(event: TouchEvent) {
  const dx = event.changedTouches[0].clientX - startX
  if (Math.abs(dx) < 60) return
  const next = props.index + (dx < 0 ? 1 : -1)
  if (next >= 0 && next < props.files.length) emit("show", next)
}
</script>

<template>
  <DialogRoot :open="!!file" @update:open="(value) => { if (!value) emit('close') }">
    <DialogPortal>
      <DialogContent v-if="file" class="mobile-preview dv-theme dv-neutral dv-client">
        <header class="mobile-preview__bar">
          <button type="button" class="mobile-preview__icon" aria-label="Close" @click="emit('close')"><X :size="22" aria-hidden="true" /></button>
          <DialogTitle class="min-w-0 flex-1 truncate text-[15px] font-medium">{{ file.name }}</DialogTitle>
          <span class="shrink-0 text-sm text-white/70">{{ index + 1 }} / {{ files.length }}</span>
        </header>
        <DialogDescription class="sr-only">Preview of {{ file.name }}. Swipe to see the next file.</DialogDescription>

        <div class="mobile-preview__media" @touchstart.passive="touchStart" @touchend.passive="touchEnd">
          <video v-if="file.mimeType.startsWith('video/')" :key="file.id" :src="file.fileURL" :poster="file.thumbnailURL ?? undefined" controls playsinline preload="metadata" />
          <img v-else-if="file.thumbnailURL" :src="file.thumbnailURL" :alt="file.name" />
          <p v-else class="text-white/70">No preview for this file</p>
          <button v-if="index > 0" type="button" class="mobile-preview__nav left-2" aria-label="Previous file" @click="emit('show', index - 1)"><ChevronLeft :size="24" aria-hidden="true" /></button>
          <button v-if="index < files.length - 1" type="button" class="mobile-preview__nav right-2" aria-label="Next file" @click="emit('show', index + 1)"><ChevronRight :size="24" aria-hidden="true" /></button>
        </div>

        <section class="mobile-preview__details">
          <p class="text-sm text-[var(--dv-text-secondary)]">{{ [file.name.split(".").pop()?.toUpperCase(), formatFileSize(file.size)].filter(Boolean).join(" · ") }}</p>
          <p v-if="file.license" class="text-sm">Usage terms: {{ file.license.name }}</p>
          <dl v-if="facts.length" class="grid">
            <div v-for="fact in facts" :key="fact.label" class="mobile-preview__fact">
              <dt class="text-sm text-[var(--dv-text-secondary)]">{{ fact.label }}</dt>
              <dd class="m-0"><button type="button" class="w-full break-words bg-transparent p-0 text-left text-inherit" :aria-label="`Copy ${fact.label}: ${fact.value}`" @click="copy(fact.value, fact.label)">{{ fact.value }}</button></dd>
            </div>
          </dl>
        </section>

        <footer class="mobile-preview__actions">
          <button type="button" @click="downloading = true"><Download :size="22" aria-hidden="true" />Download</button>
          <button v-if="!isGuest" type="button" :aria-pressed="favorites.isFavorite(file as any)" @click="favorites.toggle(file as any)">
            <Star :size="22" aria-hidden="true" :fill="favorites.isFavorite(file as any) ? 'currentColor' : 'none'" />{{ favorites.isFavorite(file as any) ? "Saved" : "Save" }}
          </button>
          <button v-if="!isGuest" type="button" @click="adding = true"><FolderPlus :size="22" aria-hidden="true" />Add</button>
          <button v-if="file.collectionId" type="button" @click="copyLink"><Link2 :size="22" aria-hidden="true" />Copy link</button>
        </footer>
        <MobileDownloadSheet v-model:open="downloading" :items="[{ type: 'file', id: file.id }]" />
        <MobileAddToCollection v-model:open="adding" :items="[{ type: 'file', id: file.id }]" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.mobile-preview {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: grid;
  /* One column exactly as wide as the screen: long names and wide videos
     shrink inside it instead of pushing the page sideways. */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(40dvh, 1fr) auto auto;
  width: 100vw;
  max-width: 100%;
  overflow: hidden;
  background: #0b0b0c;
  color: var(--dv-text-primary);
  font-size: 16px;
}
.mobile-preview__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: env(safe-area-inset-top) 12px 0 4px;
  color: #fff;
}
.mobile-preview__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  background: none;
  border: 0;
  color: inherit;
}
.mobile-preview__media {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
  overflow: hidden;
}
.mobile-preview__media img,
.mobile-preview__media video {
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.mobile-preview__nav {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  transform: translateY(-50%);
  border: 0;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.4);
  color: #fff;
}
.mobile-preview__details {
  display: grid;
  min-width: 0;
  overflow-wrap: anywhere;
  gap: 8px;
  max-height: 30dvh;
  overflow-y: auto;
  padding: 12px 16px;
  background: var(--dv-surface-panel);
}
.mobile-preview__fact {
  display: grid;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--dv-color-line);
}
.mobile-preview__actions {
  display: flex;
  padding: 4px 8px max(8px, env(safe-area-inset-bottom));
  background: var(--dv-surface-panel);
  border-top: 1px solid var(--dv-color-line);
}
.mobile-preview__actions button {
  flex: 1 1 0;
  min-width: 0;
  overflow-wrap: anywhere;
  display: grid;
  justify-items: center;
  gap: 2px;
  min-height: 56px;
  padding-top: 6px;
  font-size: 12px;
  background: none;
  border: 0;
  color: inherit;
}
</style>
