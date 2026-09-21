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
import RecordPicker, { type RecordTarget } from "@/components/admin/RecordPicker.vue"
import Loader from "@/components/Loader.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { computed, ref, watch } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const label = useRecordLabel()
const tab = ref("folders")
const search = ref("")
const debouncedSearch = refDebounced(search, 300)
const page = ref(1)
watch(debouncedSearch, () => { page.value = 1 })

const { data: counts, status } = useQuery({ queryKey: ["entity-resolution", "counts"], queryFn: () => trpc.entityResolution.counts.query() })
const { data: folders, status: foldersStatus } = useQuery({ queryKey: ["entity-resolution", "folders"], queryFn: () => trpc.entityResolution.unmatchedFolders.query() })
const { data: files, status: filesStatus } = useQuery({
  queryKey: computed(() => ["entity-resolution", "files", debouncedSearch.value, page.value]),
  queryFn: () => trpc.entityResolution.unmatchedFiles.query({ search: debouncedSearch.value || undefined, page: page.value }),
})
const { data: conflicts, status: conflictsStatus } = useQuery({ queryKey: ["entity-resolution", "conflicts"], queryFn: () => trpc.entityResolution.conflicts.query() })
const { data: dangling, status: danglingStatus } = useQuery({ queryKey: ["entity-resolution", "dangling"], queryFn: () => trpc.entityResolution.dangling.query() })

const strategyLabel: Record<string, string> = {
  filename_regex: "file name",
  folder_regex: "folder path",
  manual_folder: "folder set by hand",
  manual_file: "set by hand",
  csv: "CSV import",
  metadata: "file metadata",
}

const selected = ref<string[]>([])
watch(files, () => { selected.value = selected.value.filter((id) => files.value?.files.some((file) => file.id === id)) })
function toggle(id: string, checked: boolean | "indeterminate") {
  selected.value = checked === true ? [...selected.value, id] : selected.value.filter((current) => current !== id)
}

const picker = ref<{ title: string; description: string; folderId?: string; fileIds?: string[]; name: string } | null>(null)
const saving = ref(false)

function attachFolder(folder: { id: string; path: string; files: number }) {
  picker.value = { title: `Link ${folder.path}`, description: `Every file in this folder and its subfolders, ${folder.files} unmatched now, is linked, and files added later follow.`, folderId: folder.id, name: folder.path }
}
function attachFiles(ids: string[], name: string) {
  picker.value = { title: `Link ${name}`, description: `${ids.length} ${ids.length === 1 ? "file is" : "files are"} linked by hand. No matching rule changes this link later.`, fileIds: ids, name }
}

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ["entity-resolution"] })
}

async function confirm(target: RecordTarget) {
  if (!picker.value) return
  saving.value = true
  try {
    const result = await trpc.entityResolution.attach.mutate({ target, folderId: picker.value.folderId, fileIds: picker.value.fileIds })
    const name = target.kind === "record" ? target.key : `${target.name} = ${target.value}`
    toast.success(`${result.files} ${result.files === 1 ? "file" : "files"} linked to ${name}${result.recordCreated ? ` (${label.lower.value} created)` : ""}`)
    picker.value = null
    selected.value = []
    await refresh()
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    saving.value = false
  }
}

async function useCandidate(fileId: string, key: string) {
  try {
    await trpc.entityResolution.attach.mutate({ target: { kind: "record", key }, fileIds: [fileId] })
    toast.success(`Linked to ${key}. Your choice is kept and never changed by a rule again.`)
    await refresh()
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function createRecord(key: string) {
  try {
    await trpc.entityResolution.createRecord.mutate({ key })
    toast.success(`${label.singular.value} ${key} created. Fill its data on the next CSV import.`)
    await refresh()
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function detach(linkId: string) {
  try {
    await trpc.entityResolution.detach.mutate({ linkId })
    toast.success("Link removed")
    await refresh()
  } catch (error) {
    toast.error((error as Error).message)
  }
}

const notScanned = computed(() => status.value === "success" && !counts.value?.unmatched && !counts.value?.conflicts && !counts.value?.dangling && !folders.value?.length)
</script>

<template>
  <div v-if="status === 'pending'"><Loader :text="true" /></div>
  <div v-else class="admin-page admin-resource-page">
    <AdminPageHeader :description="`Files of a type related to ${label.lowerPlural.value} that no matching step could link, the ones where steps disagree, and links pointing to a ${label.lower.value} that does not exist.`" />
    <Tabs v-model="tab">
      <TabsList>
        <TabsTrigger value="folders">Folders <Badge variant="secondary" class="ml-2">{{ counts?.folders ?? 0 }}</Badge></TabsTrigger>
        <TabsTrigger value="files">Files <Badge variant="secondary" class="ml-2">{{ counts?.unmatched ?? 0 }}</Badge></TabsTrigger>
        <TabsTrigger value="conflicts">Conflicts <Badge variant="secondary" class="ml-2">{{ counts?.conflicts ?? 0 }}</Badge></TabsTrigger>
        <TabsTrigger value="dangling">Dangling <Badge variant="secondary" class="ml-2">{{ counts?.dangling ?? 0 }}</Badge></TabsTrigger>
      </TabsList>

      <TabsContent value="folders" class="mt-4">
        <p class="admin-form-note mb-4">Linking a folder links every file inside it and inside its subfolders, now and after each sync.</p>
        <div v-if="foldersStatus === 'pending'"><Loader /></div>
        <div v-else-if="!folders?.length" class="admin-empty dv-panel"><h2>{{ notScanned ? "No matching has run yet." : "Everything is matched." }}</h2></div>
        <Table v-else>
          <TableHeader><TableRow><TableHead>Folder</TableHead><TableHead>Asset type</TableHead><TableHead>Unmatched files</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="folder in folders" :key="folder.id">
              <TableCell><code>{{ folder.path }}</code></TableCell>
              <TableCell>{{ folder.type ?? "—" }}</TableCell>
              <TableCell>{{ folder.files }}</TableCell>
              <TableCell><Button variant="outline" size="sm" @click="attachFolder(folder)">Attach</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>

      <TabsContent value="files" class="mt-4">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <Input v-model="search" type="search" placeholder="Search file names" aria-label="Search file names" class="max-w-sm" />
          <Button v-if="selected.length" size="sm" @click="attachFiles(selected, `${selected.length} files`)">Attach {{ selected.length }} selected</Button>
        </div>
        <div v-if="filesStatus === 'pending'"><Loader /></div>
        <div v-else-if="!files?.files.length" class="admin-empty dv-panel"><h2>{{ search ? "No matching file." : "Everything is matched." }}</h2></div>
        <template v-else>
          <Table>
            <TableHeader><TableRow><TableHead class="w-8"><span class="sr-only">Select</span></TableHead><TableHead>File</TableHead><TableHead>Folder</TableHead><TableHead>Why</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="file in files.files" :key="file.id">
                <TableCell><Checkbox :model-value="selected.includes(file.id)" :aria-label="`Select ${file.name}`" @update:model-value="(checked) => toggle(file.id, checked)" /></TableCell>
                <TableCell>{{ file.name }}</TableCell>
                <TableCell><code>{{ file.path }}</code></TableCell>
                <TableCell class="admin-text-secondary">{{ file.reason }}</TableCell>
                <TableCell><Button variant="outline" size="sm" @click="attachFiles([file.id], file.name)">Attach</Button></TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div class="flex items-center gap-3 mt-4">
            <Button variant="outline" size="sm" :disabled="page === 1" @click="page--">Previous</Button>
            <span class="admin-text-secondary">Page {{ page }} of {{ Math.max(1, Math.ceil(files.total / 100)) }} · {{ files.total }} files</span>
            <Button variant="outline" size="sm" :disabled="page * 100 >= files.total" @click="page++">Next</Button>
          </div>
        </template>
      </TabsContent>

      <TabsContent value="conflicts" class="mt-4">
        <p class="admin-form-note mb-4">Two rules disagreed. Your choice is kept and never changed by a rule again.</p>
        <div v-if="conflictsStatus === 'pending'"><Loader /></div>
        <div v-else-if="!conflicts?.length" class="admin-empty dv-panel"><h2>No conflict.</h2></div>
        <Table v-else>
          <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Candidates</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="conflict in conflicts" :key="conflict.id">
              <TableCell>{{ conflict.name }}<p class="admin-text-secondary"><code>{{ conflict.path }}</code></p></TableCell>
              <TableCell>
                <div class="flex flex-wrap gap-2">
                  <Button v-for="candidate in conflict.candidates" :key="candidate.key + candidate.strategy" variant="outline" size="sm" :disabled="!candidate.exists" :title="candidate.exists ? undefined : `No ${label.lower.value} with this key`" @click="useCandidate(conflict.id, candidate.key)">
                    Use {{ candidate.key }} <span class="admin-text-secondary ml-1">({{ strategyLabel[candidate.strategy] ?? candidate.strategy }})</span>
                  </Button>
                </div>
              </TableCell>
              <TableCell><Button variant="ghost" size="sm" @click="attachFiles([conflict.id], conflict.name)">Other</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>

      <TabsContent value="dangling" class="mt-4">
        <p class="admin-form-note mb-4">These links point to a key or a value no {{ label.lower.value }} has. The key is kept: importing the {{ label.lower.value }} attaches the files on the next pass.</p>
        <div v-if="danglingStatus === 'pending'"><Loader /></div>
        <div v-else-if="!dangling?.length" class="admin-empty dv-panel"><h2>No dangling link.</h2></div>
        <Table v-else>
          <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Points to</TableHead><TableHead>Made by</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="link in dangling" :key="link.id">
              <TableCell>{{ link.name }}<p class="admin-text-secondary"><code>{{ link.path }}</code></p></TableCell>
              <TableCell>{{ link.targetKind === "record" ? link.recordKey : `${link.attributeName} = ${link.attributeValue}` }}</TableCell>
              <TableCell>{{ strategyLabel[link.strategy] ?? link.strategy }}</TableCell>
              <TableCell>
                <div class="flex gap-2">
                  <Button v-if="link.targetKind === 'record' && link.recordKey" variant="outline" size="sm" @click="createRecord(link.recordKey)">Create {{ label.lower.value }} {{ link.recordKey }}</Button>
                  <Button v-if="link.manual" variant="ghost" size="sm" @click="detach(link.id)">Detach</Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
    <RecordPicker :open="!!picker" :title="picker?.title ?? ''" :description="picker?.description ?? ''" :saving="saving" @update:open="(open) => !open && (picker = null)" @confirm="confirm" />
  </div>
</template>
