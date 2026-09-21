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
import AdminList from "@/components/admin/AdminList.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, PencilLine, RefreshCw, Trash2 } from "@lucide/vue"
import type { AcceptableValue } from "reka-ui"
import { computed, ref, watch } from "vue"

type Rule = RouterOutput["assetTypeRule"]["list"]["rules"][number]
type Preview = RouterOutput["assetTypeRule"]["preview"]

const toast = useGlobalToast()
const queryClient = useQueryClient()
const form = ref<{ id?: string; pattern: string; assetTypeId: string; enabled: boolean }>({ pattern: "", assetTypeId: "", enabled: true })
const errors = ref<Record<string, string>>({})
const modalState = ref<"creating" | "editing" | "closed">("closed")
const { status, data, error } = useQuery({
  queryKey: ["asset-type-rules"],
  queryFn: () => trpc.assetTypeRule.list.query(),
})
const { data: assetTypes } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})
const typeName = (id: string) => assetTypes.value?.find((type) => type.id === id)?.name ?? "Removed type"
const patternOf = (id: string) => data.value?.rules.find((rule) => rule.id === id)?.pattern ?? id
const notScanned = computed(() => status.value === "success" && data.value?.folderCount === 0)

const preview = ref<Preview | null>(null)
const previewError = ref("")
const previewing = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [form.value.pattern, form.value.assetTypeId, form.value.enabled, modalState.value], () => {
  clearTimeout(previewTimer)
  preview.value = null
  previewError.value = ""
  if (modalState.value === "closed" || !form.value.pattern || !form.value.assetTypeId) return
  previewing.value = true
  previewTimer = setTimeout(async () => {
    try {
      preview.value = await trpc.assetTypeRule.preview.query({ ...form.value })
    } catch (error) {
      previewError.value = extractErrors(error as Error).fieldErrors.pattern ?? (error as Error).message
    } finally {
      previewing.value = false
    }
  }, 400)
})

function describeGroup(group: Preview["changes"]["groups"][number]) {
  const type = group.assetTypeName ?? "no type"
  const origin = group.source === "manual" ? "set by hand, not changed" : group.source === "rule" ? `rule ${group.rulePattern ?? "removed"}` : group.source === "inherited" ? "inherited" : "untyped"
  return `${group.count} ${group.count === 1 ? "folder" : "folders"} currently ${type} (${origin})`
}

function openCreateModal() {
  form.value = { pattern: "", assetTypeId: "", enabled: true }
  errors.value = {}
  modalState.value = "creating"
}

function openEditModal(rule: Rule) {
  form.value = { id: rule.id, pattern: rule.pattern, assetTypeId: rule.assetTypeId, enabled: rule.enabled }
  errors.value = {}
  modalState.value = "editing"
}

function onAssetTypeChange(value: AcceptableValue) {
  form.value.assetTypeId = String(value)
}

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ["asset-type-rules"] })
  await queryClient.invalidateQueries({ queryKey: ["asset"] })
}

const saving = ref(false)
async function onModalSubmit(event: Event) {
  event.preventDefault()
  if (saving.value) return
  saving.value = true
  errors.value = {}
  try {
    const payload = { pattern: form.value.pattern, assetTypeId: form.value.assetTypeId, enabled: form.value.enabled }
    const result = modalState.value === "creating"
      ? await trpc.assetTypeRule.create.mutate(payload)
      : await trpc.assetTypeRule.update.mutate({ ...payload, id: form.value.id ?? "" })
    await refresh()
    toast.success(`Rule saved: ${result.applied.folders} folders and ${result.applied.files} files updated`)
    modalState.value = "closed"
  } catch (error) {
    const result = extractErrors(error as Error)
    errors.value = result.fieldErrors
    if (!Object.keys(result.fieldErrors).length) toast.error(result.message)
  } finally {
    saving.value = false
  }
}

async function reapply(rule: Rule) {
  try {
    const applied = await trpc.assetTypeRule.reresolve.mutate(rule.id)
    await refresh()
    toast.success(`${applied.folders} folders updated, ${applied.files} files updated`)
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function remove(id: string) {
  try {
    await trpc.assetTypeRule.remove.mutate(id)
    await refresh()
    toast.success("Rule removed!")
  } catch (error) {
    toast.error((error as Error).message)
  }
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="admin-error" role="alert">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="admin-page admin-resource-page">
    <AdminPageHeader description="Give an asset type to every folder whose path matches a pattern. The rule that starts deepest wins, and a type set by hand always wins on its own folder.">
      <Button type="button" variant="default" @click="openCreateModal" class="dv-button dv-button--primary">
        <CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
        Add folder rule
      </Button>
    </AdminPageHeader>
    <p v-if="notScanned" class="admin-form-note" role="status">No folder has been synchronised yet. Rules are applied after each sync, every 5 minutes.</p>
    <div v-if="!data?.rules.length" class="admin-empty">
      <h2>No rules yet</h2>
      <p>Types set by hand and inheritance keep working without rules.</p>
    </div>
    <AdminList v-else :items="data?.rules" :fields="['pattern']" label="Folder rules" v-slot="{ items }">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pattern</TableHead>
          <TableHead>Asset type</TableHead>
          <TableHead>Enabled</TableHead>
          <TableHead>Folders</TableHead>
          <TableHead>Examples</TableHead>
          <TableHead>Overlaps with</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="rule in items" :key="rule.id">
          <TableCell>
            <code>{{ rule.pattern }}</code>
            <p v-if="rule.lastError" class="admin-form-error">{{ rule.lastError }}</p>
          </TableCell>
          <TableCell>{{ typeName(rule.assetTypeId) }}</TableCell>
          <TableCell>{{ rule.enabled ? "Yes" : "No" }}</TableCell>
          <TableCell>{{ notScanned ? "–" : rule.folders }}</TableCell>
          <TableCell>
            <TooltipProvider v-if="rule.examples.length">
              <Tooltip>
                <TooltipTrigger as-child>
                  <ul class="folder-rule-examples">
                    <li v-for="path in rule.examples.slice(0, 3)" :key="path">{{ path }}</li>
                  </ul>
                </TooltipTrigger>
                <TooltipContent>
                  <ul class="folder-rule-examples">
                    <li v-for="path in rule.examples" :key="path">{{ path }}</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
          <TableCell>
            <ul v-if="rule.overlaps.length" class="folder-rule-examples">
              <li v-for="id in rule.overlaps" :key="id"><code>{{ patternOf(id) }}</code></li>
            </ul>
          </TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" @click="openEditModal(rule)">
                <PencilLine class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] mr-2" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button variant="ghost" size="sm">
                    <RefreshCw class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] mr-2" />
                    Re-apply
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Re-apply this rule to {{ rule.folders }} {{ rule.folders === 1 ? "folder" : "folders" }}?</AlertDialogTitle>
                    <AlertDialogDescription>The folders matched by this rule, the folders it used to type and their subfolders get their type again, with their files. Nothing is written to Dropbox, OneDrive or Google Drive.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction @click="reapply(rule)">Re-apply</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button variant="ghost" size="sm">
                    <Trash2 class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] mr-2" />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to remove this rule?</AlertDialogTitle>
                    <AlertDialogDescription>Folders keep their current type until the next re-apply or sync. Nothing is written to cloud storage.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction @click="remove(rule.id)">Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    </AdminList>
  </div>
  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && !saving && (modalState = 'closed')">
    <DialogContent class="flex flex-col">
      <form :aria-busy="saving" @submit.prevent="onModalSubmit" class="admin-form">
        <DialogHeader>
          <DialogTitle>{{ modalState === "creating" ? "Create" : "Edit" }} folder rule</DialogTitle>
          <DialogDescription>Saving applies the rule right away. Nothing is written to Dropbox, OneDrive or Google Drive.</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-5 min-w-0">
          <FieldGroup>
            <Label for="pattern">Pattern *</Label>
            <Input id="pattern" v-model="form.pattern" placeholder="^/DIGITAL PACK/.*/PACKSHOTS" :aria-invalid="!!errors.pattern" aria-describedby="pattern-help pattern-error" />
            <p id="pattern-help" class="text-body admin-text-secondary">A regular expression tested against the folder path, for example <code>^/DIGITAL PACK/.*/PACKSHOTS</code>. Case does not matter.</p>
            <p v-if="errors.pattern" id="pattern-error" class="admin-form-error">{{ errors.pattern }}</p>
          </FieldGroup>
          <FieldGroup>
            <Label for="assetTypeId">Asset type *</Label>
            <Select v-model="form.assetTypeId" @update:modelValue="onAssetTypeChange">
              <SelectTrigger id="assetTypeId" aria-describedby="asset-type-help">
                <SelectValue placeholder="Select asset type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="type in assetTypes" :key="type.id" :value="type.id">{{ type.name }}</SelectItem>
              </SelectContent>
            </Select>
            <p id="asset-type-help" class="text-body admin-text-secondary">The type given to every folder matched by this pattern, and to their subfolders unless a deeper rule or a hand-set type says otherwise.</p>
            <p v-if="errors.assetTypeId" class="admin-form-error">{{ errors.assetTypeId }}</p>
          </FieldGroup>
          <div class="flex items-center space-x-2">
            <Checkbox id="enabled" v-model="form.enabled" />
            <Label for="enabled">Enabled</Label>
          </div>
          <p class="text-body admin-text-secondary">Disabled rules are kept but not applied.</p>
          <div class="admin-form-note" role="status" aria-live="polite">
            <template v-if="previewing">Checking the folders…</template>
            <template v-else-if="previewError">{{ previewError }}</template>
            <template v-else-if="preview">
              <p>Matches {{ preview.matches }} {{ preview.matches === 1 ? "folder" : "folders" }}<template v-if="preview.examples.length">: {{ preview.examples.slice(0, 3).join(", ") }}</template></p>
              <ul v-if="preview.changes.groups.length" class="folder-rule-examples">
                <li v-for="group in preview.changes.groups" :key="describeGroup(group)">{{ describeGroup(group) }}</li>
              </ul>
            </template>
            <template v-else>Enter a pattern and pick a type to see what would change.</template>
          </div>
        </div>
        <DialogFooter class="items-center">
          <DialogClose as-child><Button type="button" variant="outline" :disabled="saving">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="saving || form.pattern === '' || form.assetTypeId === ''">
            <template v-if="preview">Save and re-apply to {{ preview.changes.folders }} {{ preview.changes.folders === 1 ? "folder" : "folders" }}</template>
            <template v-else>{{ modalState === "creating" ? "Create" : "Save" }}</template>
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.folder-rule-examples { display:grid; gap:2px; font-size:var(--dv-size-caption); }
</style>
