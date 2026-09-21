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
import AdminList from "@/components/admin/AdminList.vue"
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
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { extractErrors, RouterOutput, trpc } from "@/services/server.ts"
import AdminRecordAttributes from "@/views/admin/records/admin-record-attributes.vue"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import type { AcceptableValue } from "reka-ui"
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"

type Field = RouterOutput["metadataField"]["list"][number]

const toast = useGlobalToast()
const queryClient = useQueryClient()
const label = useRecordLabel()
const route = useRoute()
const router = useRouter()
const tab = ref(route.query.tab === "metadata" ? "metadata" : "attributes")
function onTab(value: string | number) {
  tab.value = String(value)
  router.replace({ query: { ...route.query, tab: value === "metadata" ? "metadata" : undefined } })
}

const { data: fields, status, error } = useQuery({ queryKey: ["metadata-fields"], queryFn: () => trpc.metadataField.list.query() })
const { data: attributeNames } = useQuery({ queryKey: ["records", "available-attributes"], queryFn: () => trpc.recordAttribute.listAvailable.query() })

const saving = ref<string | null>(null)
async function save(field: Field, patch: Partial<Field>) {
  saving.value = field.id
  try {
    const next = { ...field, ...patch }
    await trpc.metadataField.update.mutate({
      id: field.id,
      displayName: next.displayName,
      searchable: next.searchable,
      facetable: next.facetable,
      viewable: next.viewable,
      canLink: next.canLink,
      linkTarget: next.canLink ? next.linkTarget : null,
      linkAttributeName: next.canLink && next.linkTarget === "attribute" ? next.linkAttributeName : null,
    })
    await queryClient.invalidateQueries({ queryKey: ["metadata-fields"] })
    await queryClient.invalidateQueries({ queryKey: ["entity-resolution"] })
  } catch (err) {
    toast.error(extractErrors(err as Error).message)
  } finally {
    saving.value = null
  }
}

// Trusting a field links files on the spot, so it is confirmed with the
// number of files carrying it and what the value means.
const trusting = ref<{ field: Field; linkTarget: "record_key" | "attribute"; linkAttributeName: string } | null>(null)
function askTrust(field: Field, checked: boolean | "indeterminate") {
  if (checked === true) trusting.value = { field, linkTarget: "record_key", linkAttributeName: "" }
  else save(field, { canLink: false, linkTarget: null, linkAttributeName: null })
}
async function confirmTrust() {
  if (!trusting.value) return
  const { field, linkTarget, linkAttributeName } = trusting.value
  trusting.value = null
  await save(field, { canLink: true, linkTarget, linkAttributeName: linkTarget === "attribute" ? linkAttributeName : null })
  toast.success(`${field.displayName || field.name} can now link files`)
}
const linkMeaning = (field: Field) => !field.canLink ? "—" : field.linkTarget === "record_key" ? `${label.singular.value} key` : `Value of ${field.linkAttributeName}`
</script>

<template>
  <div class="admin-page admin-resource-page">
    <Tabs :model-value="tab" @update:model-value="onTab">
      <TabsList>
        <TabsTrigger value="attributes">{{ label.singular.value }} attributes</TabsTrigger>
        <TabsTrigger value="metadata">File metadata</TabsTrigger>
      </TabsList>
      <TabsContent value="attributes" class="mt-4">
        <AdminRecordAttributes />
      </TabsContent>
      <TabsContent value="metadata" class="mt-4">
        <p class="admin-form-note mb-4">Cameras write some fields (date, GPS, camera). People write others (title, keywords, category), and they can be wrong or outdated. Only tick “Can link” for a field your team fills reliably.</p>
        <div v-if="status === 'pending'"><Loader :text="true" /></div>
        <div v-else-if="status === 'error'" class="admin-error" role="alert">{{ error?.message }}</div>
        <div v-else-if="!fields?.length" class="admin-empty dv-panel">
          <h2>No metadata found yet.</h2>
          <p>Metadata is read when files are processed after the next sync. For files processed earlier, run <code>npm run cli -- metadata:backfill</code> on the server.</p>
        </div>
        <AdminList v-else :items="fields" :fields="['name', 'displayName']" label="Metadata fields" v-slot="{ items }">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Examples</TableHead>
                <TableHead>Searchable</TableHead>
                <TableHead>Filter</TableHead>
                <TableHead>Visible</TableHead>
                <TableHead>Can link</TableHead>
                <TableHead>Link meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="field in items" :key="field.id" :aria-busy="saving === field.id">
                <TableCell><code>{{ field.name }}</code><p class="admin-text-secondary">{{ field.valueType }}</p></TableCell>
                <TableCell><Input :model-value="field.displayName ?? ''" :aria-label="`Display name of ${field.name}`" placeholder="Shown to readers" @change="(event: Event) => save(field, { displayName: (event.target as HTMLInputElement).value || null })" /></TableCell>
                <TableCell>{{ field.fileCount }}</TableCell>
                <TableCell class="admin-text-secondary">{{ field.examples.join(", ") }}</TableCell>
                <TableCell><Checkbox :model-value="field.searchable" :aria-label="`${field.name} searchable`" @update:model-value="(checked) => save(field, { searchable: checked === true })" /></TableCell>
                <TableCell><Checkbox :model-value="field.facetable" :disabled="field.valueType === 'gps'" :aria-label="`${field.name} filter in search`" @update:model-value="(checked) => save(field, { facetable: checked === true })" /></TableCell>
                <TableCell><Checkbox :model-value="field.viewable" :aria-label="`${field.name} visible`" @update:model-value="(checked) => save(field, { viewable: checked === true })" /></TableCell>
                <TableCell><Checkbox :model-value="field.canLink" :aria-label="`${field.name} can link files`" @update:model-value="(checked) => askTrust(field, checked)" /></TableCell>
                <TableCell>{{ linkMeaning(field) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </AdminList>
      </TabsContent>
    </Tabs>
    <AlertDialog :open="!!trusting" @update:open="(open) => !open && (trusting = null)">
      <AlertDialogContent v-if="trusting">
        <AlertDialogHeader>
          <AlertDialogTitle>Let {{ trusting.field.displayName || trusting.field.name }} link files?</AlertDialogTitle>
          <AlertDialogDescription>{{ trusting.field.fileCount }} files carry this field. They are linked on the next pass once a Matching step names the field. Nothing is written to the files.</AlertDialogDescription>
        </AlertDialogHeader>
        <div class="grid gap-2">
          <label for="trust-target" class="font-medium">The value is</label>
          <Select :model-value="trusting.linkTarget" @update:model-value="(value: AcceptableValue) => trusting && (trusting.linkTarget = String(value) as 'record_key' | 'attribute')">
            <SelectTrigger id="trust-target"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="record_key">a {{ label.lower.value }} key</SelectItem>
              <SelectItem value="attribute">the value of an attribute (a range)</SelectItem>
            </SelectContent>
          </Select>
          <template v-if="trusting.linkTarget === 'attribute'">
            <label for="trust-attribute" class="font-medium">Attribute</label>
            <Select :model-value="trusting.linkAttributeName" @update:model-value="(value: AcceptableValue) => trusting && (trusting.linkAttributeName = String(value))">
              <SelectTrigger id="trust-attribute"><SelectValue placeholder="Choose an attribute" /></SelectTrigger>
              <SelectContent><SelectItem v-for="name in attributeNames" :key="name" :value="name">{{ name }}</SelectItem></SelectContent>
            </Select>
          </template>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction :disabled="trusting.linkTarget === 'attribute' && !trusting.linkAttributeName" @click="confirmTrust">Allow linking</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
