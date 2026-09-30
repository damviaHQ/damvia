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
import LinkFolderDialog from "@/components/admin/LinkFolderDialog.vue"
import RecordPicker, { type RecordTarget } from "@/components/admin/RecordPicker.vue"
import Loader from "@/components/Loader.vue"
import FieldEditorDialog from "@/components/records/FieldEditorDialog.vue"
import RecordPanel from "@/components/records/RecordPanel.vue"
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
import { useRecordFields } from "@/composables/useRecordFields"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { FolderPlus } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const label = useRecordLabel()
// To review: the four lists of what matching could not settle. Linked by hand:
// the links an admin made. The Link to products page shows one or the other.
const props = defineProps<{ section: "review" | "manual" }>()
const tab = ref(props.section === "manual" ? "manual" : "folders")
watch(() => props.section, (section) => { tab.value = section === "manual" ? "manual" : "folders" })
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
const { data: manualLinks, status: manualStatus } = useQuery({ queryKey: ["entity-resolution", "manual"], queryFn: () => trpc.entityResolution.manualLinks.query() })
// The folder dialog opens empty from Linked by hand, or on one folder of the list.
const folderDialog = ref<{ folderId: string | null } | null>(null)

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

function attachFolder(folder: { id: string }) {
  folderDialog.value = { folderId: folder.id }
}
function attachFiles(ids: string[], name: string) {
  picker.value = { title: `Link ${name}`, description: `${ids.length} ${ids.length === 1 ? "file is" : "files are"} linked by hand. No matching rule changes this link later.`, fileIds: ids, name }
}

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ["entity-resolution"] })
    await queryClient.invalidateQueries({ queryKey: ["enrichment"] })
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

async function confirmFolder({ folderId, target }: { folderId: string; target: RecordTarget }) {
  saving.value = true
  try {
    const result = await trpc.entityResolution.attach.mutate({ target, folderId })
    const name = target.kind === "record" ? target.key : `${target.name} = ${target.value}`
    toast.success(`${result.files} ${result.files === 1 ? "file" : "files"} linked to ${name}${result.recordCreated ? ` (${label.lower.value} created)` : ""}`)
    folderDialog.value = null
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

// Quick create makes the product with its key only; Create and fill opens the
// product card, and nothing exists until Save.
async function quickCreate(key: string) {
  try {
    await trpc.entityResolution.createRecord.mutate({ key })
    toast.success(`${label.singular.value} ${key} created. Fill its data later in ${label.plural.value}.`)
    await refresh()
  } catch (error) {
    toast.error((error as Error).message)
  }
}

const draftKey = ref<string | null>(null)
const drafting = computed(() => draftKey.value !== null)
const { allFields, addOption } = useRecordFields(drafting)
const { data: tables } = useQuery({ queryKey: ["records", "tables"], queryFn: () => trpc.recordTable.list.query(), enabled: drafting })
const draftTable = computed(() => tables.value?.[0] ?? null)
const draftFields = computed(() => {
  const byId = new Map(allFields.value.map((field) => [field.id, field]))
  return (draftTable.value?.fieldIds ?? []).map((id) => byId.get(id)).filter((field) => !!field)
})
const fieldDialog = ref(false)
async function createFilled(key: string, values: Record<string, string>) {
  const created = await trpc.record.create.mutate({ recordKey: key, values, tableId: draftTable.value?.id, source: "unmatched" })
  draftKey.value = null
  toast.success(`${label.singular.value} ${created.recordKey} created`)
  await queryClient.invalidateQueries({ queryKey: ["records"] })
  await refresh()
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

async function detachFolder(attachmentId: string) {
  try {
    await trpc.entityResolution.detach.mutate({ attachmentId })
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
  <div v-else>
    <Tabs v-model="tab">
      <TabsList v-if="section === 'review'">
        <TabsTrigger value="folders">Folders without a {{ label.lower.value }} <Badge variant="secondary" class="ml-2">{{ counts?.folders ?? 0 }}</Badge></TabsTrigger>
        <TabsTrigger value="files">Pictures without a {{ label.lower.value }} <Badge variant="secondary" class="ml-2">{{ counts?.unmatched ?? 0 }}</Badge></TabsTrigger>
        <TabsTrigger value="conflicts">Several {{ label.lowerPlural.value }} found <Badge variant="secondary" class="ml-2">{{ counts?.conflicts ?? 0 }}</Badge></TabsTrigger>
        <TabsTrigger value="dangling">Missing {{ label.lowerPlural.value }} <Badge variant="secondary" class="ml-2">{{ counts?.dangling ?? 0 }}</Badge></TabsTrigger>
      </TabsList>

      <TabsContent v-if="section === 'review'" value="folders" class="mt-4">
        <p class="admin-form-note mb-4">Folders holding {{ label.lower.value }} pictures that no rule could link. Linking a folder links every file inside it and inside its subfolders, now and after each sync.</p>
        <div v-if="foldersStatus === 'pending'"><Loader /></div>
        <div v-else-if="!folders?.length" class="admin-empty dv-panel"><h2>{{ notScanned ? "No matching has run yet." : `Every ${label.lower.value} picture has its ${label.lower.value}.` }}</h2></div>
        <Table v-else>
          <TableHeader><TableRow><TableHead>Folder</TableHead><TableHead>Asset type</TableHead><TableHead>Pictures without a {{ label.lower.value }}</TableHead><TableHead></TableHead></TableRow></TableHeader>
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

      <TabsContent v-if="section === 'review'" value="files" class="mt-4">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <Input v-model="search" type="search" placeholder="Search file names" aria-label="Search file names" class="max-w-sm" />
          <Button v-if="selected.length" size="sm" @click="attachFiles(selected, `${selected.length} files`)">Attach {{ selected.length }} selected</Button>
        </div>
        <div v-if="filesStatus === 'pending'"><Loader /></div>
        <div v-else-if="!files?.files.length" class="admin-empty dv-panel"><h2>{{ search ? "No matching file." : `Every ${label.lower.value} picture has its ${label.lower.value}.` }}</h2></div>
        <template v-else>
          <Table>
            <TableHeader><TableRow><TableHead class="w-8"><span class="sr-only">Select</span></TableHead><TableHead>File</TableHead><TableHead>Folder</TableHead><TableHead>Why</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="file in files.files" :key="file.id">
                <TableCell><Checkbox :model-value="selected.includes(file.id)" :aria-label="`Select ${file.name}`" @update:model-value="(checked) => toggle(file.id, checked)" /></TableCell>
                <TableCell>{{ file.name }}</TableCell>
                <TableCell><code>{{ file.path }}</code></TableCell>
                <TableCell class="admin-text-secondary">{{ file.reason }}<p v-if="file.suggestion">{{ file.suggestionField }} says <strong>{{ file.suggestion }}</strong></p></TableCell>
                <TableCell>
                  <div class="flex gap-2">
                    <Button v-if="file.suggestion" size="sm" @click="useCandidate(file.id, file.suggestion)">Accept</Button>
                    <Button variant="outline" size="sm" @click="attachFiles([file.id], file.name)">Attach</Button>
                  </div>
                </TableCell>
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

      <TabsContent v-if="section === 'review'" value="conflicts" class="mt-4">
        <p class="admin-form-note mb-4">Two rules found a different {{ label.lower.value }} for the same file. Your choice is kept and never changed by a rule again.</p>
        <div v-if="conflictsStatus === 'pending'"><Loader /></div>
        <div v-else-if="!conflicts?.length" class="admin-empty dv-panel"><h2>No file with several {{ label.lowerPlural.value }}.</h2></div>
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

      <TabsContent v-if="section === 'review'" value="dangling" class="mt-4">
        <p class="admin-form-note mb-4">These files name a {{ label.lower.value }} that is not imported yet. The key is kept: importing the {{ label.lower.value }} attaches the files on the next pass.</p>
        <div v-if="danglingStatus === 'pending'"><Loader /></div>
        <div v-else-if="!dangling?.length" class="admin-empty dv-panel"><h2>Every {{ label.lower.value }} found is imported.</h2></div>
        <Table v-else>
          <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Points to</TableHead><TableHead>Made by</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="link in dangling" :key="link.id">
              <TableCell>{{ link.name }}<p class="admin-text-secondary"><code>{{ link.path }}</code></p></TableCell>
              <TableCell>{{ link.targetKind === "record" ? link.recordKey : `${link.attributeName} = ${link.attributeValue}` }}</TableCell>
              <TableCell>{{ strategyLabel[link.strategy] ?? link.strategy }}</TableCell>
              <TableCell>
                <div class="flex gap-2">
                  <template v-if="link.targetKind === 'record' && link.recordKey">
                    <Button variant="outline" size="sm" @click="draftKey = link.recordKey">Create and fill</Button>
                    <Button variant="ghost" size="sm" :title="`Create ${link.recordKey} with its key only`" @click="quickCreate(link.recordKey)">Quick create</Button>
                  </template>
                  <Button v-if="link.manual" variant="ghost" size="sm" @click="detach(link.id)">Detach</Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>

      <TabsContent v-if="section === 'manual'" value="manual" class="mt-4">
        <p class="admin-form-note mb-4">Link a folder when all its files are about one {{ label.lower.value }}, or one range, and no rule can read it from their names: a shoot, a bonus content pack, a campaign. A folder or a file linked by hand keeps its {{ label.lower.value }} whatever the matching rules find.</p>
        <div class="mb-4"><Button @click="folderDialog = { folderId: null }"><FolderPlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />Link a folder</Button></div>
        <div v-if="manualStatus === 'pending'"><Loader /></div>
        <div v-else-if="!manualLinks?.length" class="admin-empty dv-panel"><h2>Nothing linked by hand.</h2><p>Files are linked by the matching rules of their asset type.</p></div>
        <Table v-else>
          <TableHeader><TableRow><TableHead>Folder or file</TableHead><TableHead>Linked to</TableHead><TableHead>Files</TableHead><TableHead>By</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="link in manualLinks" :key="link.id">
              <TableCell>{{ link.kind === "folder" ? "Folder" : "File" }} {{ link.name }}<p class="admin-text-secondary"><code>{{ link.path }}</code></p></TableCell>
              <TableCell>{{ link.targetKind === "record" ? link.recordKey : `${link.attributeName} = ${link.attributeValue}` }}</TableCell>
              <TableCell>{{ link.files }}</TableCell>
              <TableCell>{{ link.createdBy ?? "—" }}</TableCell>
              <TableCell><Button variant="ghost" size="sm" @click="link.kind === 'folder' ? detachFolder(link.id) : detach(link.id)">Detach</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
    <RecordPanel :record-id="null" tab="fields" :fields="draftFields" :all-fields="allFields" :record-label="label.lower.value"
      :save="async () => {}" :add-option="addOption" :remove="async () => {}" :draft="draftKey ? { recordKey: draftKey } : null" :create="createFilled"
      @close="draftKey = null" @add-field="fieldDialog = true" />
    <FieldEditorDialog v-model:open="fieldDialog" :field="null" :table-id="draftTable?.id" />
    <LinkFolderDialog :open="!!folderDialog" :folder-id="folderDialog?.folderId" :saving="saving" @update:open="(open) => !open && (folderDialog = null)" @confirm="confirmFolder" />
    <RecordPicker :open="!!picker" :title="picker?.title ?? ''" :description="picker?.description ?? ''" :saving="saving" @update:open="(open) => !open && (picker = null)" @confirm="confirm" />
  </div>
</template>
