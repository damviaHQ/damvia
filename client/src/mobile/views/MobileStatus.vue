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
import { useQuery } from "@tanstack/vue-query"
import { AlertTriangle, CheckCircle2, ChevronRight } from "@lucide/vue"
import dayjs from "dayjs"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import MobileTopBar from "../components/MobileTopBar.vue"

// The dashboard's "needs attention" list and its two safe actions. Everything
// else about sources and storage is configured on a computer.
const toast = useGlobalToast()
const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({ queryKey: ["dashboard-summary"], queryFn: () => trpc.dashboard.summary.query(), refetchInterval: 60_000 })
const busy = ref("")
const storage = computed(() => data.value?.storage)
const percent = computed(() => storage.value?.percent == null ? null : Math.round(storage.value.percent))
const pendingFiles = computed(() => (data.value?.assets.byStatus.creating ?? 0) + (data.value?.assets.byStatus.outdated ?? 0))
const canRetryFiles = computed(() => pendingFiles.value > 0 && !storage.value?.quotaReachedAt && data.value?.jobs.downloading === 0)
const failedSources = computed(() => data.value?.sources.filter((source) => source.state === "failed") ?? [])
const failedExports = computed(() => data.value?.downloads.last7DaysByStatus.failed ?? 0)
const missingAlertContact = computed(() => !!storage.value?.quotaBytes && data.value?.users.maintenanceContacts === 0)
const items = computed(() => [
  ...(data.value?.users.pendingApproval ? [{ id: "users", text: `${data.value.users.pendingApproval} waiting for access`, to: { name: "admin-users", query: { tab: "pending" } } }] : []),
  ...(data.value?.sync.paused ? [{ id: "paused", text: "Cloud sync is paused: storage is full" }] : []),
  ...failedSources.value.map((source) => ({ id: `source-${source.key}`, text: `${source.name} failed to sync${source.lastError ? `: ${source.lastError}` : ""}` })),
  ...(canRetryFiles.value ? [{ id: "files", text: `${pendingFiles.value} files waiting to be processed` }] : []),
  ...(failedExports.value ? [{ id: "exports", text: `${failedExports.value} downloads failed this week` }] : []),
  ...(missingAlertContact.value ? [{ id: "contact", text: "Nobody receives storage alerts. Choose someone on a computer." }] : []),
])

async function act(action: "retry" | "measure") {
  busy.value = action
  try {
    if (action === "retry") await trpc.dashboard.retryPendingAssets.mutate()
    else await trpc.dashboard.measureStorage.mutate()
    toast.success(action === "retry" ? "Files queued again" : "Measuring storage. The figures update in a moment.")
    await refetch()
  } catch (err) {
    toast.error((err as Error).message)
  } finally {
    busy.value = ""
  }
}
</script>

<template>
  <MobileTopBar title="Library status" back="/account" />
  <Loader v-if="isLoading" :text="true" />
  <p v-else-if="error" role="alert" class="grid gap-3 px-4 pt-8 text-center">Status could not be loaded.<button type="button" class="min-h-11 underline" @click="refetch()">Try again</button></p>
  <div v-else-if="data" class="grid gap-6 px-4 pt-4 pb-24">
    <section class="grid gap-2" aria-labelledby="attention-heading">
      <h2 id="attention-heading" class="text-sm font-semibold text-[var(--dv-text-secondary)]">Needs attention</h2>
      <p v-if="!items.length" class="flex items-center gap-2"><CheckCircle2 :size="20" aria-hidden="true" />All clear</p>
      <template v-for="item in items" :key="item.id">
        <router-link v-if="item.to" :to="item.to" class="flex min-h-[52px] items-center gap-3 rounded-[var(--dv-radius-md)] border border-[var(--dv-color-line)] px-3 no-underline text-inherit">
          <AlertTriangle :size="18" aria-hidden="true" class="text-[var(--dv-color-warning)]" /><span class="flex-1">{{ item.text }}</span><ChevronRight :size="18" aria-hidden="true" />
        </router-link>
        <div v-else class="flex min-h-[52px] items-center gap-3 rounded-[var(--dv-radius-md)] border border-[var(--dv-color-line)] px-3">
          <AlertTriangle :size="18" aria-hidden="true" class="text-[var(--dv-color-warning)]" /><span class="flex-1">{{ item.text }}</span>
        </div>
      </template>
      <Button v-if="canRetryFiles" type="button" variant="outline" class="min-h-12" :disabled="!!busy" @click="act('retry')">{{ busy === "retry" ? "Queuing…" : "Retry pending files" }}</Button>
    </section>

    <section class="grid gap-2" aria-labelledby="storage-heading">
      <h2 id="storage-heading" class="text-sm font-semibold text-[var(--dv-text-secondary)]">Storage</h2>
      <p v-if="percent !== null">{{ percent }}% used</p>
      <p v-else class="text-[var(--dv-text-secondary)]">No storage limit set.</p>
      <div v-if="percent !== null" class="h-2 overflow-hidden rounded-full bg-[var(--dv-surface-subtle)]" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100" aria-label="Storage used">
        <div class="h-full" :class="percent >= 90 ? 'bg-[var(--dv-color-danger)]' : percent >= 80 ? 'bg-[var(--dv-color-warning)]' : 'bg-[var(--dv-action-primary)]'" :style="{ width: `${Math.min(100, percent)}%` }" />
      </div>
      <p v-if="storage?.measuredAt" class="text-sm text-[var(--dv-text-secondary)]">Measured {{ dayjs(storage.measuredAt).format("D MMM, HH:mm") }}</p>
      <Button type="button" variant="outline" class="min-h-12" :disabled="!!busy" @click="act('measure')">{{ busy === "measure" ? "Measuring…" : "Measure now" }}</Button>
    </section>

    <section class="grid gap-2" aria-labelledby="sources-heading">
      <h2 id="sources-heading" class="text-sm font-semibold text-[var(--dv-text-secondary)]">Cloud sources</h2>
      <div v-for="source in data.sources" :key="source.key" class="flex min-h-11 items-center gap-2 border-b border-[var(--dv-color-line)]">
        <span class="flex-1 truncate">{{ source.name }}</span>
        <span class="text-sm" :class="source.state === 'failed' ? 'text-[var(--dv-color-danger)]' : 'text-[var(--dv-text-secondary)]'">{{ ({ ok: "Synced", failed: "Failed", running: "Syncing", never: "Never synced" } as Record<string, string>)[source.state] ?? source.state }}</span>
      </div>
    </section>
    <p class="text-sm text-[var(--dv-text-secondary)]">Updated {{ dayjs(dataUpdatedAt).format("HH:mm") }}</p>
  </div>
</template>
