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
import AccountDownloadRow from "@/components/account/AccountDownloadRow.vue"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useDownloadStore } from "@/stores/downloadStore"
import dayjs from "dayjs"
import { ArrowDown, ArrowRight, File, FileDown } from "@lucide/vue"
import { storeToRefs } from "pinia"
import { computed, onMounted, ref } from "vue"

const downloadStore = useDownloadStore()
const { activeDownloadRequests, downloads, hasPreparingDownloads, newDownloads } = storeToRefs(downloadStore)
const preparing = computed(() => activeDownloadRequests.value > 0 || hasPreparingDownloads.value)
const ready = computed(() => !!downloads.value?.some(download => download.status === 'ready'))
const open = ref(false)
const newIds = computed(() => new Set((newDownloads.value ?? []).map(download => download.id)))
const recent = computed(() => [...(downloads.value ?? [])]
  .filter(download => download.status !== "expired")
  .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
  .slice(0, 4))

// The dots stay while the list is open so the new rows can be told apart.
function onOpenChange(value: boolean) {
  open.value = value
  if (!value) downloadStore.markDownloadsAsSeen()
}

onMounted(() => {
  void downloadStore.fetchInitialDownloads()
})
</script>

<template>
  <span class="sr-only" role="status" aria-live="polite">
    {{ preparing ? 'Preparing download' : ready ? 'Download ready' : '' }}
  </span>
  <Popover v-if="preparing || ready" :open="open" @update:open="onOpenChange">
    <PopoverTrigger as-child>
      <button type="button" class="download-status"
        :class="{ 'is-ready': !preparing && ready }"
        :aria-label="preparing ? 'Preparing download — open downloads' : 'Download ready — open downloads'"
        :title="preparing ? 'Preparing download' : 'Download ready'">
        <span class="download-status__icon" aria-hidden="true">
          <template v-if="preparing">
            <File class="size-5 stroke-[1.75]" />
            <ArrowDown class="download-status__arrow size-3.5 stroke-[2.25]" />
          </template>
          <FileDown v-else class="size-5 stroke-[1.75]" />
        </span>
        <span v-if="!preparing && newDownloads?.length" class="download-status__dot" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" :collision-padding="16" class="w-[min(400px,calc(100vw-32px))] p-0" aria-labelledby="topbar-downloads-title">
      <h2 id="topbar-downloads-title" class="border-b border-neutral-200 px-4 py-3 text-body font-semibold">Downloads</h2>
      <p v-if="!recent.length" class="px-4 py-4 text-body text-neutral-500">Preparing your download…</p>
      <ul v-else class="divide-y divide-neutral-100 px-4">
        <AccountDownloadRow v-for="download in recent" :key="download.id" :download="download" :is-new="newIds.has(download.id)" compact />
      </ul>
      <router-link :to="{ name: 'account', params: { section: 'downloads' } }" class="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-body font-medium hover:bg-neutral-50" @click="onOpenChange(false)">
        All downloads<ArrowRight class="size-4" aria-hidden="true" />
      </router-link>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.download-status { position:relative; display:grid; flex:none; place-items:center; width:36px; height:36px; color:#525252; }
.download-status:hover { background:#f5f5f5; color:#171717; }
.download-status:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
.download-status.is-ready { color:#166534; }
.download-status__icon { position:relative; display:grid; place-items:center; }
.download-status__arrow { position:absolute; right:-5px; bottom:-3px; background:white; animation:download-arrow 1.25s ease-in-out infinite; }
.download-status__dot { position:absolute; right:3px; top:3px; width:6px; height:6px; border-radius:50%; background:#16a34a; }
@keyframes download-arrow { 0%, 100% { transform:translateY(-3px); opacity:.55; } 55% { transform:translateY(2px); opacity:1; } }
@media (prefers-reduced-motion:reduce) { .download-status__arrow { animation:none; } }
</style>
