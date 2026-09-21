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
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import Loader from "@/components/Loader.vue"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { trpc, type RouterOutput } from "@/services/server"
import { fieldLabel, formatRecordValue } from "@/utils/recordValues"
import { useQuery } from "@tanstack/vue-query"
import { Trash2 } from "@lucide/vue"
import { computed, ref, watch } from "vue"
import RecordFieldInput from "./RecordFieldInput.vue"
import type { GridField } from "./RecordsGrid.vue"

type Detail = RouterOutput["record"]["get"]
type HistoryItem = RouterOutput["record"]["history"]["items"][number]
type DirectFile = Detail["files"]["direct"][number]
export type PanelTab = "fields" | "files" | "history"

const props = defineProps<{
  recordId: string | null
  tab: PanelTab
  fields: GridField[]
  recordLabel: string
  save: (recordId: string, field: GridField, value: string) => Promise<void>
  addOption: (field: GridField, option: string) => Promise<void>
  remove: (recordId: string) => Promise<void>
}>()
const emit = defineEmits<{ close: [], "update:tab": [tab: PanelTab] }>()

const { data: record, status, error } = useQuery({
  queryKey: computed(() => ["records", "get", props.recordId]),
  queryFn: () => trpc.record.get.query(props.recordId!),
  enabled: computed(() => !!props.recordId),
})

const history = ref<HistoryItem[]>([])
const historyMore = ref(false)
const historyLoading = ref(false)
async function loadHistory(reset = false) {
  if (!props.recordId) return
  historyLoading.value = true
  try {
    const before = reset ? undefined : history.value.at(-1)?.id
    const page = await trpc.record.history.query({ id: props.recordId, before, limit: 30 })
    history.value = reset ? page.items : [...history.value, ...page.items]
    historyMore.value = page.hasMore
  } finally {
    historyLoading.value = false
  }
}
watch(() => [props.recordId, props.tab, record.value?.updatedAt], () => {
  if (props.recordId && props.tab === "history") loadHistory(true)
}, { immediate: true })

const filled = computed(() => props.fields.filter((field) => (record.value?.metaData[field.name] ?? "") !== "").length)
const confirmRemove = ref(false)
const removing = ref(false)
const removeError = ref("")

async function removeRecord() {
  if (!props.recordId) return
  removing.value = true
  removeError.value = ""
  try {
    await props.remove(props.recordId)
    confirmRemove.value = false
    emit("close")
  } catch (failure) {
    removeError.value = (failure as Error).message
  } finally {
    removing.value = false
  }
}

function provenance(file: DirectFile) {
  const date = file.createdAt ? new Date(file.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""
  if (file.strategy === "filename_regex") return file.pattern ? `file name, ${file.pattern}` : "file name"
  if (file.strategy === "folder_regex") return file.pattern ? `folder path, ${file.pattern}` : "folder path"
  if (file.strategy === "manual_folder") return `folder ${file.sourcePath ?? ""}`
  if (file.strategy === "manual_file") return file.createdBy ? `set by hand by ${file.createdBy} on ${date}` : "set by hand"
  if (file.strategy === "csv") return "CSV mapping"
  if (file.strategy === "metadata") return "file metadata"
  if (file.strategy === "legacy") return "file name, PRODUCT_MATCHING_REGEX job"
  return file.strategy
}

const SOURCES: Record<string, string> = { grid: "in the grid", panel: "on the card", bulk: "in bulk", csv: "by CSV import", unmatched: "from Unmatched", attribute: "by removing a field" }
const labelOf = (name: string) => {
  const field = props.fields.find((item) => item.name === name)
  return field ? fieldLabel(field) : name
}
const fieldOf = (name: string) => props.fields.find((item) => item.name === name)
function describe(item: HistoryItem) {
  const verb = item.action === "create" ? "Created" : item.action === "delete" ? "Deleted" : "Changed"
  return `${verb} ${SOURCES[item.source] ?? ""}`.trim()
}
function when(value: string | Date) {
  return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
</script>

<template>
  <Sheet :open="!!recordId" @update:open="(open) => !open && emit('close')">
    <SheetContent class="record-panel">
      <template v-if="status === 'pending' || status === 'error'">
        <SheetTitle class="sr-only">{{ recordLabel }}</SheetTitle>
        <SheetDescription class="sr-only">{{ status === 'pending' ? 'Loading' : 'Could not load' }}</SheetDescription>
      </template>
      <Loader v-if="status === 'pending'" />
      <p v-else-if="status === 'error'" role="alert" class="admin-form-error p-6">{{ error?.message }}</p>
      <template v-else-if="record">
        <header class="record-panel-header">
          <img :src="record.thumbnailURL ?? thumbnailPlaceholder" alt="" class="record-panel-picture" />
          <div class="min-w-0">
            <SheetTitle class="truncate">{{ record.recordKey }}</SheetTitle>
            <SheetDescription>
              {{ filled }} of {{ fields.length }} fields filled · {{ record.fileCount }} {{ record.fileCount === 1 ? "file" : "files" }} · updated {{ when(record.updatedAt) }}
            </SheetDescription>
          </div>
        </header>
        <Tabs :model-value="tab" class="record-panel-tabs" @update:model-value="(value) => emit('update:tab', value as PanelTab)">
          <TabsList>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="files">Files ({{ record.fileCount }})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="fields" class="record-panel-body">
            <p v-if="!fields.length" class="admin-text-secondary">No field yet. Add one from the columns menu or the Fields screen.</p>
            <div v-for="field in fields" :key="field.id" class="record-panel-field">
              <label :for="`panel-${field.id}`">{{ fieldLabel(field) }}</label>
              <RecordFieldInput :id="`panel-${field.id}`" :field="field" :model-value="record.metaData[field.name] ?? ''"
                :save="(value) => save(record!.id, field, value)" :add-option="(option) => addOption(field, option)" />
            </div>
          </TabsContent>
          <TabsContent value="files" class="record-panel-body">
            <p v-if="!record.files.direct.length && !record.files.range.length" class="admin-text-secondary">
              No file is linked to this {{ recordLabel }} yet. Files link through the matching steps, or by hand from
              <router-link :to="{ name: 'admin-unmatched' }" class="underline">Unmatched</router-link>.
            </p>
            <ul v-if="record.files.direct.length" class="record-panel-files">
              <li v-for="file in record.files.direct" :key="file.id + file.strategy">
                <img :src="file.thumbnailURL ?? thumbnailPlaceholder" alt="" loading="lazy" />
                <div class="min-w-0">
                  <strong class="block truncate" :title="file.name">{{ file.name }}</strong>
                  <span v-if="file.isPrimary && file.status === 'active'" class="record-chip">Primary</span>
                  <span class="admin-text-secondary block truncate" :title="file.path">{{ file.path }}</span>
                  <span class="admin-text-secondary block">{{ provenance(file) }}<template v-if="file.status === 'dangling'"> · waiting for the {{ recordLabel }}</template></span>
                </div>
              </li>
            </ul>
            <template v-if="record.files.range.length">
              <h3 class="record-panel-subheading">Covering the range</h3>
              <ul class="record-panel-files">
                <li v-for="file in record.files.range" :key="file.id + file.attributeValue">
                  <img :src="file.thumbnailURL ?? thumbnailPlaceholder" alt="" loading="lazy" />
                  <div class="min-w-0">
                    <strong class="block truncate" :title="file.name">{{ file.name }}</strong>
                    <span class="admin-text-secondary block">{{ labelOf(file.attributeName) }} = {{ file.attributeValue }}</span>
                  </div>
                </li>
              </ul>
            </template>
          </TabsContent>
          <TabsContent value="history" class="record-panel-body">
            <Loader v-if="historyLoading && !history.length" />
            <p v-else-if="!history.length" class="admin-text-secondary">No change recorded yet. Changes made before this screen existed are not listed.</p>
            <ol class="record-history">
              <li v-for="item in history" :key="item.id">
                <p><strong>{{ describe(item) }}</strong> <span class="admin-text-secondary">by {{ item.changedBy?.name ?? "a removed user" }} · {{ when(item.createdAt) }}</span></p>
                <ul v-if="item.action !== 'delete'">
                  <li v-for="(change, name) in item.changes" :key="name">
                    <span class="admin-text-secondary">{{ labelOf(String(name)) }}</span>
                    <span v-if="change.old" class="record-history-old">{{ formatRecordValue(fieldOf(String(name)), change.old) }}</span>
                    <span v-if="change.old" aria-hidden="true">›</span><span v-if="change.old" class="sr-only">became</span>
                    <span>{{ change.new ? formatRecordValue(fieldOf(String(name)), change.new) : "empty" }}</span>
                  </li>
                </ul>
              </li>
            </ol>
            <Button v-if="historyMore" variant="outline" :disabled="historyLoading" @click="loadHistory()">Show older changes</Button>
          </TabsContent>
        </Tabs>
        <footer class="record-panel-footer">
          <Button variant="ghost" class="text-destructive" @click="confirmRemove = true"><Trash2 class="size-4" />Delete {{ recordLabel }}</Button>
        </footer>
      </template>
    </SheetContent>
  </Sheet>
  <AlertDialog :open="confirmRemove" @update:open="(open) => { if (!removing) confirmRemove = open }">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {{ record?.recordKey }}?</AlertDialogTitle>
        <AlertDialogDescription>Its values are kept in the history. Files linked to its key stay linked and wait, listed as dangling, until a {{ recordLabel }} with this key exists again.</AlertDialogDescription>
      </AlertDialogHeader>
      <p v-if="removeError" role="alert" class="admin-form-error">{{ removeError }}</p>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="removing">Cancel</AlertDialogCancel>
        <Button variant="destructive" :disabled="removing" @click="removeRecord">{{ removing ? "Deleting…" : "Delete" }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
