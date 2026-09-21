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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { X } from "@lucide/vue"
import type { AcceptableValue } from "reka-ui"
import { computed, ref, watch } from "vue"

type Axis = RouterOutput["variantAxis"]["list"][number]

const toast = useGlobalToast()
const queryClient = useQueryClient()
const { data: axes, status, error } = useQuery({ queryKey: ["variant-axes"], queryFn: () => trpc.variantAxis.list.query() })
const { data: settings } = useQuery({ queryKey: ["variant-axes", "settings"], queryFn: () => trpc.variantAxis.settings.query() })
const { data: overrides } = useQuery({ queryKey: ["variant-overrides"], queryFn: () => trpc.variantGroup.listOverrides.query() })
const waiting = computed(() => (axes.value ?? []).filter((axis) => !axis.name && !axis.ignored))
const named = computed(() => (axes.value ?? []).filter((axis) => axis.name || axis.ignored))
const namedTargets = computed(() => (axes.value ?? []).filter((axis) => axis.name))

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ["variant-axes"] })
  await queryClient.invalidateQueries({ queryKey: ["variant-overrides"] })
  await queryClient.invalidateQueries({ queryKey: ["enrichment"] })
}
async function act(run: () => Promise<unknown>, message: string) {
  try {
    await run()
    toast.success(message)
    await refresh()
  } catch (err) {
    toast.error(extractErrors(err as Error).message)
  }
}
function rename(axis: Axis, event: Event) {
  const name = (event.target as HTMLInputElement).value.trim()
  if (name === (axis.name ?? "")) return
  act(() => trpc.variantAxis.rename.mutate({ id: axis.id, name: name || null }), name ? `Axis named ${name}` : "Name removed")
}
const mergeInto = ref<Record<string, string>>({})
const union = (axis: Axis) => {
  const target = axes.value?.find((current) => current.id === mergeInto.value[axis.id])
  return target ? [...new Set([...target.values, ...axis.values])].sort() : []
}
const kindLabel: Record<string, string> = { force_group: "Split into its own group", exclude: "Excluded from grouping", cover: "Chosen as cover" }

const minPrefixLength = ref(4)
const blocked = ref<string[]>([])
const newWord = ref("")
watch(settings, (value) => {
  if (value) {
    minPrefixLength.value = value.minPrefixLength
    blocked.value = [...value.blockedTokens]
  }
}, { immediate: true })
const example = computed(() => {
  const short = "ab"
  const long = "sale"
  return `with ${minPrefixLength.value}, ${short}_1 and ${short}_2 are ${short.length >= minPrefixLength.value ? "" : "not "}grouped, ${long}_1 and ${long}_2 are ${long.length >= minPrefixLength.value ? "" : "not "}grouped`
})
async function saveSettings(words = blocked.value) {
  await act(() => trpc.variantAxis.updateSettings.mutate({ minPrefixLength: minPrefixLength.value, blockedTokens: words }), "Settings saved, groups recomputed")
  await queryClient.invalidateQueries({ queryKey: ["variant-axes", "settings"] })
}
function addWord() {
  const word = newWord.value.trim().toLowerCase()
  if (!word || blocked.value.includes(word)) return
  newWord.value = ""
  saveSettings([...blocked.value, word])
}
</script>

<template>
  <div v-if="status === 'pending'"><Loader :text="true" /></div>
  <div v-else-if="status === 'error'" class="admin-error" role="alert">{{ error?.message }}</div>
  <div v-else class="admin-page admin-resource-page">
    <AdminPageHeader description="Show the formats, languages and durations of one creative as a single card. Switch it on per asset type with Group variants, then name what changes between the files of a group.">
    </AdminPageHeader>
    <Tabs default-value="axes">
      <TabsList>
        <TabsTrigger value="axes">Axes <Badge v-if="waiting.length" variant="secondary" class="ml-2">{{ waiting.length }}</Badge></TabsTrigger>
        <TabsTrigger value="overrides">Changes by hand</TabsTrigger>
        <TabsTrigger value="blocked">Blocked words</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="axes" class="mt-4 grid gap-6">
        <p class="admin-form-note">An axis is what changes between the files of one group, such as the format or the language. Give it a name people will search by: it becomes a filter in search.</p>
        <div v-if="!axes?.length" class="admin-empty dv-panel"><h2>No variant groups yet.</h2><p>Enable Group variants on an asset type. Grouping runs after the next sync.</p></div>
        <template v-for="section in [{ title: 'Waiting for a name', rows: waiting }, { title: 'Named', rows: named }]" :key="section.title">
          <section v-if="section.rows.length" :aria-label="section.title">
            <h2 class="admin-heading mb-2">{{ section.title }}</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Values</TableHead><TableHead>Groups</TableHead><TableHead>Examples</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow v-for="axis in section.rows" :key="axis.id">
                  <TableCell><Input :model-value="axis.name ?? ''" :placeholder="axis.label" :aria-label="`Name of ${axis.label}`" class="w-44" @change="(event: Event) => rename(axis, event)" /><p v-if="axis.ignored" class="admin-text-secondary">Hidden from search</p></TableCell>
                  <TableCell><div class="flex flex-wrap gap-1"><Badge v-for="value in axis.values.slice(0, 8)" :key="value" variant="outline">{{ value }}</Badge><span v-if="axis.values.length > 8" class="admin-text-secondary">+{{ axis.values.length - 8 }}</span></div></TableCell>
                  <TableCell>{{ axis.groups }}</TableCell>
                  <TableCell class="admin-text-secondary">{{ axis.examples.join(", ") }}</TableCell>
                  <TableCell>
                    <div class="flex flex-wrap items-center gap-2">
                      <AlertDialog v-if="!axis.ignored">
                        <AlertDialogTrigger as-child><Button variant="ghost" size="sm">Ignore</Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Hide this axis from search filters?</AlertDialogTitle>
                            <AlertDialogDescription>Its values stay stored and it will not come back on the next scan.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction @click="act(() => trpc.variantAxis.ignore.mutate({ id: axis.id, ignored: true }), 'Axis hidden from search')">Ignore</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button v-else variant="ghost" size="sm" @click="act(() => trpc.variantAxis.ignore.mutate({ id: axis.id, ignored: false }), 'Axis shown in search again')">Show again</Button>
                      <Select :model-value="mergeInto[axis.id] ?? ''" @update:model-value="(value: AcceptableValue) => { mergeInto[axis.id] = String(value) }">
                        <SelectTrigger class="w-40" :aria-label="`Merge ${axis.label} into`"><SelectValue placeholder="Merge into…" /></SelectTrigger>
                        <SelectContent><SelectItem v-for="target in namedTargets.filter((candidate) => candidate.id !== axis.id)" :key="target.id" :value="target.id">{{ target.label }}</SelectItem></SelectContent>
                      </Select>
                      <AlertDialog v-if="mergeInto[axis.id]">
                        <AlertDialogTrigger as-child><Button variant="outline" size="sm">Merge</Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Merge {{ axis.label }} into {{ axes?.find((current) => current.id === mergeInto[axis.id])?.label }}?</AlertDialogTitle>
                            <AlertDialogDescription>The merged axis holds {{ union(axis).join(", ") }}, and its {{ axis.groups }} groups use it. {{ axis.label }} goes.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction @click="act(() => trpc.variantAxis.merge.mutate({ fromId: axis.id, intoId: mergeInto[axis.id] }), 'Axes merged')">Merge</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
        </template>
      </TabsContent>

      <TabsContent value="overrides" class="mt-4">
        <p class="admin-form-note mb-4">Groups split, files excluded and covers chosen by hand in the group panel of search. Undoing one gives the group back to the automatic grouping.</p>
        <div v-if="!overrides?.length" class="admin-empty dv-panel"><h2>Nothing changed by hand.</h2></div>
        <Table v-else>
          <TableHeader><TableRow><TableHead>Change</TableHead><TableHead>Files</TableHead><TableHead>By</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="override in overrides" :key="override.id">
              <TableCell>{{ kindLabel[override.kind] ?? override.kind }}</TableCell>
              <TableCell class="admin-text-secondary">{{ override.fileNames.slice(0, 4).join(", ") }}<template v-if="override.fileNames.length > 4">, +{{ override.fileNames.length - 4 }}</template></TableCell>
              <TableCell>{{ override.createdBy ?? "—" }} · {{ new Date(override.createdAt).toLocaleDateString() }}</TableCell>
              <TableCell><Button variant="ghost" size="sm" @click="act(() => trpc.variantGroup.undoOverride.mutate(override.id), 'Undone')">Undo</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>

      <TabsContent value="blocked" class="mt-4 grid gap-4">
        <p class="admin-form-note">Files whose name contains one of these words are never grouped. Use it to stop versions (<code>v2</code>, <code>final</code>) and camera dumps (<code>img</code>, <code>dsc</code>) from looking like variants.</p>
        <div class="flex flex-wrap gap-2">
          <Badge v-for="word in blocked" :key="word" variant="outline" class="gap-1">{{ word }}<button type="button" :aria-label="`Remove ${word}`" @click="saveSettings(blocked.filter((current) => current !== word))"><X class="size-3" /></button></Badge>
        </div>
        <form class="flex max-w-md gap-2" @submit.prevent="addWord">
          <Input v-model="newWord" placeholder="draft" aria-label="Word to block" />
          <Button type="submit" variant="outline" :disabled="!newWord.trim()">Add</Button>
        </form>
      </TabsContent>

      <TabsContent value="settings" class="mt-4">
        <form class="dv-panel grid max-w-xl gap-3 p-6" @submit.prevent="saveSettings()">
          <Label for="min-prefix">Minimum shared length</Label>
          <Input id="min-prefix" v-model.number="minPrefixLength" type="number" min="1" max="40" class="w-32" />
          <p class="admin-text-secondary">The number of characters two names must share before they can be variants: {{ example }}.</p>
          <div><Button type="submit" class="dv-button dv-button--primary">Save</Button></div>
        </form>
      </TabsContent>
    </Tabs>
  </div>
</template>
