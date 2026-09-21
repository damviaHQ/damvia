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
import CollectionModalDownloadMulti from "@/components/collection/CollectionModalDownloadMulti.vue"
import Loader from "@/components/Loader.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { getFileExtension } from "@/utils/fileExtention"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref, watch } from "vue"

const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ "update:modelValue": [string | null] }>()
const toast = useGlobalToast()
const store = useGlobalStore()
const queryClient = useQueryClient()
const isAdmin = computed(() => store.user?.role === "admin")

const { data: group, status, error } = useQuery({
  queryKey: computed(() => ["variant-group", props.modelValue]),
  queryFn: () => trpc.variantGroup.findById.query(props.modelValue!),
  enabled: computed(() => !!props.modelValue),
  retry: false,
})
// A group reduced to one file by the last sync is gone: the panel closes and
// the file shows as a normal card.
watch(error, (value) => {
  if (value && props.modelValue) {
    toast.info("This group no longer exists; its file shows on its own.")
    emit("update:modelValue", null)
  }
})

const statusLabel: Record<string, string> = { up_to_date: "Ready", creating: "Processing", outdated: "Updating", pending_deletion: "Being removed" }
const editing = ref(false)
const selected = ref<string[]>([])
watch(() => props.modelValue, () => { editing.value = false; selected.value = [] })
const coverOverride = computed(() => group.value?.overrides.find((override) => override.kind === "cover"))
const forceOverride = computed(() => group.value?.overrides.find((override) => override.kind === "force_group"))

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ["variant-group"] })
  await queryClient.invalidateQueries({ queryKey: ["search"] })
}
async function act(run: () => Promise<unknown>, message: string) {
  try {
    await run()
    toast.success(message)
    selected.value = []
    await refresh()
  } catch (err) {
    toast.error(extractErrors(err as Error).message)
  }
}
const selectedNames = computed(() => group.value?.members.filter((member) => selected.value.includes(member.assetFileId)).map((member) => member.name).join(", ") ?? "")
function split() {
  if (confirm(`Make a new group of: ${selectedNames.value}?`)) act(() => trpc.variantGroup.forceGroup.mutate({ assetFileIds: selected.value }), "Group split. Nothing is written to Dropbox, OneDrive or Google Drive.")
}
function exclude() {
  if (confirm(`Never group again: ${selectedNames.value}?`)) act(() => trpc.variantGroup.exclude.mutate({ assetFileIds: selected.value }), "Excluded from grouping")
}
function setCover() {
  if (group.value && confirm(`Use ${selectedNames.value} as the cover?`)) act(() => trpc.variantGroup.setCover.mutate({ groupId: group.value!.id, assetFileId: selected.value[0] }), "Cover set")
}
async function undo(overrideId: string) {
  await act(() => trpc.variantGroup.undoOverride.mutate(overrideId), "Back to the computed group")
}
async function renameAxis(axisId: string, name: string) {
  await act(() => trpc.variantAxis.rename.mutate({ id: axisId, name: name.trim() || null }), "Axis renamed everywhere")
}

// Download all goes through the usual download dialog, with the members as the
// selection; the server checks each file again.
const downloadOpen = ref(false)
function downloadAll() {
  if (!group.value) return
  store.clearSelection()
  group.value.members.forEach((member) => store.addToSelection({ type: "file", id: member.id }))
  downloadOpen.value = true
}
</script>

<template>
  <Dialog :open="!!modelValue" @update:open="(open) => !open && emit('update:modelValue', null)">
    <DialogContent class="admin-dialog--wide flex max-h-[90vh] flex-col overflow-hidden">
      <Loader v-if="status === 'pending'" />
      <template v-else-if="group">
        <DialogHeader>
          <div class="flex items-start gap-4">
            <img v-if="group.members.find((member) => member.assetFileId === group!.coverFileId)?.thumbnailURL" :src="group.members.find((member) => member.assetFileId === group!.coverFileId)!.thumbnailURL!" alt="" class="size-16 shrink-0 object-contain" />
            <div class="min-w-0 flex-1">
              <DialogTitle class="flex flex-wrap items-center gap-2">{{ group.displayName }} <Badge variant="secondary">{{ statusLabel[group.status] ?? group.status }}</Badge><Badge v-if="isAdmin" variant="outline">{{ group.forced ? "Forced" : "Computed" }}</Badge></DialogTitle>
              <DialogDescription>{{ group.memberCount }} variants of one creative, grouped because their names differ only by {{ group.axes.map((axis) => axis.label.toLowerCase()).join(" and ") || "format" }}.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div class="flex flex-wrap items-center gap-2">
          <Button @click="downloadAll">Download all {{ group.memberCount }}</Button>
          <Button v-if="isAdmin" variant="outline" @click="editing = !editing">{{ editing ? "Done" : "Edit group" }}</Button>
          <template v-if="isAdmin && editing">
            <Button variant="outline" size="sm" :disabled="selected.length < 2" @click="split">Split into new group</Button>
            <Button variant="outline" size="sm" :disabled="!selected.length" @click="exclude">Exclude from grouping</Button>
            <Button variant="outline" size="sm" :disabled="selected.length !== 1" @click="setCover">Set as cover</Button>
          </template>
        </div>
        <div v-if="isAdmin && (coverOverride || forceOverride)" class="admin-form-note flex flex-wrap gap-3">
          <span v-if="forceOverride">This group was formed by hand. <button type="button" class="underline" @click="undo(forceOverride.id)">Undo</button></span>
          <span v-if="coverOverride">The cover was chosen by hand. <button type="button" class="underline" @click="undo(coverOverride.id)">Undo</button></span>
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead v-if="editing" class="w-8"><span class="sr-only">Select</span></TableHead>
                <TableHead class="w-16"><span class="sr-only">Preview</span></TableHead>
                <TableHead>Name</TableHead>
                <TableHead v-for="axis in group.axes" :key="axis.id">
                  <input v-if="isAdmin && editing" class="dv-input h-8 w-32" :value="axis.name ?? ''" :placeholder="axis.label" :aria-label="`Name of ${axis.label}`" @change="(event) => renameAxis(axis.id, (event.target as HTMLInputElement).value)" />
                  <template v-else>{{ axis.label }}</template>
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span class="sr-only">Download</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="member in group.members" :key="member.id">
                <TableCell v-if="editing"><Checkbox :model-value="selected.includes(member.assetFileId)" :aria-label="`Select ${member.name}`" @update:model-value="(checked) => selected = checked === true ? [...selected, member.assetFileId] : selected.filter((id) => id !== member.assetFileId)" /></TableCell>
                <TableCell><img v-if="member.thumbnailURL" :src="member.thumbnailURL" alt="" loading="lazy" class="size-12 object-contain" /><thumbnailPlaceholder v-else class="size-12 fill-neutral-400" aria-hidden="true" /></TableCell>
                <TableCell>{{ member.name }}<span v-if="member.assetFileId === group.coverFileId" class="admin-text-secondary"> · cover</span></TableCell>
                <TableCell v-for="(axis, index) in group.axes" :key="axis.id">{{ member.axisValues[index] || "—" }}</TableCell>
                <TableCell class="uppercase">{{ getFileExtension(member.name) }}</TableCell>
                <TableCell>{{ statusLabel[member.status] ?? member.status }}</TableCell>
                <TableCell><a :href="member.fileURL" class="underline" :download="member.name">Download</a></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </template>
    </DialogContent>
  </Dialog>
  <CollectionModalDownloadMulti v-model="downloadOpen" />
</template>
