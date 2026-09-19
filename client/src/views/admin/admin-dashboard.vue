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
import { ArrowRight, ArrowUpRight, Users, FolderOpen, Cloud, CloudOff, HardDrive, RefreshCw, Bell, AlertCircle, Check, FileArchive, UserCheck, UserPlus, MailPlus } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { formatStorage } from "@/utils/fileSize"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const { status, data, error, refetch } = useQuery({
  queryKey: ['dashboard'],
  queryFn: () => trpc.dashboard.summary.query(),
  refetchInterval: 30_000,
})
const assetTotal = computed(() => Object.values(data.value?.assets.byStatus ?? {}).reduce((sum, count) => sum + count, 0))
const downloadTotal = computed(() => Object.values(data.value?.downloads.last7DaysByStatus ?? {}).reduce((sum, count) => sum + count, 0))
const number = (value: number) => value.toLocaleString()
const isWorking = ref(false)
const isMeasuring = ref(false)
const busyUserId = ref<string | null>(null)

const storage = computed(() => data.value?.storage)
const percent = computed(() => storage.value?.percent == null ? null : Math.round(storage.value.percent))
const barWidth = computed(() => `${Math.min(100, Math.max(0, storage.value?.percent ?? 0))}%`)
const barColor = computed(() => {
  if (percent.value === null) return 'storage-bar--primary'
  if (percent.value >= 90) return 'storage-bar--danger'
  if (percent.value >= 80) return 'storage-bar--warning'
  return 'storage-bar--primary'
})
const disk = computed(() => storage.value?.disk ?? null)
const diskPercent = computed(() => disk.value ? Math.round((disk.value.totalBytes - disk.value.freeBytes) / disk.value.totalBytes * 100) : 0)
const diskBarColor = computed(() => diskPercent.value >= 90 ? 'storage-bar--danger' : diskPercent.value >= 80 ? 'storage-bar--warning' : 'storage-bar--primary')
const formatDate = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleString() : 'never'
const initials = (name: string) => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
const downloadStatusLabels: Record<string, string> = { ready: 'Ready', preparing: 'Preparing', failed: 'Failed', expired: 'Expired' }

const assetStatuses = [
  { key: 'up_to_date', label: 'Up to date' },
  { key: 'creating', label: 'Waiting for download' },
  { key: 'outdated', label: 'Outdated' },
  { key: 'pending_deletion', label: 'Pending deletion' },
]
const pendingFiles = computed(() => (data.value?.assets.byStatus.creating ?? 0) + (data.value?.assets.byStatus.outdated ?? 0))
const canRetryFiles = computed(() => pendingFiles.value > 0 && !storage.value?.quotaReachedAt && data.value?.jobs.downloading === 0)
const failedExports = computed(() => data.value?.downloads.last7DaysByStatus.failed ?? 0)
const missingAlertContact = computed(() => !!storage.value?.quotaBytes && data.value?.users.maintenanceContacts === 0)
const syncPaused = computed(() => !!data.value?.sync.paused)
const failedSources = computed(() => data.value?.sources.filter((source) => source.state === 'failed') ?? [])
const sourceStateLabels: Record<string, string> = { ok: 'Synced', failed: 'Failed', running: 'Syncing', never: 'Never synced' }
const sourceStateVariant = (state: string) => state === 'failed' ? 'destructive' : state === 'ok' ? 'secondary' : 'outline'
const syncStateLine = computed(() => {
  if (!data.value) return ''
  if (syncPaused.value) return 'Paused · storage full, no file is downloaded'
  if (failedSources.value.length) return `${failedSources.value.length} ${failedSources.value.length === 1 ? 'source is' : 'sources are'} failing to sync`
  if (data.value.jobs.downloading) return 'Files are downloading'
  return data.value.sources.length === 1 ? 'Your asset library' : `${data.value.sources.length} sources are synchronising`
})
const attentionCount = computed(() => [!!data.value?.users.pendingApproval, syncPaused.value, failedSources.value.length > 0, canRetryFiles.value, failedExports.value > 0, missingAlertContact.value].filter(Boolean).length)
const latestUserActivity = computed(() => {
  if (!data.value) return []
  const invitedEmails = new Set(data.value.recentInvitations.map((invitation) => invitation.email.toLocaleLowerCase()))
  return [
    ...data.value.recentUsers
      .filter((user) => !invitedEmails.has(user.email.toLocaleLowerCase()))
      .map((user) => ({ kind: 'user' as const, occurredAt: user.approved ? user.updatedAt : user.createdAt, user })),
    ...data.value.recentInvitations
      .map((invitation) => ({ kind: 'invitation' as const, occurredAt: invitation.createdAt, invitation })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 3)
})

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
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
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
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally {
    isWorking.value = false
  }
}

const approveUser = async (user: { id: string, name: string }) => {
  if (busyUserId.value) return
  busyUserId.value = user.id
  try {
    await trpc.user.approve.mutate(user.id)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
    ])
    toast.success(`${user.name} approved`)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally {
    busyUserId.value = null
  }
}
</script>

<template>
 <div class="admin-dashboard page">
  <div class="page-heading"><div><h1>Dashboard</h1></div><Button as-child variant="outline" class="dv-button"><router-link :to="{ name: 'admin-users' }"><Users />Manage users<ArrowUpRight /></router-link></Button></div>
  <Loader v-if="status === 'pending'" :text="true" />
  <Alert v-else-if="status === 'error'" variant="destructive"><AlertTitle>Failed to load the dashboard</AlertTitle><AlertDescription>{{ error?.message }}<Button variant="outline" class="dv-button" @click="refetch()">Try again</Button></AlertDescription></Alert>
  <template v-else-if="data && storage">
   <section v-if="attentionCount" class="dv-panel task-panel attention-first" aria-labelledby="attention-heading">
    <div class="task-heading"><h2 id="attention-heading">Needs attention</h2><span>{{ attentionCount }} {{ attentionCount === 1 ? 'item' : 'items' }}</span></div>
    <div v-if="data.users.pendingApproval" class="task-row">
     <span class="task-icon"><Users /></span>
     <div class="task-copy"><h3>{{ number(data.users.pendingApproval) }} {{ data.users.pendingApproval === 1 ? 'person is' : 'people are' }} waiting for access</h3><p>Review their details and decide who can join your workspace.</p></div>
     <Button as-child variant="outline" class="dv-button"><router-link :to="{ name: 'admin-users', query: { needsApproval: 'true' } }">Review requests <ArrowRight /></router-link></Button>
    </div>
    <div v-if="syncPaused" class="task-row">
     <span class="task-icon task-icon--warning"><CloudOff /></span>
     <div class="task-copy"><h3>Synchronisation is paused: the storage plan is full</h3><p>Since {{ formatDate(data.sync.pausedSince) }}, no file is downloaded from any cloud source. Free space or ask for a larger plan, then measure the storage to resume.</p></div>
     <Button variant="outline" class="dv-button" :disabled="isWorking || data.jobs.measuring" @click="measureStorage">Measure now <ArrowRight /></Button>
    </div>
    <div v-if="failedSources.length" class="task-row">
     <span class="task-icon task-icon--warning"><AlertCircle /></span>
     <div class="task-copy"><h3>{{ failedSources.length === 1 ? `The source ${failedSources[0].name} failed to sync` : `${failedSources.length} sources failed to sync` }}</h3><p>{{ failedSources.length === 1 ? failedSources[0].lastError : 'Their last run ended with an error; the next attempt is in a few minutes.' }}</p></div>
     <Button as-child variant="outline" class="dv-button"><router-link :to="{ name: 'admin-assets' }">View sources <ArrowRight /></router-link></Button>
    </div>
    <div v-if="canRetryFiles" class="task-row">
     <span class="task-icon"><RefreshCw /></span>
     <div class="task-copy"><h3>{{ number(pendingFiles) }} {{ pendingFiles === 1 ? 'file is' : 'files are' }} waiting to sync</h3><p>No file downloads are running. Retry to bring these files into the library.</p></div>
     <Button variant="outline" class="dv-button" :disabled="isWorking" @click="retryPendingAssets">Retry files <ArrowRight /></Button>
    </div>
    <div v-if="failedExports" class="task-row">
     <span class="task-icon task-icon--warning"><AlertCircle /></span>
     <div class="task-copy"><h3>{{ number(failedExports) }} {{ failedExports === 1 ? 'export failed' : 'exports failed' }} in the last 7 days</h3><p>Some download archives could not be prepared. Ask your hosting provider to investigate.</p></div>
     <Button v-if="storage.serverContactEmails.length" as-child variant="outline" class="dv-button"><a :href="`mailto:${storage.serverContactEmails.join(',')}`">Contact support <ArrowUpRight /></a></Button>
    </div>
    <div v-if="missingAlertContact" class="task-row">
     <span class="task-icon"><Bell /></span>
     <div class="task-copy"><h3>Choose who receives storage alerts</h3><p>Enable maintenance emails on an administrator’s profile so storage warnings reach your team.</p></div>
     <Button as-child variant="outline" class="dv-button"><router-link :to="{ name: 'admin-users' }">Choose recipient <ArrowRight /></router-link></Button>
    </div>
   </section>
   <dl class="overview-summary" aria-label="Workspace summary">
    <div><dt>Assets</dt><dd>{{ number(assetTotal) }}</dd></div>
    <div><dt>Users</dt><dd>{{ number(data.users.total) }}</dd></div>
    <div><dt>Collections</dt><dd>{{ number(data.collections?.total ?? 0) }}</dd></div>
    <div><dt>Downloads, last 7 days</dt><dd>{{ number(downloadTotal) }}</dd></div>
   </dl>
   <div class="dashboard-grid">
    <div class="dashboard-main">
     <section class="dv-panel user-activity-panel"><div class="section-heading"><div><h2>Latest user activity</h2><p>Recent registrations and access decisions.</p></div><router-link :to="{ name: 'admin-users' }" class="stat-link">View users <ArrowRight /></router-link></div>
      <div v-for="activity in latestUserActivity" :key="`${activity.kind}-${activity.kind === 'user' ? activity.user.id : activity.invitation.id}`" class="user-activity-row">
       <template v-if="activity.kind === 'user'">
        <span class="user-avatar">{{ initials(activity.user.name) }}</span>
        <div class="user-activity-copy"><strong>{{ activity.user.name }}</strong><span>{{ activity.user.approved ? 'Access approved' : activity.user.emailVerified ? 'Requested access' : 'Registered · email unverified' }}</span><small>{{ activity.user.company }} · {{ formatDate(activity.occurredAt) }}</small></div>
        <Button v-if="activity.user.emailVerified && !activity.user.approved" class="dv-button dv-button--primary approve-button" :disabled="!!busyUserId" :aria-label="`Approve ${activity.user.name}`" @click="approveUser(activity.user)"><Check />{{ busyUserId === activity.user.id ? 'Approving…' : 'Approve' }}</Button>
        <span v-else class="activity-state" :class="{ 'activity-state--approved': activity.user.approved }"><UserCheck v-if="activity.user.approved" /><UserPlus v-else />{{ activity.user.approved ? 'Approved' : 'Registered' }}</span>
       </template>
       <template v-else>
        <span class="user-avatar user-avatar--invitation"><MailPlus /></span>
        <div class="user-activity-copy"><strong>{{ activity.invitation.invitedBy?.name ?? 'A workspace user' }} invited a guest</strong><span>{{ activity.invitation.email }}</span><small>{{ activity.invitation.collection.name }} · {{ formatDate(activity.occurredAt) }}</small></div>
        <span class="activity-state"><MailPlus />Guest invited</span>
       </template>
      </div>
      <p v-if="!latestUserActivity.length" class="empty-state">No user activity yet.</p>
     </section>
           <section v-if="disk" class="dv-panel detail-panel">
        <h2 class="text-lg font-semibold">Server disk</h2>
        <p class="text-body admin-text-secondary">Visible to the hosting contact only</p>
        <p class="text-3xl font-bold mt-2">
          {{ formatStorage(disk.totalBytes - disk.freeBytes) }}
          <span class="admin-text-secondary font-normal text-xl">/ {{ formatStorage(disk.totalBytes) }}</span>
        </p>
        <div class="mt-4">
          <div class="h-2 bg-neutral-200 overflow-hidden" role="progressbar" aria-label="Server disk used" :aria-valuenow="Math.min(100, diskPercent)" aria-valuemin="0" aria-valuemax="100">
            <div class="h-2 w-full origin-left transition-transform" :class="diskBarColor" :style="{ transform: `scaleX(${Math.min(100, diskPercent) / 100})` }"></div>
          </div>
          <p class="text-body admin-text-secondary mt-2">{{ diskPercent }}% used, {{ formatStorage(disk.freeBytes) }} free</p>
        </div>

        <dl class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-body">
          <div>
            <dt class="admin-text-secondary">Cloud synchronisation</dt>
            <dd class="font-medium">
              <template v-if="storage.quotaReachedAt">
                <Badge variant="destructive">Paused</Badge>
                since {{ formatDate(storage.quotaReachedAt) }}, {{ disk.blockedFiles }} file{{ disk.blockedFiles === 1 ? '' : 's' }} waiting
              </template>
              <template v-else><Badge variant="secondary">Running</Badge></template>
            </dd>
          </div>
          <div>
            <dt class="admin-text-secondary">Last orphan cleanup</dt>
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


    </div>
    <aside class="dashboard-aside" aria-label="Workspace health">
     <section class="dv-panel health-panel"><div class="section-heading"><h2>Cloud synchronisation</h2><CloudOff v-if="syncPaused" /><Cloud v-else /></div><p class="sync-state" :class="{ 'sync-state--paused': syncPaused, 'sync-state--failed': !syncPaused && failedSources.length }">{{ syncStateLine }}</p><ul class="source-list" aria-label="Cloud sources"><li v-for="source in data.sources" :key="source.key" class="source-row"><span class="source-row__copy"><strong>{{ source.name }}</strong><small>{{ source.provider }} · {{ source.lastSuccessAt ? `synced ${formatDate(source.lastSuccessAt)}` : 'never synced' }}</small></span><Badge :variant="syncPaused ? 'outline' : sourceStateVariant(source.state)">{{ syncPaused ? 'Paused' : sourceStateLabels[source.state] }}</Badge></li></ul><router-link :to="{ name: 'admin-assets' }" class="stat-link">View sources <ArrowRight /></router-link><dl class="health-list"><div><dt>Up to date</dt><dd>{{ number(data.assets.byStatus.up_to_date ?? 0) }} / {{ number(assetTotal) }}</dd></div><div><dt>Waiting for download</dt><dd>{{ data.assets.byStatus.creating ?? 0 }}</dd></div><div><dt>Outdated</dt><dd>{{ data.assets.byStatus.outdated ?? 0 }}</dd></div><div><dt>Download jobs</dt><dd>{{ data.jobs.downloading }}</dd></div></dl><Button variant="outline" class="dv-button full-width" :disabled="isWorking || data.jobs.downloading > 0" @click="retryPendingAssets"><RefreshCw />{{ data.jobs.downloading > 0 ? 'Downloading…' : 'Retry pending files' }}</Button><p class="small-note">Retries files waiting to download from your cloud storage.</p></section>
     <section class="dv-panel capacity-panel"><div class="section-heading"><h2>{{ percent !== null && percent >= 80 ? 'Storage needs attention' : 'Storage' }}</h2><HardDrive /></div><div class="capacity-number">{{ formatStorage(storage.usedBytes) }}<span v-if="storage.quotaBytes"> / {{ formatStorage(storage.quotaBytes) }}</span></div><template v-if="storage.quotaBytes"><div class="storage-track" role="progressbar" aria-label="Storage used" :aria-valuenow="Math.min(100, Math.max(0, percent ?? 0))" :aria-valuetext="`${percent}% of storage plan used`"><div :style="{ width: barWidth }" :class="barColor"></div></div><p class="small-note">{{ percent }}% used · {{ formatStorage(Math.max(0, storage.quotaBytes - storage.usedBytes)) }} available</p></template><p v-else class="small-note">No storage limit configured.</p><Button variant="outline" class="dv-button full-width measure-button" :disabled="isWorking || data.jobs.measuring" @click="measureStorage"><HardDrive />{{ isMeasuring || data.jobs.measuring ? 'Measuring…' : 'Measure now' }}</Button><p class="small-note">Last measured {{ formatDate(storage.measuredAt) }}</p><details class="storage-details"><summary>What counts towards storage?</summary><p>Original files and generated previews count towards your usage. A hosting administrator can configure the plan with STORAGE_QUOTA.</p></details></section>
    </aside>
   </div>
   <section class="workspace-activity" aria-labelledby="workspace-activity-heading">
    <div class="workspace-activity-heading"><div><h2 id="workspace-activity-heading">Workspace activity</h2><p>Latest file updates and download requests.</p></div></div>
    <div class="activity-columns">
     <section class="activity-feed" aria-labelledby="recently-updated-heading">
      <div class="activity-feed-heading"><h3 id="recently-updated-heading">Recently updated</h3><router-link :to="{ name: 'admin-assets' }" class="stat-link">View assets <ArrowRight /></router-link></div>
      <router-link v-for="file in data.recentFiles" :key="file.id" :to="{ name: 'admin-assets', params: { id: file.folderId } }" class="activity-row"><span class="activity-icon"><FolderOpen /></span><span class="activity-row-copy"><strong>{{ file.name }}</strong><small>{{ assetStatuses.find(item => item.key === file.status)?.label ?? file.status }} · {{ formatStorage(Number(file.size)) }}</small></span><time>{{ formatDate(file.updatedAt) }}</time></router-link>
      <p v-if="!data.recentFiles?.length" class="activity-empty">No files have been updated yet.</p>
     </section>
     <section class="activity-feed" aria-labelledby="recently-downloaded-heading">
      <div class="activity-feed-heading"><h3 id="recently-downloaded-heading">Recently downloaded</h3><span>{{ data.recentDownloads?.length ?? 0 }} recent</span></div>
      <div v-for="download in data.recentDownloads" :key="download.id" class="activity-row"><span class="activity-icon"><FileArchive /></span><span class="activity-row-copy"><strong>{{ download.fileCount }} {{ download.fileCount === 1 ? 'file' : 'files' }}</strong><small>{{ download.user.name }} · {{ downloadStatusLabels[download.status] ?? download.status }}</small></span><time>{{ formatDate(download.updatedAt) }}</time></div>
      <p v-if="!data.recentDownloads?.length" class="activity-empty">No recent downloads.</p>
     </section>
    </div>
   </section>
  </template>
 </div>
</template>

<style scoped>
.page { container-type:inline-size; padding: 39px 36px 32px; max-width: 1540px; margin: auto; }
.page-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 30px; }
.page-heading h1 { font-size: var(--dv-size-heading); }
.page-heading p { color: var(--dv-text-secondary); font-size:var(--dv-size-caption); margin-top: 10px; }
.page-heading .dv-button { flex-shrink: 0; }
.overview-summary { display: flex; flex-wrap: wrap; gap: 8px 32px; margin: 0 0 28px; }
.overview-summary > div { display: flex; align-items: baseline; gap: 8px; }
.overview-summary dt { font-size:var(--dv-size-caption); color: var(--dv-text-secondary); }
.overview-summary dd { margin: 0; font-size:var(--dv-size-section); font-weight: 600; font-variant-numeric: tabular-nums; }
.attention-first { margin-bottom: 28px; }
.sync-state { margin: 20px 0; font-size:var(--dv-size-caption); font-weight: 550; }
.stat-link { display: flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 0; font-size:var(--dv-size-caption) !important; color: var(--dv-action-primary); }
.stat-link svg { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }
.dashboard-grid { display: grid; grid-template-columns: minmax(0, 1fr) 285px; gap: 26px; }
.dashboard-main, .dashboard-aside { display: flex; flex-direction: column; gap: 25px; min-width: 0; }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 15px; }
.section-heading h2 { font-size:var(--dv-size-body); }
.section-heading p { margin-top: 5px; color: var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.user-activity-panel { overflow:hidden; }
.user-activity-panel .section-heading { padding:23px 23px 18px; }
.user-activity-row { display:flex; align-items:center; gap:13px; min-height:78px; padding:14px 23px; border-top:1px solid var(--dv-color-line); }
.user-avatar { display:grid; place-items:center; flex:0 0 38px; width:38px; height:38px; border-radius:50%; background:var(--dv-color-line); color:var(--dv-text-primary); font-size:var(--dv-size-caption); font-weight:650; letter-spacing:.02em; }
.user-avatar--invitation { background:var(--dv-action-soft); color:var(--dv-action-primary); }
.user-avatar--invitation svg { width:var(--dv-icon-default); height:var(--dv-icon-default); }
.user-activity-copy { display:flex; flex:1; min-width:0; flex-direction:column; }
.user-activity-copy strong { overflow:hidden; font-size:var(--dv-size-caption); font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.user-activity-copy span { margin-top:3px; color:var(--dv-text-primary); font-size:var(--dv-size-caption); }
.user-activity-copy small { overflow:hidden; margin-top:3px; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); text-overflow:ellipsis; white-space:nowrap; }
.approve-button { flex-shrink:0; font-size:var(--dv-size-caption) !important; }
.activity-state { display:flex; align-items:center; gap:5px; flex-shrink:0; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.activity-state svg { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }
.activity-state--approved { color:var(--dv-color-success); }
.health-panel, .capacity-panel { padding: 23px; }
.health-panel .section-heading h2 { font-size:var(--dv-size-body); }
.health-list { margin: 0 0 21px; font-size:var(--dv-size-caption); }
.health-list div { display: flex; justify-content: space-between; padding: 6px 0; }
.health-list dt { color: var(--dv-text-secondary); }
.health-list dd { margin: 0; }
.sync-state--paused, .sync-state--failed { color: var(--dv-color-danger, #b42318); font-weight: 600; }
.source-list { display:flex; flex-direction:column; gap:8px; margin:12px 0; padding:0; list-style:none; }
.source-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.source-row__copy { display:grid; min-width:0; gap:2px; }
.source-row__copy strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.source-row__copy small { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.full-width { width: 100%; }
.small-note { color: var(--dv-text-secondary); font-size:var(--dv-size-caption); margin-top: 9px !important; }
.health-panel > .small-note { text-align: center; font-size:var(--dv-size-caption); }
.capacity-panel .section-heading > svg { width:var(--dv-icon-compact); color: var(--dv-text-secondary); }
.capacity-number { margin: 19px 0 16px; font-size: 27px; font-weight: 600; letter-spacing: -.035em; font-variant-numeric: tabular-nums; }
.capacity-number span { font-size:var(--dv-size-caption); color: var(--dv-text-secondary); font-weight: 400; letter-spacing: 0; }
.storage-details { border-top: 1px solid var(--dv-color-line); padding-top: 14px; font-size:var(--dv-size-caption); }
.storage-details summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; color: var(--dv-text-secondary); list-style: none; }
.storage-details summary::-webkit-details-marker { display: none; }
.storage-details svg { width:var(--dv-icon-compact); }
.storage-details[open] svg { transform: rotate(90deg); }
.storage-details p { color: var(--dv-text-secondary); padding-top: 10px; line-height: 1.7; }

.admin-dashboard :deep(.dv-button) { height:auto; box-shadow:none; padding:9px 14px; border-radius:0; }
.admin-dashboard :deep(.dv-button svg) { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }
.admin-dashboard h1 { font-weight:550; letter-spacing:-.035em; line-height:1.2; }
.admin-dashboard h2 { font-weight:600; }
.task-panel { overflow:hidden; }
.task-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 23px; }
.task-heading h2 { font-size:var(--dv-size-body); }
.task-heading > span { font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.task-row { display:flex; align-items:center; gap:14px; padding:20px 23px; border-top:1px solid var(--dv-color-line); }
.task-icon { display:grid; place-items:center; flex-shrink:0; width:36px; height:36px; border-radius:var(--dv-radius-graphic); color:var(--dv-action-primary); background:var(--dv-surface-canvas); }
.task-icon--warning { color:var(--dv-color-warning); background:var(--dv-color-warning-soft); }
.task-copy { flex:1; min-width:0; }
.task-copy h3 { font-size:var(--dv-size-body); font-weight:550; line-height:1.5; }
.task-copy p { margin-top:4px; font-size:var(--dv-size-caption); color:var(--dv-text-secondary); line-height:1.6; }
.task-row :deep(.dv-button) { flex-shrink:0; font-size:var(--dv-size-caption) !important; }
@media(max-width:1200px) { .task-row { flex-wrap:wrap; } .task-copy { flex-basis:calc(100% - 50px); } .task-row :deep(.dv-button) { margin-left:50px; } }
@media(max-width:600px) { .task-heading, .task-row { padding:18px; } }
.detail-panel { padding:20px; }
.detail-panel h2 { font-size:var(--dv-size-body); }
.empty-state { padding:24px; font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.storage-track { height:6px; border-radius:var(--dv-radius-data); overflow:hidden; background:var(--dv-color-line); margin-top:20px; }
.storage-track > div { height:100%; background:var(--dv-action-primary); }
.storage-bar--primary { background:var(--dv-action-primary); }
.storage-track > .storage-bar--danger { background:var(--dv-color-danger); }
.storage-track > .storage-bar--warning { background:var(--dv-color-warning); }
.measure-button { margin-top:20px; }
.workspace-activity { margin-top:35px; }
.workspace-activity-heading { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:17px; }
.workspace-activity-heading h2 { font-size:var(--dv-size-section); }
.workspace-activity-heading p { margin-top:5px; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.activity-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:34px; }
.activity-feed { min-width:0; }
.activity-feed-heading { display:flex; align-items:center; justify-content:space-between; gap:15px; min-height:39px; border-bottom:1px solid var(--dv-color-line); }
.activity-feed-heading h3 { font-size:var(--dv-size-body); font-weight:600; }
.activity-feed-heading > span { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.activity-row { display:flex; align-items:center; gap:11px; min-height:67px; padding:12px 0; border-bottom:1px solid var(--dv-color-line); }
.activity-row:hover { background:var(--dv-surface-panel); }
.activity-icon { display:grid; place-items:center; flex:0 0 34px; width:34px; height:34px; border-radius:var(--dv-radius-graphic); background:var(--dv-color-line); color:var(--dv-text-secondary); }
.activity-icon svg { width:var(--dv-icon-default); height:var(--dv-icon-default); }
.activity-row-copy { display:flex; flex:1; min-width:0; flex-direction:column; }
.activity-row-copy strong { overflow:hidden; font-size:var(--dv-size-body); font-weight:550; text-overflow:ellipsis; white-space:nowrap; }
.activity-row-copy small { overflow:hidden; margin-top:4px; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); text-overflow:ellipsis; white-space:nowrap; }
.activity-row time { flex:0 0 auto; max-width:38%; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); text-align:right; }
.activity-empty { padding:21px 0; border-bottom:1px solid var(--dv-color-line); color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
@media(max-width:1200px) { .dashboard-grid { grid-template-columns:minmax(0,1fr) 270px; gap:18px; } }
@media(max-width:1000px) { .dashboard-grid { grid-template-columns:1fr; } .dashboard-aside { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } .page-heading { align-items:flex-start; } .activity-columns { grid-template-columns:1fr; } }
@media(max-width:600px) { .page { padding:28px 20px; } .page-heading { flex-direction:column; } .dashboard-aside { display:flex; } .user-activity-panel .section-heading, .user-activity-row { padding-left:16px; padding-right:16px; } .user-activity-row { flex-wrap:wrap; } .approve-button, .activity-state { margin-left:51px; } .recent-asset { padding:16px; flex-wrap:wrap; } .asset-meta { margin-left:65px; text-align:left; max-width:100%; } .asset-name { flex:1; } .panel-foot { flex-wrap:wrap; } .activity-row time { display:none; } }

/* Use the available dashboard width, including the space taken by navigation. */
@container (min-width:1120px) {
 .dashboard-grid { grid-template-columns:minmax(0,1.6fr) repeat(2,minmax(0,1fr)); gap:24px; align-items:stretch; }
 .dashboard-main, .dashboard-aside { display:contents; }
 .task-panel, .detail-panel { grid-column:1 / -1; }
 .user-activity-panel { grid-column:1; }
 .health-panel { grid-column:2; }
 .capacity-panel { grid-column:3; }
 .user-activity-panel, .health-panel, .capacity-panel { height:100%; }
}
</style>
