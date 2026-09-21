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
import { Check } from "@lucide/vue"
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

// The setup, in the order its steps depend on each other, each with where it
// stands and where to go. Fields and variants are optional.
const steps = computed(() => {
  const overview = data.value
  if (!overview) return []
  const plural = label.lowerPlural.value
  const types = overview.assetTypes
  return [
    {
      title: "Asset types",
      what: "Say what kind of file each folder holds. The other settings are made per type.",
      status: `${types.total} ${types.total === 1 ? "type" : "types"}, ${overview.folders.untyped} ${overview.folders.untyped === 1 ? "folder" : "folders"} without a type`,
      done: types.total > 0 && overview.folders.untyped === 0,
      optional: false,
      to: { name: "admin-asset-types" },
      action: "Open asset types",
    },
    {
      title: `Link to ${plural}`,
      what: `For each type related to ${plural}, say how a file finds its ${label.lower.value}: name, folder or metadata.`,
      status: !overview.records ? `No ${label.lower.value} yet: import your ${plural} first` : types.relatedToRecords ? `${types.withSteps} of ${types.relatedToRecords} ${types.relatedToRecords === 1 ? "type has" : "types have"} steps` : `No asset type is related to ${plural} yet: tick it in step 1`,
      done: overview.records > 0 && types.relatedToRecords > 0 && types.withSteps === types.relatedToRecords,
      optional: false,
      to: overview.records ? { name: "admin-matching" } : { name: "admin-record-import" },
      action: overview.records ? "Set the steps" : `Import ${plural}`,
    },
    {
      title: "File metadata",
      what: `What readers see and can search of the metadata read from photos. ${label.singular.value} fields are set from Manage fields on the ${plural} page.`,
      status: `${overview.metadataFields.shown} of ${overview.metadataFields.total} photo metadata fields shown`,
      done: overview.metadataFields.shown > 0,
      optional: true,
      to: { name: "admin-file-metadata" },
      action: "Open file metadata",
    },
    {
      title: "Variants",
      what: "Show the formats of one creative as a single card. Switched on per asset type.",
      status: `${types.groupingVariants} ${types.groupingVariants === 1 ? "type groups" : "types group"} variants, ${overview.variantGroups} groups, ${overview.unnamedAxes} to name`,
      done: types.groupingVariants > 0 && overview.unnamedAxes === 0,
      optional: true,
      to: { name: "admin-variants" },
      action: "Open variants",
    },
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
    <AdminPageHeader :description="`Four settings give every file its type, its ${label.lower.value} and its variants. Make them once, in order, and adjust them when your folders or catalogue change; they then run by themselves after every sync, every 5 minutes. Nothing is ever written to the cloud storage.`">
      <Button class="dv-button dv-button--primary" :disabled="starting || !!data.running" :title="runningReason || undefined" @click="runNow">Run enrichment now</Button>
    </AdminPageHeader>
    <p v-if="data.running" role="status" class="admin-form-note mb-4">{{ runningReason }}.</p>
    <div v-if="!data.synced" class="admin-empty dv-panel"><h2>No sync has run yet.</h2><p>Enrichment starts after the first sync of a cloud source.</p></div>
    <template v-else>
      <ol class="setup-steps">
        <li v-for="(step, index) in steps" :key="step.title" class="dv-panel setup-step" :class="{ 'setup-step--done': step.done }">
          <span class="setup-step__number" aria-hidden="true"><Check v-if="step.done" class="size-4" /><template v-else>{{ index + 1 }}</template></span>
          <div class="setup-step__body">
            <h2>{{ step.title }}<span v-if="step.optional" class="setup-step__optional">Optional</span><span v-if="step.done" class="sr-only"> (done)</span></h2>
            <p>{{ step.what }}</p>
            <p class="setup-step__status">{{ step.status }}</p>
          </div>
          <router-link :to="step.to" class="dv-button">{{ step.action }}</router-link>
        </li>
      </ol>
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
.setup-steps { display:grid; gap:12px; }
.setup-step { display:flex; align-items:center; gap:16px; padding:18px 24px; }
.setup-step__number { display:flex; flex-shrink:0; align-items:center; justify-content:center; width:32px; height:32px; border:1px solid var(--dv-color-line-strong); border-radius:999px; font-weight:650; font-variant-numeric:tabular-nums; }
.setup-step--done .setup-step__number { border-color:var(--dv-action-primary); background:var(--dv-action-primary); color:white; }
.setup-step__body { display:grid; flex:1; gap:4px; min-width:0; }
.setup-step__body h2 { display:flex; align-items:center; gap:8px; font-size:var(--dv-size-section); }
.setup-step__body p { color:var(--dv-text-secondary); }
.setup-step__status { font-variant-numeric:tabular-nums; }
.setup-step__optional { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); font-weight:500; }
@media(max-width:640px) { .setup-step { flex-wrap:wrap; } }
.overview-card { display:grid; gap:12px; align-content:start; padding:20px 24px; }
.overview-card h2 { font-size:var(--dv-size-section); }
.overview-stages { display:grid; gap:4px; color:var(--dv-text-secondary); }
</style>
