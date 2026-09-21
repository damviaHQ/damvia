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
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { extractErrors, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const label = useRecordLabel()
const { data, status, error } = useQuery({
  queryKey: ["enrichment", "overview"],
  queryFn: () => trpc.enrichment.overview.query(),
  // A pass takes seconds; the page follows it while it runs.
  refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
})
const time = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""
const dateTime = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""
const startedBy = (run: { trigger: string; startedBy: string | null }) => run.trigger === "sync" ? "the sync" : run.startedBy ?? "an admin"
const runningReason = computed(() => {
  const running = data.value?.running
  if (!running) return ""
  return running.startedAt ? `Running since ${time(running.startedAt)}, started by ${startedBy(running)}` : "Running"
})

type StageStats = Record<string, Record<string, number>>
const stageLines = computed(() => {
  const stats = data.value?.lastRun?.stats as StageStats | null | undefined
  if (!stats) return []
  return [
    `Folders: ${stats.assetTypes?.folders ?? 0} re-typed, ${stats.assetTypes?.files ?? 0} files updated, ${stats.assetTypes?.paths ?? 0} paths refreshed`,
    `Matching: ${stats.entities?.matched ?? 0} matched, ${stats.entities?.unmatched ?? 0} unmatched, ${stats.entities?.conflicts ?? 0} in conflict; ${stats.entities?.linksAdded ?? 0} links added, ${stats.entities?.linksRemoved ?? 0} removed`,
    `Variants: ${stats.variants?.groups ?? 0} groups, ${stats.variants?.groupsAdded ?? 0} new, ${stats.variants?.groupsRemoved ?? 0} dissolved`,
  ]
})

const starting = ref(false)
async function runNow() {
  starting.value = true
  try {
    const result = await trpc.enrichment.run.mutate()
    toast.success(result.queued ? "Queued: it runs as soon as the current pass finishes" : "Enrichment started")
    await queryClient.invalidateQueries({ queryKey: ["enrichment"] })
  } catch (err) {
    toast.error(extractErrors(err as Error).message)
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <div v-if="status === 'pending'"><Loader :text="true" /></div>
  <div v-else-if="status === 'error'" class="admin-error" role="alert">{{ error?.message }}</div>
  <div v-else-if="data" class="admin-page admin-resource-page">
    <AdminPageHeader :description="`Folder rules, matching to ${label.lowerPlural.value} and variant groups run after every sync, every 5 minutes. Nothing is ever written to the cloud storage.`">
      <Button class="dv-button dv-button--primary" :disabled="starting || !!data.running" :title="runningReason || undefined" @click="runNow">Run enrichment now</Button>
    </AdminPageHeader>
    <p v-if="data.running" role="status" class="admin-form-note mb-4">{{ runningReason }}.</p>
    <div v-if="!data.synced" class="admin-empty dv-panel"><h2>No sync has run yet.</h2><p>Enrichment starts after the first sync of a cloud source.</p></div>
    <template v-else>
      <div class="overview-cards">
        <section class="dv-panel overview-card" aria-labelledby="overview-folders">
          <h2 id="overview-folders">Folders</h2>
          <dl>
            <div><dt>Typed by a rule</dt><dd>{{ data.folders.byRule }}</dd></div>
            <div><dt>Typed by hand</dt><dd>{{ data.folders.byHand }}</dd></div>
            <div><dt>Inherited</dt><dd>{{ data.folders.inherited }}</dd></div>
            <div><dt>Untyped</dt><dd>{{ data.folders.untyped }}</dd></div>
          </dl>
          <router-link :to="{ name: 'admin-folder-rules' }" class="underline">Folder rules</router-link>
        </section>
        <section class="dv-panel overview-card" aria-labelledby="overview-files">
          <h2 id="overview-files">Files and {{ label.lowerPlural.value }}</h2>
          <dl>
            <div><dt>Matched</dt><dd>{{ data.files.matched }}</dd></div>
            <div><dt>Unmatched</dt><dd>{{ data.files.unmatched }}</dd></div>
            <div><dt>In conflict</dt><dd>{{ data.files.conflicts }}</dd></div>
          </dl>
          <router-link :to="{ name: 'admin-unmatched' }" class="underline">Unmatched</router-link>
        </section>
        <section class="dv-panel overview-card" aria-labelledby="overview-variants">
          <h2 id="overview-variants">Variants</h2>
          <dl>
            <div><dt>Groups</dt><dd>{{ data.variantGroups }}</dd></div>
            <div><dt>Axes waiting for a name</dt><dd>{{ data.unnamedAxes }}</dd></div>
          </dl>
          <router-link :to="{ name: 'admin-variants' }" class="underline">Variants</router-link>
        </section>
      </div>
      <section class="dv-panel overview-card mt-6" aria-labelledby="overview-last-pass">
        <h2 id="overview-last-pass">Last pass</h2>
        <p v-if="!data.lastRun" class="admin-text-secondary">No pass has finished yet.</p>
        <template v-else>
          <p>{{ dateTime(data.lastRun.finishedAt) }}, started by {{ startedBy(data.lastRun) }}, in {{ ((data.lastRun.durationMs ?? 0) / 1000).toFixed(1) }} s.</p>
          <p v-if="data.lastRun.error" class="admin-form-error" role="alert">It stopped on an error: {{ data.lastRun.error }}</p>
          <ul v-else class="overview-stages">
            <li v-for="line in stageLines" :key="line">{{ line }}</li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.overview-cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; }
.overview-card { display:grid; gap:12px; align-content:start; padding:20px 24px; }
.overview-card h2 { font-size:var(--dv-size-section); }
.overview-card dl { display:grid; gap:6px; }
.overview-card dl div { display:flex; justify-content:space-between; gap:12px; }
.overview-card dt { color:var(--dv-text-secondary); }
.overview-card dd { font-variant-numeric:tabular-nums; font-weight:600; }
.overview-stages { display:grid; gap:4px; color:var(--dv-text-secondary); }
</style>
