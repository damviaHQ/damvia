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
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import Loader from "@/components/Loader.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { keepPreviousData, useQuery } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { Download } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const ALL = "all"
const toast = useGlobalToast()
const actor = ref("")
const action = ref(ALL)
const from = ref("")
const to = ref("")
const page = ref(1)
const pageSize = 50
const expanded = ref<string | null>(null)
const debouncedActor = refDebounced(actor, 300)

const filters = computed(() => ({
  actor: debouncedActor.value.trim() || undefined,
  action: action.value === ALL ? undefined : action.value,
  from: from.value ? new Date(`${from.value}T00:00:00`) : undefined,
  // The end date is included: entries before the next midnight.
  to: to.value ? new Date(new Date(`${to.value}T00:00:00`).getTime() + 86400000) : undefined,
}))
watch(filters, () => { page.value = 1 })

const actions = useQuery({ queryKey: ["audit", "actions"], queryFn: () => trpc.audit.actions.query() })
const log = useQuery({
  queryKey: ["audit", "list", filters, page],
  queryFn: () => trpc.audit.list.query({ ...filters.value, page: page.value, pageSize }),
  placeholderData: keepPreviousData,
})
const pages = computed(() => Math.max(1, Math.ceil((log.data.value?.total ?? 0) / pageSize)))

const formatDate = (value: string | Date) => new Date(value).toLocaleString()
const describe = (value: unknown) => value === null || value === undefined ? "" : JSON.stringify(value, null, 2)

async function exportLog() {
  try {
    const csv = await trpc.audit.export.mutate(filters.value)
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  }
}
</script>

<template>
  <div class="admin-page admin-resource-page">
    <AdminPageHeader description="Who changed what, and every sign-in and access decision. Entries cannot be edited or deleted.">
      <Button type="button" variant="outline" @click="exportLog">
        <Download class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
        Export CSV
      </Button>
    </AdminPageHeader>

    <div class="flex flex-wrap items-end gap-4 mb-4" role="search" aria-label="Filter the audit log">
      <FieldGroup>
        <Label for="audit-actor">Actor</Label>
        <Input id="audit-actor" v-model="actor" placeholder="Email contains" class="w-56" />
      </FieldGroup>
      <FieldGroup>
        <Label for="audit-action">Action</Label>
        <Select v-model="action">
          <SelectTrigger id="audit-action" class="w-56">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">All actions</SelectItem>
            <SelectItem v-for="name in actions.data.value ?? []" :key="name" :value="name">{{ name }}</SelectItem>
          </SelectContent>
        </Select>
      </FieldGroup>
      <FieldGroup>
        <Label for="audit-from">From</Label>
        <Input id="audit-from" v-model="from" type="date" />
      </FieldGroup>
      <FieldGroup>
        <Label for="audit-to">To</Label>
        <Input id="audit-to" v-model="to" type="date" />
      </FieldGroup>
    </div>

    <div v-if="log.status.value === 'pending'"><Loader :text="true" /></div>
    <div v-else-if="log.status.value === 'error'" class="admin-error" role="alert">{{ log.error.value?.message }}</div>
    <template v-else>
      <p class="mb-2 text-sm text-neutral-500" aria-live="polite">{{ log.data.value?.total ?? 0 }} entries</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Address</TableHead>
            <TableHead><span class="sr-only">Details</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-for="entry in log.data.value?.items ?? []" :key="entry.id">
            <TableRow>
              <TableCell class="whitespace-nowrap tabular-nums">{{ formatDate(entry.createdAt) }}</TableCell>
              <TableCell>{{ entry.actorLabel ?? (entry.actorId ? entry.actorId : "Anonymous") }}</TableCell>
              <TableCell><code class="text-xs">{{ entry.action }}</code></TableCell>
              <TableCell>
                <span class="text-neutral-500">{{ entry.targetType }}</span>
                {{ entry.targetLabel ?? entry.targetId ?? "" }}
              </TableCell>
              <TableCell class="tabular-nums">{{ entry.ip ?? "" }}</TableCell>
              <TableCell>
                <Button v-if="entry.before || entry.after" type="button" variant="ghost" size="sm"
                  :aria-expanded="expanded === entry.id" :aria-controls="`audit-${entry.id}`"
                  @click="expanded = expanded === entry.id ? null : entry.id">
                  {{ expanded === entry.id ? "Hide" : "Details" }}
                </Button>
              </TableCell>
            </TableRow>
            <TableRow v-if="expanded === entry.id" :id="`audit-${entry.id}`">
              <TableCell colspan="6">
                <div class="grid gap-4 md:grid-cols-2">
                  <div v-if="entry.before">
                    <p class="text-xs font-medium text-neutral-500">Before</p>
                    <pre class="overflow-x-auto text-xs">{{ describe(entry.before) }}</pre>
                  </div>
                  <div v-if="entry.after">
                    <p class="text-xs font-medium text-neutral-500">After</p>
                    <pre class="overflow-x-auto text-xs">{{ describe(entry.after) }}</pre>
                  </div>
                </div>
                <p v-if="entry.userAgent" class="mt-2 text-xs text-neutral-500">{{ entry.userAgent }}</p>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
      <nav v-if="pages > 1" class="mt-4 flex items-center gap-3" aria-label="Audit log pages">
        <Button type="button" variant="outline" size="sm" :disabled="page <= 1" @click="page--">Previous</Button>
        <span class="text-sm tabular-nums">Page {{ page }} of {{ pages }}</span>
        <Button type="button" variant="outline" size="sm" :disabled="page >= pages" @click="page++">Next</Button>
      </nav>
    </template>
  </div>
</template>
