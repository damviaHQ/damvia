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
import InsightsChart from '@/components/analytics/InsightsChart.vue'
import InsightsTable from '@/components/analytics/InsightsTable.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { trpc } from '@/services/server'
import { formatStorage } from '@/utils/fileSize'
import { useQuery } from '@tanstack/vue-query'
import {
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import type { ChartOptions } from 'chart.js'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Files,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  Mail,
  Search,
  TrendingUp,
  Users,
} from 'lucide-vue-next'
import Papa from 'papaparse'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bar, Line } from 'vue-chartjs'
import '@/styles/insights.css'

Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler)
const InsightsMap = defineAsyncComponent(() => import('@/components/analytics/InsightsMap.vue'))

const route = useRoute()
const router = useRouter()
const sections = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Understand how your library is being used.',
  },
  {
    id: 'assets',
    label: 'Asset usage',
    icon: Files,
    description: 'See which assets get attention and which stay unused.',
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
    description: 'Understand adoption across your teams and regions.',
  },
  {
    id: 'search',
    label: 'Search demand',
    icon: Search,
    description: 'See what people need. Find the gaps. Act on demand.',
  },
  {
    id: 'collections',
    label: 'Collections',
    icon: FolderOpen,
    description: 'Follow how collections are used and shared.',
  },
  {
    id: 'storage',
    label: 'Library & storage',
    icon: HardDrive,
    description: 'Track library growth and the space your assets use.',
  },
]
const active = computed(() => sections.find((section) => section.id === route.query.report) ?? sections[0])
const selectSection = (id: string) => router.replace({ query: { ...route.query, report: id } })
const today = new Date().toISOString().slice(0, 10)
const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)
const selectedRange = ref({ from: shiftDate(today, -29), to: today })
const draftFrom = ref(selectedRange.value.from)
const draftTo = ref(selectedRange.value.to)
const dateOpen = ref(false)
const preset = ref<number | null>(30)
const dateError = computed(() =>
  !draftFrom.value || !draftTo.value
    ? 'Choose both dates.'
    : draftTo.value < draftFrom.value
      ? 'The end date must follow the start date.'
      : (Date.parse(draftTo.value) - Date.parse(draftFrom.value)) / 86400000 >= 366
        ? 'Choose up to 366 days.'
        : draftTo.value > today
          ? 'Choose an end date up to today.'
          : '',
)
const range = computed(() => ({
  from: new Date(selectedRange.value.from + 'T00:00:00Z'),
  to: new Date(shiftDate(selectedRange.value.to, 1) + 'T00:00:00Z'),
}))
const rangeDays = computed(() =>
  Array.from(
    { length: Math.round((range.value.to.getTime() - range.value.from.getTime()) / 86400000) },
    (_, index) => shiftDate(selectedRange.value.from, index),
  ),
)
const previousRange = computed(() => ({
  from: new Date(range.value.from.getTime() - rangeDays.value.length * 86400000),
  to: range.value.from,
}))
const dateLabel = (value: string | Date) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDate = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Never'
function selectPreset(days: number) {
  preset.value = days
  selectedRange.value = { from: shiftDate(today, 1 - days), to: today }
  draftFrom.value = selectedRange.value.from
  draftTo.value = today
  dateOpen.value = false
}
function applyDates() {
  if (dateError.value) return
  preset.value = null
  selectedRange.value = { from: draftFrom.value, to: draftTo.value }
  dateOpen.value = false
}
const overview = useQuery({
  queryKey: ['analytics', 'overview', range],
  queryFn: () => trpc.analytics.overview.query(range.value),
})
const previous = useQuery({
  queryKey: ['analytics', 'overview', previousRange],
  queryFn: () => trpc.analytics.overview.query(previousRange.value),
})
const assets = useQuery({
  queryKey: ['analytics', 'assets', range],
  queryFn: () => trpc.analytics.assets.query(range.value),
  enabled: computed(() => ['assets', 'storage'].includes(active.value.id)),
})
const users = useQuery({
  queryKey: ['analytics', 'users', range],
  queryFn: () => trpc.analytics.users.query(range.value),
  enabled: computed(() => active.value.id === 'users'),
})
const searches = useQuery({
  queryKey: ['analytics', 'searches', range],
  queryFn: () => trpc.analytics.searches.query(range.value),
  enabled: computed(() => ['overview', 'search'].includes(active.value.id)),
})
const collections = useQuery({
  queryKey: ['analytics', 'collections', range],
  queryFn: () => trpc.analytics.collections.query(range.value),
  enabled: computed(() => active.value.id === 'collections'),
})
const reportQuery = computed(
  () =>
    ({ overview, assets, users, search: searches, collections, storage: assets })[active.value.id] ??
    overview,
)
function retryReport() {
  reportQuery.value.refetch()
  overview.refetch()
}
const selectedTerm = ref('')
const detailOpen = ref(false)
const detail = useQuery({
  queryKey: ['analytics', 'search-term', range, selectedTerm],
  queryFn: () => trpc.analytics.searchTerm.query({ ...range.value, term: selectedTerm.value }),
  enabled: computed(() => detailOpen.value && !!selectedTerm.value),
})
watch(range, () => {
  detailOpen.value = false
})
function openTerm(term: string) {
  selectedTerm.value = term
  detailOpen.value = true
  messageCopied.value = false
}
const draftKind = ref('waiting')
const emailBody = computed(() =>
  draftKind.value === 'waiting'
    ? `Hello,\n\nYou recently searched for “${selectedTerm.value}” in our asset library. We have seen your request and are checking the availability of the content. We will share an update as soon as we have a confirmed timeline.\n\nThank you for your patience.`
    : `Hello,\n\nFollowing your search for “${selectedTerm.value}”, here is an update on the content you requested.\n\n[Add the confirmed availability date and a link to the collection.]\n\nThank you.`,
)
const messageCopied = ref(false)
const copyError = ref(false)
async function copyMessage() {
  try {
    await navigator.clipboard.writeText(emailBody.value)
    messageCopied.value = true
    copyError.value = false
  } catch {
    copyError.value = true
  }
}
const emailLink = (email: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Update on ${selectedTerm.value}`)}&body=${encodeURIComponent(emailBody.value)}`
const termFilter = ref('')
const searchView = ref('all')
watch(range, () => {
  termFilter.value = ''
  searchView.value = 'all'
})
const filteredTerms = computed(() =>
  (searchView.value === 'attention'
    ? (searches.data.value?.signals ?? [])
    : (searches.data.value?.topTerms ?? [])
  ).filter((row) => row.term.toLowerCase().includes(termFilter.value.toLowerCase())),
)
const number = (value: number | undefined) => (value ?? 0).toLocaleString()
const metric = (
  label: string,
  value: number,
  key?: keyof NonNullable<typeof overview.data.value>['totals'],
  description?: string,
) => {
  const before = key && previous.data.value ? previous.data.value.totals[key] : null
  return {
    label,
    value: number(value),
    change: before === null ? null : value - before,
    description: description ?? 'In the selected period',
  }
}
const metrics = computed(() => {
  const totals = overview.data.value?.totals
  if (!totals) return []
  if (active.value.id === 'search') {
    const data = searches.data.value?.totals
    if (!data) return []
    return [
      metric('Total searches', data.searches, 'searches'),
      metric(
        'Without results',
        data.zeroResults,
        undefined,
        `${data.searches ? Math.round((data.zeroResults / data.searches) * 100) : 0}% of searches returned nothing`,
      ),
      metric('People searching', data.users, undefined, 'Distinct users in this period'),
      metric('Terms with a spike', data.spikes, undefined, 'Unusually high daily demand'),
    ]
  }
  if (active.value.id === 'users')
    return [
      metric('Active users', totals.activeUsers, 'activeUsers'),
      metric('Logins', totals.logins, 'logins'),
      metric('New users', totals.newUsers, 'newUsers'),
    ]
  if (active.value.id === 'collections')
    return [
      metric(
        'Collections created',
        (collections.data.value?.createdSeries ?? []).reduce((sum, row) => sum + row.count, 0),
      ),
      metric('Invitations sent', totals.shares, 'shares'),
      metric('Favorites added', totals.favorites, 'favorites'),
    ]
  if (active.value.id === 'storage')
    return [
      metric(
        'Files in library',
        (assets.data.value?.storageByType ?? []).reduce((sum, row) => sum + row.files, 0),
        undefined,
        'Current library',
      ),
      {
        label: 'Storage used',
        value: formatStorage(
          (assets.data.value?.storageByType ?? []).reduce((sum, row) => sum + row.bytes, 0),
        ),
        change: null,
        description: 'Current library',
      },
      metric('Files added', totals.newFiles, 'newFiles'),
    ]
  if (active.value.id === 'assets')
    return [
      metric('Asset views', totals.views, 'views'),
      metric('Files downloaded', totals.downloads, 'downloads'),
      metric('Download requests', totals.downloadRequests, 'downloadRequests'),
      metric('Files added', totals.newFiles, 'newFiles'),
    ]
  return [
    metric('Asset views', totals.views, 'views'),
    metric('Files downloaded', totals.downloads, 'downloads'),
    metric('Active users', totals.activeUsers, 'activeUsers'),
    metric('Searches', totals.searches, 'searches'),
  ]
})
const tokens = getComputedStyle(document.querySelector('.dv-theme') ?? document.documentElement)
const colors = ['--dv-action-primary', '--dv-color-success', '--dv-color-warning', '--dv-color-danger'].map(
  (token) => tokens.getPropertyValue(token).trim(),
)
const muted = tokens.getPropertyValue('--dv-text-secondary').trim()
const lineColor = tokens.getPropertyValue('--dv-color-line').trim()
const font = tokens.getPropertyValue('--dv-font-body').trim()
const lineData = (series: { label: string; rows: { day: string; count: number }[] }[]) => ({
  labels: rangeDays.value.map(dateLabel),
  datasets: series.map((item, index) => {
    const values = new Map(item.rows.map((row) => [String(row.day).slice(0, 10), row.count]))
    return {
      label: item.label,
      data: rangeDays.value.map((day) => values.get(day) ?? 0),
      borderColor: colors[index],
      backgroundColor: index === 0 ? 'rgba(0, 68, 244, 0.045)' : colors[index],
      pointBackgroundColor: colors[index],
      pointRadius: rangeDays.value.length <= 7 ? 3 : 0,
      pointHoverRadius: 5,
      borderWidth: 2,
      tension: 0.15,
      fill: index === 0,
    }
  }),
})
const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'bottom',
      align: 'start',
      labels: {
        usePointStyle: true,
        pointStyle: 'circle',
        boxWidth: 7,
        boxHeight: 7,
        padding: 24,
        color: muted,
        font: { family: font, size: 12 },
      },
    },
    tooltip: { padding: 12, displayColors: true },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { maxTicksLimit: 8, maxRotation: 0, color: muted, font: { family: font, size: 11 } },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: lineColor },
      ticks: { precision: 0, maxTicksLimit: 5, color: muted, font: { family: font, size: 11 } },
    },
  },
}
const barOptions: ChartOptions<'bar'> = {
  ...chartOptions,
  indexAxis: 'y',
  scales: {
    x: {
      beginAtZero: true,
      ticks: { precision: 0, color: muted },
      grid: { color: lineColor },
      border: { display: false },
    },
    y: { grid: { display: false }, border: { display: false }, ticks: { color: muted } },
  },
} as ChartOptions<'bar'>
const activityChart = computed(() =>
  lineData(
    ['views', 'downloads', 'searches'].map((key, index) => ({
      label: ['Views', 'Downloads', 'Searches'][index],
      rows: (overview.data.value?.series ?? []).map((row) => ({ day: row.day, count: row[key as 'views'] })),
    })),
  ),
)
const usersChart = computed(() =>
  lineData([
    { label: 'Active users', rows: users.data.value?.activeSeries ?? [] },
    { label: 'Logins', rows: users.data.value?.loginSeries ?? [] },
    { label: 'New users', rows: users.data.value?.newUserSeries ?? [] },
  ]),
)
const growthChart = computed(() =>
  lineData([{ label: 'Files added', rows: assets.data.value?.growth ?? [] }]),
)
const searchData = (rows: { day: string; count: number; zeroResults: number }[]) =>
  lineData([
    { label: 'Total searches', rows },
    { label: 'Without results', rows: rows.map((row) => ({ day: row.day, count: row.zeroResults })) },
  ])
const searchChart = computed(() => searchData(searches.data.value?.volume ?? []))
const detailChart = computed(() => searchData(detail.data.value?.volume ?? []))
const collectionsChart = computed(() =>
  lineData([
    { label: 'Collections created', rows: collections.data.value?.createdSeries ?? [] },
    { label: 'Invitations sent', rows: collections.data.value?.shareSeries ?? [] },
  ]),
)
const typeChart = computed(() => ({
  labels: (assets.data.value?.byType ?? []).map((row) => row.name),
  datasets: ['views', 'downloads'].map((key, index) => ({
    label: ['Views', 'Downloads'][index],
    data: (assets.data.value?.byType ?? []).map((row) => row[key as 'views']),
    backgroundColor: colors[index],
    maxBarThickness: 16,
  })),
}))
const columns = (items: string[][]) =>
  items.map(([key, label, numeric]) => ({ key, label, numeric: !!numeric }))
const fileColumns = columns([
  ['name', 'Asset'],
  ['assetType', 'Type'],
  ['views', 'Views', '1'],
  ['downloads', 'Downloads', '1'],
])
const activityColumns = columns([
  ['name', 'Name'],
  ['activeUsers', 'Active users', '1'],
  ['views', 'Views', '1'],
  ['downloads', 'Downloads', '1'],
])
const collectionColumns = columns([
  ['name', 'Collection'],
  ['views', 'Views', '1'],
  ['downloads', 'Downloads', '1'],
])
const formatRows = (rows: Record<string, unknown>[], key: string, format: (value: any) => string) =>
  rows.map((row) => ({ ...row, [key]: format(row[key]) }))
function exportCsv(name: string, rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + Papa.unparse(rows, { escapeFormulae: true })], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `damvia-${name}-${selectedRange.value.from}-${selectedRange.value.to}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
const exportTerms = () =>
  exportCsv(
    'search-demand',
    filteredTerms.value.map(({ spike, ...row }) => ({
      ...row,
      spikeDay: spike?.day ?? '',
      spikeSearches: spike?.count ?? '',
      precedingDailyAverage: spike?.baseline ?? '',
    })),
  )
</script>

<template>
  <div class="admin-page insights-page">
    <div class="admin-heading insights-heading">
      <div>
        <h1>Insights</h1>
        <p>Turn library activity into better decisions.</p>
      </div>
      <Popover v-model:open="dateOpen">
        <PopoverTrigger as-child
          ><Button variant="outline" class="insights-period"
            ><CalendarDays :size="16" />
            {{
              preset
                ? `Last ${preset} days`
                : `${dateLabel(selectedRange.from)} – ${dateLabel(selectedRange.to)}`
            }}<ChevronDown :size="14" /></Button
        ></PopoverTrigger>
        <PopoverContent align="end" class="dv-theme dv-admin admin-popover insights-date-popover">
          <p class="date-title">Reporting period</p>
          <div class="date-presets">
            <Button
              v-for="days in [7, 30, 90, 365]"
              :key="days"
              :variant="preset === days ? 'default' : 'outline'"
              size="sm"
              @click="selectPreset(days)"
              >{{ days === 365 ? '1 year' : `${days} days` }}</Button
            >
          </div>
          <form @submit.prevent="applyDates">
            <label>From<input v-model="draftFrom" type="date" :max="today" required /></label
            ><label>To<input v-model="draftTo" type="date" :min="draftFrom" :max="today" required /></label>
            <p v-if="dateError" class="date-error" role="alert">{{ dateError }}</p>
            <Button type="submit" :disabled="!!dateError">Apply dates</Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
    <div class="insights-workspace">
      <nav class="insights-nav" aria-label="Insights reports">
        <span class="nav-caption">Reports</span>
        <button
          v-for="section in sections"
          :key="section.id"
          :aria-current="active.id === section.id ? 'page' : undefined"
          :class="{ selected: active.id === section.id }"
          @click="selectSection(section.id)"
        >
          <component :is="section.icon" :size="17" /><span>{{ section.label }}</span
          ><span v-if="section.id === 'search' && searches.data.value?.signalCount" class="nav-count">{{
            searches.data.value.signalCount
          }}</span>
        </button>
        <div class="insights-nav-note">
          <BarChart3 :size="18" />
          <p>Activity is recorded from the day Insights was enabled.</p>
          <span>Daily reporting · UTC</span>
        </div>
      </nav>
      <main class="insights-main" :aria-label="active.label">
        <header class="report-title">
          <div>
            <h2>{{ active.label }}</h2>
            <p>{{ active.description }}</p>
          </div>
          <span
            >{{ dateLabel(selectedRange.from) }} – {{ dateLabel(selectedRange.to) }},
            {{ selectedRange.to.slice(0, 4) }}</span
          >
        </header>
        <div
          v-if="reportQuery.isPending.value || overview.isPending.value"
          class="insights-loading"
          role="status"
        >
          <div v-for="n in 3" :key="n"></div>
          <p>Loading {{ active.label.toLowerCase() }}…</p>
        </div>
        <div v-else-if="reportQuery.isError.value || overview.isError.value" class="admin-error" role="alert">
          <p>
            Could not load this report.
            {{ reportQuery.error.value?.message ?? overview.error.value?.message }}
          </p>
          <Button
            variant="outline"
            @click="retryReport"
            >Try again</Button
          >
        </div>
        <template v-else>
          <div class="insights-metrics" :style="{ '--metric-count': metrics.length }">
            <section v-for="item in metrics" :key="item.label">
              <h3>{{ item.label }}</h3>
              <strong>{{ item.value }}</strong
              ><span v-if="item.change !== null" class="metric-change"
                ><component
                  :is="item.change > 0 ? ArrowUp : item.change < 0 ? ArrowDown : Check"
                  :size="12"
                />{{ item.change > 0 ? '+' : '' }}{{ number(item.change) }} vs previous
                {{ rangeDays.length }} days</span
              ><span v-else>{{ item.description }}</span>
            </section>
          </div>
          <p v-if="previous.isError.value" class="comparison-note">
            Previous-period comparisons are unavailable.
          </p>
          <template v-if="active.id === 'overview'">
            <button
              v-if="searches.data.value?.signalCount"
              class="demand-callout"
              @click="selectSection('search')"
            >
              <span class="demand-callout-icon"><TrendingUp :size="21" /></span
              ><span
                ><strong
                  >{{ searches.data.value.signalCount }} search
                  {{ searches.data.value.signalCount === 1 ? 'term needs' : 'terms need' }} attention</strong
                ><small>Demand is spiking or people are searching without finding results.</small></span
              ><span class="callout-link">Explore demand <ArrowRight :size="16" /></span>
            </button>
            <InsightsChart
              title="Library activity"
              description="Views, downloads and searches, day by day."
              :empty="!overview.data.value?.series.some((row) => row.views || row.downloads || row.searches)"
              @export="exportCsv('activity', overview.data.value?.series ?? [])"
              ><Line role="img" aria-label="Daily activity chart. Export CSV for the individual values." :data="activityChart" :options="chartOptions"
            /></InsightsChart>
            <div class="overview-reports">
              <button
                v-for="section in sections.slice(1, 5)"
                :key="section.id"
                @click="selectSection(section.id)"
              >
                <component :is="section.icon" :size="19" /><strong>{{ section.label }}</strong>
                <p>{{ section.description }}</p>
                <ArrowRight :size="16" />
              </button>
            </div>
            <p v-if="searches.isError.value" class="comparison-note">
              Search demand could not be loaded. Open Search demand to retry.
            </p>
          </template>
          <template v-if="active.id === 'search' && searches.data.value">
            <InsightsChart
              title="Searches over time"
              description="Total searches and searches that returned no results."
              :empty="!searches.data.value.volume.length"
              @export="exportCsv('search-volume', searches.data.value.volume)"
              ><Line role="img" aria-label="Daily activity chart. Export CSV for the individual values." :data="searchChart" :options="chartOptions"
            /></InsightsChart>
            <section v-if="searches.data.value.signals.length" class="demand-signals">
              <header>
                <div>
                  <span class="signal-eyebrow"><TrendingUp :size="14" /> Needs attention</span>
                  <h3>What your audience is looking for</h3>
                </div>
                <span>{{ searches.data.value.signalCount }} terms</span>
              </header>
              <div class="signal-grid">
                <button
                  v-for="term in searches.data.value.signals.slice(0, 3)"
                  :key="term.term"
                  @click="openTerm(term.term)"
                >
                  <span class="signal-tag" :class="{ 'signal-gap': !term.spike }">{{
                    term.spike ? 'Search spike' : 'Content gap'
                  }}</span
                  ><strong>{{ term.term }}</strong>
                  <p v-if="term.spike">
                    <b>{{ term.spike.count }} searches</b> on {{ dateLabel(term.spike.day) }}<br />{{
                      term.spike.baseline
                        ? `${term.spike.baseline} / day in the preceding week`
                        : 'No searches in the preceding week'
                    }}
                  </p>
                  <p v-else>
                    <b>{{ term.zeroResults }} searches without results</b><br />{{ term.users }} people
                    searched this term
                  </p>
                  <span class="signal-action">Review demand <ArrowRight :size="14" /></span>
                </button>
              </div>
              <p class="signal-method">
                Spikes: at least 5 searches above the preceding 7-day daily average and at least 3× that
                average. Gaps: at least 3 searches without results. Based on recorded activity.
              </p>
            </section>
            <section class="insight-report search-terms">
              <header class="report-heading">
                <div>
                  <h3>Search terms</h3>
                  <p>
                    Compare demand with the previous {{ rangeDays.length }} days. Select a term to respond.
                  </p>
                </div>
                <Button variant="outline" size="sm" :disabled="!filteredTerms.length" @click="exportTerms"
                  ><Download :size="14" /> CSV</Button
                >
              </header>
              <div class="term-toolbar">
                <div class="term-tabs">
                  <button
                    :class="{ selected: searchView === 'all' }"
                    :aria-pressed="searchView === 'all'"
                    @click="searchView = 'all'"
                  >
                    Top terms</button
                  ><button
                    :class="{ selected: searchView === 'attention' }"
                    :aria-pressed="searchView === 'attention'"
                    @click="searchView = 'attention'"
                  >
                    Needs attention <span>{{ searches.data.value.signalCount }}</span>
                  </button>
                </div>
                <label class="term-search"
                  ><Search :size="15" /><input
                    v-model="termFilter"
                    placeholder="Find a term…"
                    aria-label="Filter search terms"
                /></label>
              </div>
              <div v-if="filteredTerms.length" class="report-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Search term</th>
                      <th scope="col" class="numeric">Searches</th>
                      <th scope="col" class="numeric">Change</th>
                      <th scope="col" class="numeric">People</th>
                      <th scope="col" class="numeric">No results</th>
                      <th scope="col">Signal</th>
                      <th scope="col"><span class="sr-only">Details</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="term in filteredTerms" :key="term.term">
                      <td>
                        <button class="term-name" @click="openTerm(term.term)">{{ term.term }}</button>
                      </td>
                      <td class="numeric">{{ number(term.searches) }}</td>
                      <td class="numeric term-change">
                        {{
                          term.previousSearches
                            ? `${term.searches >= term.previousSearches ? '+' : ''}${Math.round(((term.searches - term.previousSearches) / term.previousSearches) * 100)}%`
                            : 'New'
                        }}
                      </td>
                      <td class="numeric">{{ term.users }}</td>
                      <td class="numeric">
                        <span :class="{ 'no-results-count': term.zeroResults > 0 }">{{
                          term.zeroResults
                        }}</span>
                      </td>
                      <td>
                        <span
                          v-if="term.spike || term.zeroResults >= 3"
                          class="signal-tag"
                          :class="{ 'signal-gap': !term.spike }"
                          >{{ term.spike ? 'Spike' : 'Content gap' }}</span
                        ><span v-else class="text-secondary">—</span>
                      </td>
                      <td>
                        <button
                          class="term-open"
                          :aria-label="`Review demand for ${term.term}`"
                          @click="openTerm(term.term)"
                        >
                          <ArrowRight :size="16" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="report-empty">
                <p>
                  {{
                    termFilter
                      ? 'No terms match your filter.'
                      : searchView === 'attention'
                        ? 'No search spikes or recurring content gaps in this period.'
                        : 'No searches recorded in this period.'
                  }}
                </p>
                <span>{{
                  termFilter
                    ? 'Try another word or clear the filter.'
                    : 'Search activity will appear here as people use your library.'
                }}</span>
              </div>
              <footer class="table-note">
                {{ filteredTerms.length }} displayed ·
                {{
                  searchView === 'all' ? 'Up to 50 most searched terms' : 'Up to 50 terms needing attention'
                }}
                · “New” means no searches recorded in the previous period.
              </footer>
            </section>
          </template>
          <template v-if="active.id === 'assets' && assets.data.value">
            <InsightsChart
              title="Activity by asset type"
              description="Views and downloads across your file categories."
              :empty="!assets.data.value.byType.length"
              @export="exportCsv('asset-types', assets.data.value.byType)"
              ><Bar role="img" aria-label="Views and downloads by asset type. Export CSV for the individual values." :data="typeChart" :options="barOptions"
            /></InsightsChart>
            <InsightsTable
              title="Most downloaded assets"
              description="The 20 assets with the most downloads in this period."
              :rows="assets.data.value.topDownloaded.filter((row) => row.downloads > 0)"
              :columns="fileColumns"
              @export="
                exportCsv(
                  'most-downloaded',
                  assets.data.value.topDownloaded.filter((row) => row.downloads > 0),
                )
              "
            />
            <InsightsTable
              title="Most viewed assets"
              :rows="assets.data.value.topViewed.filter((row) => row.views > 0)"
              :columns="fileColumns"
              @export="
                exportCsv(
                  'most-viewed',
                  assets.data.value.topViewed.filter((row) => row.views > 0),
                )
              "
            />
            <InsightsTable
              title="Activity by collection"
              :rows="assets.data.value.byCollection"
              :columns="collectionColumns"
              @export="exportCsv('activity-by-collection', assets.data.value.byCollection)"
            />
            <InsightsTable
              title="No recorded downloads"
              :description="`${assets.data.value.neverDownloaded.total} files with no downloads in retained history. Showing the 50 most recently added.`"
              :rows="
                formatRows(
                  formatRows(assets.data.value.neverDownloaded.files, 'size', formatStorage),
                  'createdAt',
                  fullDate,
                )
              "
              :columns="
                columns([
                  ['name', 'Asset'],
                  ['size', 'Size', '1'],
                  ['createdAt', 'Added', '1'],
                ])
              "
              @export="exportCsv('no-recorded-downloads', assets.data.value.neverDownloaded.files)"
            />
          </template>
          <template v-if="active.id === 'users' && users.data.value">
            <InsightsMap :rows="users.data.value.byRegion" @export="exportCsv('activity-by-region', users.data.value.byRegion)" />
            <InsightsChart
              title="People over time"
              description="Daily active users, logins and new registrations."
              :empty="!users.data.value.activeSeries.length && !users.data.value.newUserSeries.length"
              @export="
                exportCsv(
                  'user-activity',
                  rangeDays.map((day) => ({
                    day,
                    activeUsers:
                      users.data.value?.activeSeries.find((row) => String(row.day).slice(0, 10) === day)
                        ?.count ?? 0,
                    logins:
                      users.data.value?.loginSeries.find((row) => String(row.day).slice(0, 10) === day)
                        ?.count ?? 0,
                    newUsers:
                      users.data.value?.newUserSeries.find((row) => String(row.day).slice(0, 10) === day)
                        ?.count ?? 0,
                  })),
                )
              "
              ><Line role="img" aria-label="Daily activity chart. Export CSV for the individual values." :data="usersChart" :options="chartOptions"
            /></InsightsChart>
            <InsightsTable
              title="Top downloaders"
              :rows="formatRows(users.data.value.topDownloaders, 'lastDownloadAt', fullDate)"
              :columns="
                columns([
                  ['name', 'Name'],
                  ['email', 'Email'],
                  ['downloads', 'Downloads', '1'],
                  ['requests', 'Requests', '1'],
                  ['lastDownloadAt', 'Last download', '1'],
                ])
              "
              @export="exportCsv('top-downloaders', users.data.value.topDownloaders)"
            />
            <InsightsTable
              v-for="group in [
                { title: 'Activity by role', rows: users.data.value.byRole },
                { title: 'Activity by region', rows: users.data.value.byRegion },
                { title: 'Activity by group', rows: users.data.value.byGroup },
              ]"
              :key="group.title"
              :title="group.title"
              :description="
                group.title === 'Activity by region'
                  ? 'Regions assigned to user accounts; not geographic location tracking.'
                  : undefined
              "
              :rows="group.rows"
              :columns="activityColumns"
              @export="exportCsv(group.title.toLowerCase().replace(/ /g, '-'), group.rows)"
            />
          </template>
          <template v-if="active.id === 'collections' && collections.data.value">
            <InsightsChart
              title="Collections and sharing"
              description="Collections created and invitations sent each day."
              :empty="
                !collections.data.value.createdSeries.length && !collections.data.value.shareSeries.length
              "
              @export="
                exportCsv(
                  'collections',
                  rangeDays.map((day) => ({
                    day,
                    created:
                      collections.data.value?.createdSeries.find(
                        (row) => String(row.day).slice(0, 10) === day,
                      )?.count ?? 0,
                    invitations:
                      collections.data.value?.shareSeries.find((row) => String(row.day).slice(0, 10) === day)
                        ?.count ?? 0,
                  })),
                )
              "
              ><Line role="img" aria-label="Daily activity chart. Export CSV for the individual values." :data="collectionsChart" :options="chartOptions"
            /></InsightsChart>
            <InsightsTable
              title="Most shared collections"
              :rows="collections.data.value.mostShared"
              :columns="
                columns([
                  ['name', 'Collection'],
                  ['shares', 'Invitations', '1'],
                ])
              "
              @export="exportCsv('most-shared', collections.data.value.mostShared)"
            />
            <InsightsTable
              title="Most active collections"
              :rows="collections.data.value.mostActive"
              :columns="collectionColumns"
              @export="exportCsv('most-active', collections.data.value.mostActive)"
            />
          </template>
          <template v-if="active.id === 'storage' && assets.data.value">
            <InsightsChart
              title="Library growth"
              description="Files added each day during the selected period."
              :empty="!assets.data.value.growth.length"
              @export="exportCsv('library-growth', assets.data.value.growth)"
              ><Line role="img" aria-label="Daily activity chart. Export CSV for the individual values." :data="growthChart" :options="chartOptions"
            /></InsightsChart>
            <InsightsTable
              title="Storage by asset type"
              description="Current library totals, independent of the selected period."
              :rows="formatRows(assets.data.value.storageByType, 'bytes', formatStorage)"
              :columns="
                columns([
                  ['name', 'Asset type'],
                  ['files', 'Files', '1'],
                  ['bytes', 'Storage', '1'],
                ])
              "
              @export="exportCsv('storage-by-type', assets.data.value.storageByType)"
            />
          </template>
          <p class="insights-footnote">
            {{
              active.id === 'storage'
                ? 'Storage totals describe the current library.'
                : 'Activity reflects retained events. Earlier activity may be unavailable.'
            }}
            Date ranges include the end date. All charts use UTC.
          </p>
        </template>
      </main>
    </div>
    <Dialog v-model:open="detailOpen"
      ><DialogContent class="dv-theme dv-admin admin-dialog search-detail-dialog"
        ><DialogHeader
          ><DialogTitle>Search demand: “{{ selectedTerm }}”</DialogTitle
          ><DialogDescription
            >{{ dateLabel(selectedRange.from) }} – {{ dateLabel(selectedRange.to) }} · Understand the request
            and prepare a response.</DialogDescription
          ></DialogHeader
        >
        <p v-if="detail.isPending.value" role="status">Loading search details…</p>
        <div v-else-if="detail.isError.value" class="admin-error" role="alert">
          Could not load this term. <Button variant="outline" @click="detail.refetch()">Try again</Button>
        </div>
        <template v-else-if="detail.data.value"
          ><InsightsChart
            title="Demand over time"
            description="Searches for this exact term, including those without results."
            :empty="!detail.data.value.volume.length"
            @export="exportCsv('term-volume', detail.data.value.volume)"
            ><Line role="img" aria-label="Daily activity chart. Export CSV for the individual values." :data="detailChart" :options="chartOptions"
          /></InsightsChart>
          <section class="response-panel">
            <h3>Respond to this demand</h3>
            <p>Review the available content or prepare an update for the people who searched.</p>
            <div class="response-actions">
              <Button as-child variant="outline"
                ><RouterLink :to="{ name: 'search', query: { q: selectedTerm } }"
                  ><Search :size="15" /> Find matching content</RouterLink
                ></Button
              ><Button as-child variant="outline"
                ><RouterLink :to="{ name: 'admin-assets' }"
                  ><Files :size="15" /> Manage assets</RouterLink
                ></Button
              >
            </div>
            <label class="response-label"
              >Email draft<select v-model="draftKind" @change="messageCopied = false">
                <option value="waiting">Let people know you are checking</option>
                <option value="available">Share an availability update</option>
              </select></label
            ><textarea :value="emailBody" aria-label="Suggested email message" readonly rows="7"></textarea>
            <div class="response-copy">
              <span>Opens a draft in your email app. Review and edit it before sending.</span
              ><Button variant="outline" size="sm" @click="copyMessage">{{
                messageCopied ? 'Copied' : 'Copy message'
              }}</Button>
            </div>
            <p v-if="copyError" role="alert">Could not copy. Select and copy the message above.</p>
          </section>
          <section class="insight-report">
            <header class="report-heading">
              <div>
                <h3>People looking for this content</h3>
                <p>
                  {{ detail.data.value.audienceCount }} contactable users ·
                  {{ detail.data.value.audience.length }} shown (maximum 200)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                :disabled="!detail.data.value.audience.length"
                @click="exportCsv('search-audience', detail.data.value.audience)"
                ><Download :size="14" /> CSV</Button
              >
            </header>
            <div v-if="detail.data.value.audience.length" class="report-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th class="numeric">Searches</th>
                    <th class="numeric">No results</th>
                    <th><span class="sr-only">Email</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="person in detail.data.value.audience" :key="person.id">
                    <td>
                      {{ person.name }}<small class="audience-email">{{ person.email }}</small>
                    </td>
                    <td class="numeric">{{ person.searches }}</td>
                    <td class="numeric">{{ person.zeroResults }}</td>
                    <td>
                      <Button as-child variant="outline" size="sm"
                        ><a :href="emailLink(person.email)" :aria-label="`Prepare email for ${person.name}`"
                          ><Mail :size="14" /> Draft email</a
                        ></Button
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="report-empty">
              <p>No contactable users for this term.</p>
              <span>Deleted, guest, unverified and unapproved accounts are excluded.</span>
            </div>
          </section>
        </template>
      </DialogContent></Dialog
    >
  </div>
</template>
