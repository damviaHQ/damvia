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
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref } from "vue"

// The enrichment pass runs by itself after every sync. This shows the last one
// and starts another straight away.
const toast = useGlobalToast()
const queryClient = useQueryClient()
const { data } = useQuery({
  queryKey: ["enrichment", "overview"],
  queryFn: () => trpc.enrichment.overview.query(),
  // A pass takes seconds; the card follows it while it runs.
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
  <section v-if="data" class="dv-panel enrichment-pass" aria-labelledby="enrichment-pass-heading">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h3 id="enrichment-pass-heading">Last enrichment pass</h3>
      <Button variant="outline" size="sm" :disabled="starting || !!data.running" :title="runningReason || undefined" @click="runNow">Run enrichment now</Button>
    </div>
    <p v-if="data.running" role="status" class="admin-form-note">{{ runningReason }}.</p>
    <p v-if="!data.synced" class="admin-text-secondary">No sync has run yet. Enrichment starts after the first sync of a cloud source.</p>
    <p v-else-if="!data.lastRun" class="admin-text-secondary">No pass has finished yet.</p>
    <template v-else>
      <p>{{ dateTime(data.lastRun.finishedAt) }}, started by {{ startedBy(data.lastRun) }}, in {{ ((data.lastRun.durationMs ?? 0) / 1000).toFixed(1) }} s. It runs by itself after every sync.</p>
      <p v-if="data.lastRun.error" class="admin-form-error" role="alert">It stopped on an error: {{ data.lastRun.error }}</p>
      <ul v-else class="enrichment-pass__stages">
        <li v-for="line in stageLines" :key="line">{{ line }}</li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.enrichment-pass { display:grid; gap:12px; align-content:start; padding:20px; }
.enrichment-pass h3 { font-size:var(--dv-size-body); font-weight:600; }
.enrichment-pass__stages { display:grid; gap:4px; color:var(--dv-text-secondary); }
</style>
