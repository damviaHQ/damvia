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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { trpc } from "@/services/server.ts"
import { formatStorage } from "@/utils/fileSize"
import { useQuery } from "@tanstack/vue-query"
import { BarElement, CategoryScale, Chart, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js"
import dayjs from "dayjs"
import { Download } from "lucide-vue-next"
import Papa from "papaparse"
import { computed, ref } from "vue"
import { Bar, Line } from "vue-chartjs"

Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

const tokens = getComputedStyle(document.querySelector('.dv-theme') ?? document.documentElement)
const colors = ['--dv-action-primary', '--dv-color-warning', '--dv-color-success', '--dv-color-danger'].map((token) => tokens.getPropertyValue(token).trim())

const presets = [7, 30, 90, 365]
const days = ref(30)
const customFrom = ref('')
const customTo = ref('')
const range = computed(() => customFrom.value && customTo.value
  ? { from: dayjs(customFrom.value).startOf('day').toDate(), to: dayjs(customTo.value).add(1, 'day').startOf('day').toDate() }
  : { from: dayjs().subtract(days.value - 1, 'day').startOf('day').toDate(), to: dayjs().add(1, 'day').startOf('day').toDate() })
const rangeDays = computed(() => {
  const count = dayjs(range.value.to).diff(range.value.from, 'day')
  return Array.from({ length: count }, (_, index) => dayjs(range.value.from).add(index, 'day').format('YYYY-MM-DD'))
})

const selectPreset = (preset: number) => {
  days.value = preset
  customFrom.value = ''
  customTo.value = ''
}

const overview = useQuery({
  queryKey: ['analytics', 'overview', range],
  queryFn: () => trpc.analytics.overview.query(range.value),
})
const assets = useQuery({
  queryKey: ['analytics', 'assets', range],
  queryFn: () => trpc.analytics.assets.query(range.value),
})
const users = useQuery({
  queryKey: ['analytics', 'users', range],
  queryFn: () => trpc.analytics.users.query(range.value),
})
const searches = useQuery({
  queryKey: ['analytics', 'searches', range],
  queryFn: () => trpc.analytics.searches.query(range.value),
})
const collections = useQuery({
  queryKey: ['analytics', 'collections', range],
  queryFn: () => trpc.analytics.collections.query(range.value),
})

const totals = computed(() => overview.data.value ? [
  { label: 'Views', value: overview.data.value.totals.views },
  { label: 'Files downloaded', value: overview.data.value.totals.downloads },
  { label: 'Download requests', value: overview.data.value.totals.downloadRequests },
  { label: 'Active users', value: overview.data.value.totals.activeUsers },
  { label: 'Logins', value: overview.data.value.totals.logins },
  { label: 'Searches', value: overview.data.value.totals.searches },
  { label: 'Shares', value: overview.data.value.totals.shares },
  { label: 'Favorites', value: overview.data.value.totals.favorites },
  { label: 'New users', value: overview.data.value.totals.newUsers },
  { label: 'New files', value: overview.data.value.totals.newFiles },
] : [])

const lineData = (series: { label: string, rows: { day: string, count: number }[] }[]) => ({
  labels: rangeDays.value,
  datasets: series.map((item, index) => ({
    label: item.label,
    data: rangeDays.value.map((day) => item.rows.find((row) => dayjs(row.day).format('YYYY-MM-DD') === day)?.count ?? 0),
    borderColor: colors[index],
    backgroundColor: colors[index],
    pointRadius: 0,
    tension: 0.3,
  })),
})
const barData = (rows: { name: string }[], series: { label: string, values: number[] }[]) => ({
  labels: rows.map((row) => row.name),
  datasets: series.map((item, index) => ({ label: item.label, data: item.values, backgroundColor: colors[index] })),
})
const chartOptions = { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }

const activityChart = computed(() => lineData([
  { label: 'Views', rows: (overview.data.value?.series ?? []).map((row) => ({ day: row.day, count: row.views })) },
  { label: 'Downloads', rows: (overview.data.value?.series ?? []).map((row) => ({ day: row.day, count: row.downloads })) },
  { label: 'Searches', rows: (overview.data.value?.series ?? []).map((row) => ({ day: row.day, count: row.searches })) },
]))
const usersChart = computed(() => lineData([
  { label: 'Active users', rows: users.data.value?.activeSeries ?? [] },
  { label: 'Logins', rows: users.data.value?.loginSeries ?? [] },
  { label: 'New users', rows: users.data.value?.newUserSeries ?? [] },
]))
const growthChart = computed(() => lineData([{ label: 'Files added', rows: assets.data.value?.growth ?? [] }]))
const searchChart = computed(() => lineData([{ label: 'Searches', rows: searches.data.value?.volume ?? [] }]))
const collectionsChart = computed(() => lineData([
  { label: 'Collections created', rows: collections.data.value?.createdSeries ?? [] },
  { label: 'Invitations sent', rows: collections.data.value?.shareSeries ?? [] },
]))
const typeChart = computed(() => barData(assets.data.value?.byType ?? [], [
  { label: 'Downloads', values: (assets.data.value?.byType ?? []).map((row) => row.downloads) },
  { label: 'Views', values: (assets.data.value?.byType ?? []).map((row) => row.views) },
]))
const roleChart = computed(() => barData(users.data.value?.byRole ?? [], [
  { label: 'Active users', values: (users.data.value?.byRole ?? []).map((row) => row.activeUsers) },
  { label: 'Downloads', values: (users.data.value?.byRole ?? []).map((row) => row.downloads) },
  { label: 'Views', values: (users.data.value?.byRole ?? []).map((row) => row.views) },
]))

const formatDate = (value: string | Date | null | undefined) => value ? dayjs(value).format('YYYY/MM/DD HH:mm') : 'never'

const exportCsv = (name: string, rows: Record<string, unknown>[]) => {
  const url = URL.createObjectURL(new Blob(['﻿' + Papa.unparse(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `damvia-${name}-${dayjs(range.value.from).format('YYYYMMDD')}-${dayjs(range.value.to).subtract(1, 'day').format('YYYYMMDD')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-heading">
      <div><h1>Insights</h1><p>Views, downloads, active users and searches over a period.</p></div>
      <div class="flex items-center gap-2 flex-wrap">
        <Button v-for="preset in presets" :key="preset" size="sm" class="dv-button"
                :class="{ 'dv-button--primary': !customFrom && !customTo && days === preset }"
                :variant="!customFrom && !customTo && days === preset ? 'default' : 'outline'" @click="selectPreset(preset)">
          {{ preset === 365 ? '12 months' : `${preset} days` }}
        </Button>
        <Input v-model="customFrom" type="date" class="w-40 ml-2" aria-label="From" />
        <span class="text-sm text-neutral-500">to</span>
        <Input v-model="customTo" type="date" class="w-40" aria-label="To" />
      </div>
    </div>

    <div class="flex flex-col gap-6">
      <Loader v-if="overview.status.value === 'pending'" :text="true" />
      <Alert v-else-if="overview.status.value === 'error'" variant="destructive">
        <AlertTitle>Failed to load the insights</AlertTitle>
        <AlertDescription>{{ overview.error.value?.message }}</AlertDescription>
      </Alert>
      <template v-else-if="overview.data.value">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <section v-for="total in totals" :key="total.label" class="dv-panel p-4">
            <p class="text-sm text-neutral-500">{{ total.label }}</p>
            <p class="text-2xl font-bold mt-1">{{ total.value.toLocaleString() }}</p>
          </section>
        </div>
        <section class="dv-panel p-6">
          <h2 class="text-lg font-semibold mb-4">Activity over time</h2>
          <div class="h-64"><Line :data="activityChart" :options="chartOptions" /></div>
        </section>
      </template>

      <h2 class="text-xl font-semibold mt-4">Assets</h2>
      <Loader v-if="assets.status.value === 'pending'" :text="true" />
      <Alert v-else-if="assets.status.value === 'error'" variant="destructive">
        <AlertTitle>Failed to load the asset insights</AlertTitle>
        <AlertDescription>{{ assets.error.value?.message }}</AlertDescription>
      </Alert>
      <template v-else-if="assets.data.value">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">Most downloaded</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('most-downloaded', assets.data.value.topDownloaded)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead class="text-right">Downloads</TableHead>
                  <TableHead class="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="file in assets.data.value.topDownloaded.filter((file) => file.downloads > 0)" :key="file.id">
                  <TableCell class="max-w-64 truncate">{{ file.name }}</TableCell>
                  <TableCell>{{ file.assetType ?? '-' }}</TableCell>
                  <TableCell class="text-right">{{ file.downloads }}</TableCell>
                  <TableCell class="text-right">{{ file.views }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">Most viewed</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('most-viewed', assets.data.value.topViewed)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead class="text-right">Views</TableHead>
                  <TableHead class="text-right">Downloads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="file in assets.data.value.topViewed.filter((file) => file.views > 0)" :key="file.id">
                  <TableCell class="max-w-64 truncate">{{ file.name }}</TableCell>
                  <TableCell>{{ file.assetType ?? '-' }}</TableCell>
                  <TableCell class="text-right">{{ file.views }}</TableCell>
                  <TableCell class="text-right">{{ file.downloads }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
          <section class="dv-panel p-6">
            <h3 class="text-lg font-semibold mb-4">By asset type</h3>
            <div class="h-64"><Bar :data="typeChart" :options="chartOptions" /></div>
          </section>
          <section class="dv-panel p-6">
            <h3 class="text-lg font-semibold mb-4">Library growth</h3>
            <div class="h-64"><Line :data="growthChart" :options="chartOptions" /></div>
          </section>
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">By collection</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('by-collection', assets.data.value.byCollection)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collection</TableHead>
                  <TableHead class="text-right">Downloads</TableHead>
                  <TableHead class="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="collection in assets.data.value.byCollection" :key="collection.id">
                  <TableCell>{{ collection.name }}</TableCell>
                  <TableCell class="text-right">{{ collection.downloads }}</TableCell>
                  <TableCell class="text-right">{{ collection.views }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">Storage by asset type</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('storage-by-type', assets.data.value.storageByType)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead class="text-right">Files</TableHead>
                  <TableHead class="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="type in assets.data.value.storageByType" :key="type.name">
                  <TableCell>{{ type.name }}</TableCell>
                  <TableCell class="text-right">{{ type.files.toLocaleString() }}</TableCell>
                  <TableCell class="text-right">{{ formatStorage(type.bytes) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
        </div>
        <section class="dv-panel p-6">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-lg font-semibold">Never downloaded</h3>
            <Button variant="ghost" size="sm" @click="exportCsv('never-downloaded', assets.data.value.neverDownloaded.files)"><Download class="w-4 h-4" /></Button>
          </div>
          <p class="text-sm text-neutral-500 mb-4">
            {{ assets.data.value.neverDownloaded.total.toLocaleString() }} file{{ assets.data.value.neverDownloaded.total === 1 ? '' : 's' }} since insights started recording. The 50 most recent are listed.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead class="text-right">Size</TableHead>
                <TableHead class="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="file in assets.data.value.neverDownloaded.files" :key="file.id">
                <TableCell class="max-w-96 truncate">{{ file.name }}</TableCell>
                <TableCell class="text-right">{{ formatStorage(file.size) }}</TableCell>
                <TableCell class="text-right">{{ formatDate(file.createdAt) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
      </template>

      <h2 class="text-xl font-semibold mt-4">Users</h2>
      <Loader v-if="users.status.value === 'pending'" :text="true" />
      <Alert v-else-if="users.status.value === 'error'" variant="destructive">
        <AlertTitle>Failed to load the user insights</AlertTitle>
        <AlertDescription>{{ users.error.value?.message }}</AlertDescription>
      </Alert>
      <template v-else-if="users.data.value">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section class="dv-panel p-6">
            <h3 class="text-lg font-semibold mb-4">User activity</h3>
            <div class="h-64"><Line :data="usersChart" :options="chartOptions" /></div>
          </section>
          <section class="dv-panel p-6">
            <h3 class="text-lg font-semibold mb-4">By role</h3>
            <div class="h-64"><Bar :data="roleChart" :options="chartOptions" /></div>
          </section>
        </div>
        <section class="dv-panel p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Top downloaders</h3>
            <Button variant="ghost" size="sm" @click="exportCsv('top-downloaders', users.data.value.topDownloaders)"><Download class="w-4 h-4" /></Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead class="text-right">Files</TableHead>
                <TableHead class="text-right">Requests</TableHead>
                <TableHead class="text-right">Last download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="user in users.data.value.topDownloaders" :key="user.id">
                <TableCell>{{ user.name }}</TableCell>
                <TableCell>{{ user.email }}</TableCell>
                <TableCell>{{ user.company ?? '-' }}</TableCell>
                <TableCell>{{ user.role }}</TableCell>
                <TableCell class="text-right">{{ user.downloads }}</TableCell>
                <TableCell class="text-right">{{ user.requests }}</TableCell>
                <TableCell class="text-right">{{ formatDate(user.lastDownloadAt) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section v-for="breakdown in [{ title: 'By region', name: 'by-region', rows: users.data.value.byRegion }, { title: 'By group', name: 'by-group', rows: users.data.value.byGroup }]"
                   :key="breakdown.name" class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">{{ breakdown.title }}</h3>
              <Button variant="ghost" size="sm" @click="exportCsv(breakdown.name, breakdown.rows)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead class="text-right">Active users</TableHead>
                  <TableHead class="text-right">Downloads</TableHead>
                  <TableHead class="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in breakdown.rows" :key="row.name">
                  <TableCell>{{ row.name }}</TableCell>
                  <TableCell class="text-right">{{ row.activeUsers }}</TableCell>
                  <TableCell class="text-right">{{ row.downloads }}</TableCell>
                  <TableCell class="text-right">{{ row.views }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
        </div>
      </template>

      <h2 class="text-xl font-semibold mt-4">Search</h2>
      <Loader v-if="searches.status.value === 'pending'" :text="true" />
      <Alert v-else-if="searches.status.value === 'error'" variant="destructive">
        <AlertTitle>Failed to load the search insights</AlertTitle>
        <AlertDescription>{{ searches.error.value?.message }}</AlertDescription>
      </Alert>
      <template v-else-if="searches.data.value">
        <section class="dv-panel p-6">
          <h3 class="text-lg font-semibold mb-4">Search volume</h3>
          <div class="h-64"><Line :data="searchChart" :options="chartOptions" /></div>
        </section>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">Top search terms</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('search-terms', searches.data.value.topTerms)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead class="text-right">Searches</TableHead>
                  <TableHead class="text-right">Average results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="term in searches.data.value.topTerms" :key="term.term">
                  <TableCell>{{ term.term }}</TableCell>
                  <TableCell class="text-right">{{ term.searches }}</TableCell>
                  <TableCell class="text-right">{{ term.avgResults }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">Searches without result</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('searches-without-result', searches.data.value.zeroResultTerms)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead class="text-right">Searches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="term in searches.data.value.zeroResultTerms" :key="term.term">
                  <TableCell>{{ term.term }}</TableCell>
                  <TableCell class="text-right">{{ term.searches }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
        </div>
      </template>

      <h2 class="text-xl font-semibold mt-4">Collections</h2>
      <Loader v-if="collections.status.value === 'pending'" :text="true" />
      <Alert v-else-if="collections.status.value === 'error'" variant="destructive">
        <AlertTitle>Failed to load the collection insights</AlertTitle>
        <AlertDescription>{{ collections.error.value?.message }}</AlertDescription>
      </Alert>
      <template v-else-if="collections.data.value">
        <section class="dv-panel p-6">
          <h3 class="text-lg font-semibold mb-4">Collections and invitations</h3>
          <div class="h-64"><Line :data="collectionsChart" :options="chartOptions" /></div>
        </section>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">Most shared</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('most-shared', collections.data.value.mostShared)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collection</TableHead>
                  <TableHead class="text-right">Invitations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="collection in collections.data.value.mostShared" :key="collection.id">
                  <TableCell>{{ collection.name }}</TableCell>
                  <TableCell class="text-right">{{ collection.shares }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
          <section class="dv-panel p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold">Most active</h3>
              <Button variant="ghost" size="sm" @click="exportCsv('most-active-collections', collections.data.value.mostActive)"><Download class="w-4 h-4" /></Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collection</TableHead>
                  <TableHead class="text-right">Views</TableHead>
                  <TableHead class="text-right">Downloads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="collection in collections.data.value.mostActive" :key="collection.id">
                  <TableCell>{{ collection.name }}</TableCell>
                  <TableCell class="text-right">{{ collection.views }}</TableCell>
                  <TableCell class="text-right">{{ collection.downloads }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>
