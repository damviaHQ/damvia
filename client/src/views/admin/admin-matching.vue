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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { extractErrors, RouterInput, RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, GripVertical, Trash2 } from "@lucide/vue"
import type { AcceptableValue } from "reka-ui"
import { computed, ref, watch } from "vue"
import Treeselect from "vue3-treeselect-ts"
import Draggable from "vuedraggable"

type StepInput = RouterInput["resolverStep"]["save"]["steps"][number]
type Draft = StepInput & { key: string; lastError?: string | null }
type PreviewRow = RouterOutput["resolverStep"]["preview"][number]

const toast = useGlobalToast()
const queryClient = useQueryClient()
const label = useRecordLabel()
const { data, status, error } = useQuery({ queryKey: ["resolver-steps"], queryFn: () => trpc.resolverStep.list.query() })
const { data: folderTree } = useQuery({ queryKey: ["asset", "tree"], queryFn: () => trpc.asset.tree.query() })

const selectedTypeId = ref<string | null>(null)
const types = computed(() => [...(data.value?.types ?? [])].sort((a, b) => Number(b.isRelatedToRecords) - Number(a.isRelatedToRecords) || a.name.localeCompare(b.name)))
const selectedType = computed(() => types.value.find((type) => type.id === selectedTypeId.value) ?? null)
watch(types, () => {
  if (!selectedTypeId.value || !selectedType.value) selectedTypeId.value = types.value.find((type) => type.isRelatedToRecords)?.id ?? types.value[0]?.id ?? null
}, { immediate: true })

const previewFolderId = ref<string | null>(null)
const previewRows = ref<PreviewRow[] | null>(null)
const previewError = ref("")
const previewing = ref(false)
let sequence = 0
const drafts = ref<Draft[]>([])
watch(selectedType, (type) => {
  drafts.value = (type?.steps ?? []).map((step) => ({ key: step.id, id: step.id, strategy: step.strategy as StepInput["strategy"], enabled: step.enabled, config: { ...step.config }, lastError: step.lastError }))
  previewRows.value = null
  previewError.value = ""
}, { immediate: true })
const dirty = computed(() => JSON.stringify(drafts.value.map(({ key, lastError, ...step }) => step)) !== JSON.stringify((selectedType.value?.steps ?? []).map((step) => ({ id: step.id, strategy: step.strategy, enabled: step.enabled, config: step.config }))))

const strategies = [
  { value: "filename_regex", label: "File name", help: "Applied to the file name without its folder. The first group in parentheses is the key." },
  { value: "folder_regex", label: "Folder path", help: "Applied to the folder path, for example ^/Dropbox/EVENTS/[^/]+/(EVT-\\d+) gives the key from the folder name." },
]
const strategyHelp = (value: string) => strategies.find((strategy) => strategy.value === value)?.help ?? ""

function addStep(strategy: StepInput["strategy"], pattern = "") {
  drafts.value.push({ key: `new-${sequence++}`, strategy, enabled: true, config: strategy === "folder_regex" ? { pattern, target: "record", keyGroup: 1 } : { pattern, keyGroup: 1 } })
}
function useLegacy() {
  drafts.value.unshift({ key: `new-${sequence++}`, strategy: "filename_regex", enabled: true, config: { pattern: data.value?.legacyPattern ?? "", keyGroup: 1, viewGroup: 2 } })
}
function onStrategy(step: Draft, value: AcceptableValue) {
  step.strategy = String(value) as StepInput["strategy"]
  step.config = step.strategy === "folder_regex" ? { pattern: step.config.pattern, target: "record", keyGroup: 1 } : { pattern: step.config.pattern, keyGroup: 1 }
}
function numberOrNull(value: string | number) {
  const parsed = parseInt(String(value), 10)
  return Number.isNaN(parsed) ? null : parsed
}
const generatedPattern = (step: Draft) =>
  step.strategy === "filename_regex" && !step.config.viewGroup && data.value?.generatedViewPart ? `${step.config.pattern ?? ""}${data.value.generatedViewPart}` : null

const payload = () => drafts.value.map(({ key, lastError, ...step }) => step)

async function runPreview() {
  if (!selectedType.value || !previewFolderId.value) return
  previewing.value = true
  previewError.value = ""
  try {
    previewRows.value = await trpc.resolverStep.preview.query({ assetTypeId: selectedType.value.id, folderId: previewFolderId.value, steps: payload() })
  } catch (err) {
    previewRows.value = null
    previewError.value = extractErrors(err as Error).message
  } finally {
    previewing.value = false
  }
}
const statusVariant = (value: string) => value === "matched" ? "secondary" : value === "conflict" || value === "dangling" ? "destructive" : "outline"

const saving = ref(false)
async function save() {
  if (!selectedType.value || saving.value) return
  saving.value = true
  try {
    const result = await trpc.resolverStep.save.mutate({ assetTypeId: selectedType.value.id, steps: payload() })
    await queryClient.invalidateQueries({ queryKey: ["resolver-steps"] })
    await queryClient.invalidateQueries({ queryKey: ["entity-resolution"] })
    toast.success(`Steps saved: ${result.applied.matched} files matched, ${result.applied.unmatched} unmatched, ${result.applied.conflicts} in conflict`)
  } catch (err) {
    toast.error(extractErrors(err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="status === 'pending'"><Loader :text="true" /></div>
  <div v-else-if="status === 'error'" class="admin-error" role="alert">{{ error?.message }}</div>
  <div v-else-if="data" class="admin-page admin-resource-page">
    <AdminPageHeader :description="`Say how a file finds the ${label.lower.value} it is about. Folder rules give a file its type; matching steps give it its ${label.lower.value}.`" />
    <p v-if="data.legacyEnabled && data.legacyPattern" class="admin-form-note mb-4">
      The old job still applies <code>PRODUCT_MATCHING_REGEX</code> every 5 minutes to files of types without steps. Once every type related to {{ label.lowerPlural.value }} has steps, set <code>ENABLE_LEGACY_PRODUCT_MATCHING=false</code> on the server.
    </p>
    <div class="matching-layout">
      <nav class="matching-types dv-panel" aria-label="Asset types">
        <button v-for="type in types" :key="type.id" type="button" class="matching-type" :class="{ 'is-selected': type.id === selectedTypeId }" :aria-current="type.id === selectedTypeId ? 'true' : undefined" @click="selectedTypeId = type.id">
          <strong>{{ type.name }}</strong>
          <span class="admin-text-secondary">{{ type.isRelatedToRecords ? `${type.steps.length} ${type.steps.length === 1 ? "step" : "steps"} · ${type.files} files` : `Not related to ${label.lowerPlural.value}` }}</span>
        </button>
        <p v-if="!types.length" class="admin-text-secondary p-3">No asset type yet.</p>
      </nav>

      <section v-if="selectedType" class="matching-steps" aria-labelledby="matching-steps-heading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="matching-steps-heading" class="admin-heading">{{ selectedType.name }}</h2>
          <div class="flex gap-2">
            <Button v-if="data.legacyPattern && !drafts.some((step) => step.strategy === 'filename_regex')" variant="outline" size="sm" @click="useLegacy">Use PRODUCT_MATCHING_REGEX</Button>
            <Button variant="outline" size="sm" @click="addStep('filename_regex')"><CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />File name step</Button>
            <Button variant="outline" size="sm" @click="addStep('folder_regex')"><CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />Folder path step</Button>
          </div>
        </div>
        <p v-if="!selectedType.isRelatedToRecords" class="admin-form-note">
          Files of this type are not matched: mark the type “Related to {{ label.lowerPlural.value }}” in Asset types first.
        </p>
        <p class="admin-text-secondary">Every step runs on every file. When two steps give a different {{ label.lower.value }}, the file is shown in Unmatched as a conflict, nothing is chosen for you. Folders and files linked by hand in Unmatched or in Assets always apply and win.</p>

        <div v-if="!drafts.length" class="admin-empty dv-panel">
          <h2>No matching steps.</h2>
          <p>Files of this type are not matched to {{ label.lowerPlural.value }}.</p>
        </div>
        <Draggable v-else v-model="drafts" item-key="key" handle=".matching-step__handle" class="flex flex-col gap-3">
          <template #item="{ element: step, index }">
            <article class="matching-step dv-panel" :aria-label="`Step ${index + 1}`">
              <div class="flex items-center gap-3">
                <button type="button" class="matching-step__handle" :aria-label="`Drag step ${index + 1}`"><GripVertical class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" /></button>
                <strong>Step {{ index + 1 }}</strong>
                <Select :model-value="step.strategy" @update:model-value="(value: AcceptableValue) => onStrategy(step, value)">
                  <SelectTrigger class="w-44" :aria-label="`Strategy of step ${index + 1}`"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem v-for="strategy in strategies" :key="strategy.value" :value="strategy.value">{{ strategy.label }}</SelectItem></SelectContent>
                </Select>
                <label class="flex items-center gap-2 ml-auto"><Checkbox v-model="step.enabled" />Enabled</label>
                <AlertDialog>
                  <AlertDialogTrigger as-child><Button variant="ghost" size="sm" :aria-label="`Remove step ${index + 1}`"><Trash2 class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this step?</AlertDialogTitle>
                      <AlertDialogDescription>{{ drafts.length === 1 ? `Files of this type will keep their current links until you save, then be unmatched.` : "The other steps keep running." }} Nothing changes until you save.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction @click="drafts.splice(index, 1)">Remove</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <p class="admin-text-secondary">{{ strategyHelp(step.strategy) }}</p>
              <div class="matching-step__fields">
                <div class="matching-step__field matching-step__field--wide">
                  <Label :for="`pattern-${step.key}`">Pattern</Label>
                  <Input :id="`pattern-${step.key}`" v-model="step.config.pattern" :placeholder="step.strategy === 'folder_regex' ? '/(EVT-\\d+) [^/]+$' : '^(EVT-\\d+)'" />
                </div>
                <template v-if="step.strategy === 'folder_regex'">
                  <div class="matching-step__field">
                    <Label :for="`target-${step.key}`">The group gives</Label>
                    <Select :model-value="step.config.target ?? 'record'" @update:model-value="(value: AcceptableValue) => { step.config.target = String(value) as 'record' | 'attribute' }">
                      <SelectTrigger :id="`target-${step.key}`"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="record">the {{ label.lower.value }} key</SelectItem>
                        <SelectItem value="attribute">the value of an attribute (a range)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div v-if="step.config.target === 'attribute'" class="matching-step__field">
                    <Label :for="`attribute-${step.key}`">Attribute</Label>
                    <Select :model-value="step.config.attributeName ?? ''" @update:model-value="(value: AcceptableValue) => { step.config.attributeName = String(value) }">
                      <SelectTrigger :id="`attribute-${step.key}`"><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent><SelectItem v-for="name in data.attributes" :key="name" :value="name">{{ name }}</SelectItem></SelectContent>
                    </Select>
                  </div>
                </template>
                <div class="matching-step__field matching-step__field--narrow">
                  <Label :for="`group-${step.key}`">Group</Label>
                  <Input v-if="step.strategy === 'folder_regex' && step.config.target === 'attribute'" :id="`group-${step.key}`" type="number" min="1" :model-value="step.config.valueGroup ?? 1" @update:model-value="(value) => { step.config.valueGroup = numberOrNull(value) ?? 1 }" />
                  <Input v-else :id="`group-${step.key}`" type="number" min="1" :model-value="step.config.keyGroup ?? 1" @update:model-value="(value) => { step.config.keyGroup = numberOrNull(value) ?? 1 }" />
                </div>
                <div v-if="step.strategy === 'filename_regex'" class="matching-step__field matching-step__field--narrow">
                  <Label :for="`view-${step.key}`">View group</Label>
                  <Input :id="`view-${step.key}`" type="number" min="1" placeholder="—" :model-value="step.config.viewGroup ?? ''" @update:model-value="(value) => { step.config.viewGroup = numberOrNull(value) }" />
                </div>
              </div>
              <p v-if="generatedPattern(step)" class="admin-text-secondary">Full pattern with the view part from Settings: <code>{{ generatedPattern(step) }}</code></p>
              <p v-if="step.lastError" class="admin-form-error">{{ step.lastError }}</p>
            </article>
          </template>
        </Draggable>

        <div class="flex flex-wrap items-center gap-3">
          <AlertDialog>
            <AlertDialogTrigger as-child><Button :disabled="saving || !dirty">{{ saving ? "Saving…" : "Save and re-run for this type" }}</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Re-run matching on {{ selectedType.files }} files?</AlertDialogTitle>
                <AlertDialogDescription>Links made by rules are recomputed. Links set by hand are kept. Nothing is written to Dropbox, OneDrive or Google Drive.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction @click="save">Save and re-run</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <span v-if="dirty" class="admin-text-secondary">Unsaved changes</span>
        </div>

        <section class="matching-preview dv-panel" aria-labelledby="matching-preview-heading">
          <h3 id="matching-preview-heading">Test on a folder</h3>
          <p class="admin-text-secondary">Runs the steps above, saved or not, on up to 40 files of a folder and its subfolders. Nothing is written.</p>
          <div class="flex flex-wrap items-end gap-3">
            <div class="min-w-72 flex-1">
              <treeselect v-model="previewFolderId" placeholder="Choose a folder" :options="folderTree ?? []" :normalizer="(node: any) => ({ id: node.id, label: node.name })" />
            </div>
            <Button variant="outline" :disabled="!previewFolderId || previewing" @click="runPreview">{{ previewing ? "Testing…" : "Test" }}</Button>
          </div>
          <p v-if="previewError" class="admin-form-error">{{ previewError }}</p>
          <p v-else-if="previewRows && !previewRows.length" class="admin-text-secondary">This folder has no files yet.</p>
          <Table v-else-if="previewRows">
            <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Key found</TableHead><TableHead>Result</TableHead><TableHead>Links</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="row in previewRows" :key="row.id">
                <TableCell>{{ row.name }}<span v-if="row.otherType" class="admin-text-secondary"> · other type</span></TableCell>
                <TableCell><code v-if="row.recordKey">{{ row.recordKey }}</code><span v-if="row.view" class="admin-text-secondary"> · view {{ row.view }}</span></TableCell>
                <TableCell><Badge :variant="statusVariant(row.status)">{{ row.status }}</Badge><p v-if="row.reason && row.status !== 'matched'" class="admin-text-secondary">{{ row.reason }}</p></TableCell>
                <TableCell class="admin-text-secondary">{{ row.links.map((link) => link.targetKind === 'record' ? `${link.recordKey} (${link.strategy})` : `${link.attributeName} = ${link.attributeValue} (${link.strategy})`).join(", ") }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
      </section>
    </div>
  </div>
</template>

<style scoped>
.matching-layout { display:grid; grid-template-columns:260px minmax(0,1fr); gap:24px; align-items:start; }
.matching-types { display:grid; gap:2px; padding:8px; }
.matching-type { display:grid; gap:2px; padding:10px 12px; text-align:left; border-radius:var(--dv-radius-data); }
.matching-type:hover { background:var(--dv-surface-canvas); }
.matching-type.is-selected { background:var(--dv-surface-canvas); box-shadow:inset 3px 0 0 var(--dv-color-primary, currentColor); }
.matching-type span { font-size:var(--dv-size-caption); }
.matching-steps { display:grid; gap:16px; min-width:0; }
.matching-step { display:grid; gap:12px; padding:16px 20px; }
.matching-step__handle { cursor:grab; color:var(--dv-text-secondary); }
.matching-step__fields { display:flex; flex-wrap:wrap; gap:12px; }
.matching-step__field { display:grid; gap:6px; min-width:180px; flex:1 1 200px; }
.matching-step__field--wide { flex:3 1 320px; }
.matching-step__field--narrow { flex:0 0 110px; min-width:110px; }
.matching-preview { display:grid; gap:12px; padding:20px; }
.matching-preview h3 { font-size:var(--dv-size-body); font-weight:600; }
code { overflow-wrap:anywhere; }
@media(max-width:900px) { .matching-layout { grid-template-columns:1fr; } }
</style>
