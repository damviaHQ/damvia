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
import { computed } from "vue"
import { useQuery } from "@tanstack/vue-query"
import { Copy, Download, Share } from "@lucide/vue"
import dayjs from "dayjs"
import Loader from "@/components/Loader.vue"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import MobileTopBar from "../components/MobileTopBar.vue"

const toast = useGlobalToast()
// A preparing export is checked again every few seconds so the link appears
// without a reload; the email arrives at the same time.
const { data: downloads, isLoading, error, refetch } = useQuery({
  queryKey: ["downloads"],
  queryFn: () => trpc.download.list.query(),
  refetchInterval: (query) => query.state.data?.some((download) => download.status === "preparing") ? 5000 : false,
})
const canShare = computed(() => typeof navigator !== "undefined" && typeof navigator.share === "function")
const statusLabels: Record<string, string> = { preparing: "Preparing", ready: "Ready", failed: "Failed", expired: "Expired" }

async function copyLink(url: string) {
  await navigator.clipboard.writeText(url)
  toast.success("Link copied")
}
async function share(url: string, expiresAt: string | Date) {
  try {
    await navigator.share({ title: "Download", text: `Files available until ${dayjs(expiresAt).format("D MMM YYYY")}`, url })
  } catch { /* closed by the person */ }
}
function contents(download: { fileCount: number, recordCount: number }) {
  return [download.fileCount ? `${download.fileCount} ${download.fileCount === 1 ? "file" : "files"}` : "", download.recordCount ? `${download.recordCount} rows` : ""].filter(Boolean).join(" · ")
}
</script>

<template>
  <MobileTopBar title="Downloads" back="/account" :trail="[{ label: 'Account', to: { name: 'account' } }]" />
  <Loader v-if="isLoading" :text="true" />
  <p v-else-if="error" role="alert" class="grid gap-3 px-4 pt-8 text-center">Downloads could not be loaded.<button type="button" class="min-h-11 underline" @click="refetch()">Try again</button></p>
  <section v-else class="grid gap-3 px-4 pt-4 pb-24">
    <p class="text-sm text-[var(--dv-text-secondary)]">Anyone with a download link can download its files until it expires. Links last 7 days.</p>
    <article v-for="download in downloads" :key="download.id" class="grid gap-3 rounded-[var(--dv-radius-lg)] border border-[var(--dv-color-line)] p-4">
      <div class="flex items-baseline gap-2">
        <h2 class="flex-1 font-medium">{{ contents(download) }}</h2>
        <span class="text-sm" :class="download.status === 'failed' ? 'text-[var(--dv-color-danger)]' : 'text-[var(--dv-text-secondary)]'">{{ statusLabels[download.status] ?? download.status }}</span>
      </div>
      <p class="text-sm text-[var(--dv-text-secondary)]">
        Requested {{ dayjs(download.createdAt).format("D MMM, HH:mm") }}<template v-if="download.status === 'ready'"> · until {{ dayjs(download.expiresAt).format("D MMM YYYY") }}</template>
      </p>
      <p v-if="download.status === 'preparing'" class="text-sm">Link available when ready. We’ll also email it to you.</p>
      <div v-if="download.status === 'ready' && download.url" class="grid grid-cols-2 gap-2">
        <button type="button" class="mobile-download-action mobile-download-action--primary col-span-2" @click="copyLink(download.url)"><Copy :size="18" aria-hidden="true" />Copy link</button>
        <a :href="download.url" class="mobile-download-action"><Download :size="18" aria-hidden="true" />Download</a>
        <button v-if="canShare" type="button" class="mobile-download-action" @click="share(download.url, download.expiresAt)"><Share :size="18" aria-hidden="true" />Share</button>
      </div>
    </article>
    <p v-if="!downloads?.length" class="pt-8 text-center text-[var(--dv-text-secondary)]">Nothing downloaded yet.</p>
  </section>
</template>

<style scoped>
.mobile-download-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  border: 1px solid var(--dv-color-line-strong);
  border-radius: var(--dv-radius-button);
  background: none;
  color: inherit;
  text-decoration: none;
}
.mobile-download-action--primary {
  background: var(--dv-action-primary);
  border-color: var(--dv-action-primary);
  color: var(--dv-color-white);
  font-weight: 600;
}
</style>
