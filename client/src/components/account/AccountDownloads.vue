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
import { accountDisclosureClasses, accountDisclosureSummaryClasses, accountGroupTitleClasses, accountListClasses } from "@/components/account/accountStyles"
import Loader from "@/components/Loader.vue"
import { useDownloadStore } from "@/stores/downloadStore"
import dayjs from "dayjs"
import { ChevronRight } from "@lucide/vue"
import { storeToRefs } from "pinia"
import { computed, onBeforeUnmount, watch } from "vue"

const downloadStore = useDownloadStore()
const { downloads, newDownloads, status } = storeToRefs(downloadStore)
const newIds = computed(() => new Set((newDownloads.value ?? []).map(download => download.id)))

const sorted = computed(() => [...(downloads.value ?? [])].sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()))
const available = computed(() => sorted.value.filter(download => download.status !== "expired"))
const expired = computed(() => sorted.value.filter(download => download.status === "expired"))

// A preparing export is checked again every few seconds so its link appears without a reload.
const preparing = computed(() => available.value.some(download => download.status === "preparing"))
watch(preparing, value => {
  if (value && !downloadStore.refetchInterval) downloadStore.refetchInterval = 5000
  else if (!value && downloadStore.refetchInterval === 5000) downloadStore.refetchInterval = false
}, { immediate: true })
onBeforeUnmount(() => {
  if (downloadStore.refetchInterval === 5000) downloadStore.refetchInterval = false
  downloadStore.markDownloadsAsSeen()
})
</script>

<template>
  <Loader v-if="status === 'pending'" :text="true" />
  <p v-else-if="status === 'error'" role="alert" class="text-body text-destructive">Downloads could not be loaded.</p>
  <div v-else-if="sorted.length" class="grid gap-8">
    <section v-if="available.length" aria-labelledby="downloads-available">
      <h2 id="downloads-available" :class="accountGroupTitleClasses">Available <span class="font-normal tabular-nums">{{ available.length }}</span></h2>
      <ul :class="accountListClasses">
        <AccountDownloadRow v-for="download in available" :key="download.id" :download="download" :is-new="newIds.has(download.id)" />
      </ul>
    </section>
    <p v-else class="text-body text-neutral-500">No download is available right now.</p>
    <details v-if="expired.length" :class="accountDisclosureClasses" data-expired-downloads>
      <summary :class="accountDisclosureSummaryClasses">
        <ChevronRight class="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        <span>Expired <span class="font-normal normal-case tracking-normal">· last 30 days</span></span> <span class="font-normal tabular-nums">{{ expired.length }}</span>
      </summary>
      <ul :class="accountListClasses">
        <AccountDownloadRow v-for="download in expired" :key="download.id" :download="download" />
      </ul>
    </details>
  </div>
  <div v-else class="grid justify-items-start gap-2 py-6">
    <p class="text-body text-neutral-900">Nothing downloaded yet.</p>
    <p class="text-body text-neutral-500">Files you download from a collection appear here for 7 days.</p>
    <router-link :to="{ name: 'home' }" class="text-body font-medium underline underline-offset-4">Browse the library</router-link>
  </div>
</template>
