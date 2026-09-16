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
import Loader from "@/components/Loader.vue"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server.ts"
import { formatStorage } from "@/utils/fileSize"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const { status, data, error, refetch } = useQuery({
  queryKey: ['dashboard'],
  queryFn: () => trpc.dashboard.summary.query(),
})
const isWorking = ref(false)
const isMeasuring = ref(false)

const storage = computed(() => data.value?.storage)
const percent = computed(() => storage.value?.percent == null ? null : Math.round(storage.value.percent))
const barWidth = computed(() => `${Math.min(100, Math.max(0, storage.value?.percent ?? 0))}%`)
const barColor = computed(() => {
  if (percent.value === null) return 'bg-brand'
  if (percent.value >= 90) return 'bg-red-500'
  if (percent.value >= 80) return 'bg-amber-500'
  return 'bg-brand'
})
const disk = computed(() => storage.value?.disk ?? null)
const diskPercent = computed(() => disk.value ? Math.round((disk.value.totalBytes - disk.value.freeBytes) / disk.value.totalBytes * 100) : 0)
const diskBarColor = computed(() => diskPercent.value >= 90 ? 'bg-red-500' : diskPercent.value >= 80 ? 'bg-amber-500' : 'bg-brand')
const formatDate = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleString() : 'never'

const assetStatuses = [
  { key: 'up_to_date', label: 'Up to date' },
  { key: 'creating', label: 'Waiting for download' },
  { key: 'outdated', label: 'Outdated' },
  { key: 'pending_deletion', label: 'Pending deletion' },
]
const downloadStatuses = [
  { key: 'ready', label: 'Ready' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'failed', label: 'Failed' },
  { key: 'expired', label: 'Expired' },
]
const roles = [
  { key: 'admin', label: 'Admins' },
  { key: 'manager', label: 'Managers' },
  { key: 'member', label: 'Members' },
  { key: 'guest', label: 'Guests' },
]

const measureStorage = async () => {
  isWorking.value = true
  isMeasuring.value = true
  const previousMeasuredAt = storage.value?.measuredAt
  try {
    await trpc.dashboard.measureStorage.mutate()
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const { data: summary } = await refetch()
      if (summary && summary.storage.measuredAt !== previousMeasuredAt) {
        toast.success(`Storage updated: ${formatStorage(summary.storage.usedBytes)} used`)
        return
      }
    }
    toast.info("The measurement is taking longer than usual. The figures will update on their own.")
  } catch {
    toast.error("Failed to measure the storage")
  } finally {
    isWorking.value = false
    isMeasuring.value = false
  }
}

const retryPendingAssets = async () => {
  isWorking.value = true
  try {
    const result = await trpc.dashboard.retryPendingAssets.mutate()
    toast.success(result.queued === 0
      ? "No file is waiting for download"
      : `${result.queued} file${result.queued === 1 ? '' : 's'} will be downloaded again from the cloud storage`)
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  } catch {
    toast.error("Failed to retry the pending files")
  } finally {
    isWorking.value = false
  }
}
</script>

<template>
  <div class="flex flex-col p-8">
    <div class="flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>

    <Loader v-if="status === 'pending'" :text="true" />
    <Alert v-else-if="status === 'error'" variant="destructive">
      <AlertTitle>Failed to load the dashboard</AlertTitle>
      <AlertDescription>{{ error?.message }}</AlertDescription>
    </Alert>

    <div v-else-if="data && storage" class="flex flex-col gap-6 mt-4">
      <Alert v-if="percent !== null && percent >= 80" :variant="percent >= 90 ? 'destructive' : 'default'">
        <AlertTitle>
          <template v-if="percent >= 100">Storage plan is full</template>
          <template v-else-if="percent >= 90">Storage plan almost full</template>
          <template v-else>Storage plan is filling up</template>
        </AlertTitle>
        <AlertDescription>
          {{ formatStorage(storage.usedBytes) }} of {{ formatStorage(storage.quotaBytes ?? 0) }} is used ({{ percent }}%).
          <template v-if="storage.quotaReachedAt">
            New files from the cloud storage are not downloaded until space is freed or the plan is raised.
          </template>
          <template v-else>
            Remove unused folders from the cloud storage or raise the plan before the synchronisation pauses.
          </template>
          <template v-if="storage.serverContactEmails.length">
            Please contact
            <a :href="`mailto:${storage.serverContactEmails.join(',')}`" class="underline">{{ storage.serverContactEmails.join(', ') }}</a>.
          </template>
        </AlertDescription>
      </Alert>

      <Alert v-if="storage.quotaBytes && data.users.maintenanceContacts === 0">
        <AlertTitle>Nobody receives the storage alerts</AlertTitle>
        <AlertDescription>
          Open an admin's profile in <router-link :to="{ name: 'admin-users' }" class="underline">Users</router-link>
          and tick "Receives storage and maintenance emails".
        </AlertDescription>
      </Alert>

      <section class="rounded-lg border p-6">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 class="text-lg font-semibold">Storage</h2>
            <p class="text-3xl font-bold mt-2">
              {{ formatStorage(storage.usedBytes) }}
              <span v-if="storage.quotaBytes" class="text-neutral-400 font-normal text-xl">
                / {{ formatStorage(storage.quotaBytes) }}
              </span>
            </p>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" :disabled="isWorking" @click="measureStorage">
              {{ isMeasuring ? 'Measuring…' : 'Measure now' }}
            </Button>
            <Button variant="outline" :disabled="isWorking" @click="retryPendingAssets">Retry pending files</Button>
          </div>
        </div>

        <div v-if="storage.quotaBytes" class="mt-4">
          <div class="h-2 rounded-full bg-neutral-200 overflow-hidden">
            <div class="h-2 rounded-full transition-all" :class="barColor" :style="{ width: barWidth }"></div>
          </div>
          <p class="text-sm text-neutral-500 mt-2">{{ percent }}% of the plan is used</p>
        </div>
        <p v-else class="text-sm text-neutral-500 mt-4">
          No storage plan is configured. Set <code>STORAGE_QUOTA</code> on the server to show the plan and receive alerts.
        </p>

        <p class="text-sm text-neutral-500 mt-6">Last measured {{ formatDate(storage.measuredAt) }}</p>
      </section>

      <section v-if="disk" class="rounded-lg border p-6">
        <h2 class="text-lg font-semibold">Server disk</h2>
        <p class="text-sm text-neutral-500">Visible to the hosting contact only</p>
        <p class="text-3xl font-bold mt-2">
          {{ formatStorage(disk.totalBytes - disk.freeBytes) }}
          <span class="text-neutral-400 font-normal text-xl">/ {{ formatStorage(disk.totalBytes) }}</span>
        </p>
        <div class="mt-4">
          <div class="h-2 rounded-full bg-neutral-200 overflow-hidden">
            <div class="h-2 rounded-full transition-all" :class="diskBarColor" :style="{ width: `${Math.min(100, diskPercent)}%` }"></div>
          </div>
          <p class="text-sm text-neutral-500 mt-2">{{ diskPercent }}% used, {{ formatStorage(disk.freeBytes) }} free</p>
        </div>

        <dl class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm">
          <div>
            <dt class="text-neutral-500">Cloud synchronisation</dt>
            <dd class="font-medium">
              <template v-if="storage.quotaReachedAt">
                <Badge variant="destructive">Paused</Badge>
                since {{ formatDate(storage.quotaReachedAt) }}, {{ disk.blockedFiles }} file{{ disk.blockedFiles === 1 ? '' : 's' }} waiting
              </template>
              <template v-else><Badge variant="secondary">Running</Badge></template>
            </dd>
          </div>
          <div>
            <dt class="text-neutral-500">Last orphan cleanup</dt>
            <dd class="font-medium">
              <template v-if="disk.orphansRemovedAt">
                {{ disk.orphanObjects }} object{{ disk.orphanObjects === 1 ? '' : 's' }},
                {{ formatStorage(disk.orphanBytes) }} freed, {{ formatDate(disk.orphansRemovedAt) }}
              </template>
              <template v-else>never</template>
            </dd>
          </div>
        </dl>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section class="rounded-lg border p-6">
          <h2 class="text-lg font-semibold mb-4">Asset files</h2>
          <ul class="flex flex-col gap-2 text-sm">
            <li v-for="item in assetStatuses" :key="item.key" class="flex items-center justify-between">
              <span>{{ item.label }}</span>
              <Badge :variant="item.key === 'up_to_date' ? 'secondary' : 'outline'">
                {{ data.assets.byStatus[item.key] ?? 0 }}
              </Badge>
            </li>
          </ul>
        </section>

        <section class="rounded-lg border p-6">
          <h2 class="text-lg font-semibold mb-4">Users</h2>
          <ul class="flex flex-col gap-2 text-sm">
            <li class="flex items-center justify-between">
              <span>Total</span>
              <Badge variant="secondary">{{ data.users.total }}</Badge>
            </li>
            <li class="flex items-center justify-between">
              <span>Receive storage alerts</span>
              <Badge :variant="data.users.maintenanceContacts === 0 ? 'destructive' : 'outline'">{{ data.users.maintenanceContacts }}</Badge>
            </li>
            <li class="flex items-center justify-between">
              <span>Waiting for approval</span>
              <Badge :variant="data.users.pendingApproval > 0 ? 'destructive' : 'outline'">
                {{ data.users.pendingApproval }}
              </Badge>
            </li>
            <li v-for="role in roles" :key="role.key" class="flex items-center justify-between">
              <span>{{ role.label }}</span>
              <Badge variant="outline">{{ data.users.byRole[role.key] ?? 0 }}</Badge>
            </li>
          </ul>
        </section>

        <section class="rounded-lg border p-6">
          <h2 class="text-lg font-semibold mb-4">Downloads, last 7 days</h2>
          <ul class="flex flex-col gap-2 text-sm">
            <li v-for="item in downloadStatuses" :key="item.key" class="flex items-center justify-between">
              <span>{{ item.label }}</span>
              <Badge :variant="item.key === 'failed' && (data.downloads.last7DaysByStatus[item.key] ?? 0) > 0 ? 'destructive' : 'outline'">
                {{ data.downloads.last7DaysByStatus[item.key] ?? 0 }}
              </Badge>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
