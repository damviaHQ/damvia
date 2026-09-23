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
import RelatedRecordsSettings from "@/components/catalogue/RelatedRecordsSettings.vue"
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import CollectionDialogAddRecordsByKey from "@/components/collection/CollectionDialogAddRecordsByKey.vue"
import Loader from "@/components/Loader.vue"
import RecordFilters from "@/components/records/RecordFilters.vue"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { filterIsComplete, type RecordFilter } from "@/utils/recordFilters"
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { ArrowLeft, ExternalLink, ListPlus, PackageSearch } from "@lucide/vue"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"

const PAGE_SIZE = 100

const route = useRoute()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const { plural, singular, lowerPlural } = useRecordLabel()

const collectionId = computed(() => route.params.id as string)
const page = ref(0)
const isAddByKeyOpen = ref(false)
const feed = ref<"fixed" | "rules">("fixed")
const rules = ref<RecordFilter[]>([])

const { data: collection, error: collectionError } = useQuery({
  queryKey: computed(() => ["collection", collectionId.value]),
  queryFn: () => trpc.collection.findById.query(collectionId.value),
})
const { data: fields } = useQuery({ queryKey: ["record-attributes"], queryFn: () => trpc.recordAttribute.list.query() })
const { data: keyLabel } = useQuery({
  queryKey: ["records", "key-label"],
  queryFn: async () => (await trpc.record.list.query({ offset: 0, limit: 1 })).keyColumnName ?? "Key",
})
const { data: preview, isFetching, error: previewError } = useQuery({
  queryKey: computed(() => ["collection", collectionId.value, "record-preview", page.value]),
  queryFn: () => trpc.collection.recordPreview.query({ id: collectionId.value, offset: page.value * PAGE_SIZE, limit: PAGE_SIZE }),
})

watch(() => collection.value?.recordFilters, (filters) => {
  rules.value = JSON.parse(JSON.stringify(filters ?? []))
  feed.value = rules.value.length ? "rules" : "fixed"
}, { immediate: true })
watch(collectionId, () => { page.value = 0 })

const rows = computed(() => preview.value?.rows ?? [])
const total = computed(() => preview.value?.total ?? 0)
const pages = computed(() => Math.ceil(total.value / PAGE_SIZE))
const notReady = computed(() => preview.value?.notReady ?? 0)
const incompleteRules = computed(() => rules.value.some(rule => !filterIsComplete(rule)))
const rulesChanged = computed(() => JSON.stringify(rules.value) !== JSON.stringify(collection.value?.recordFilters ?? []))
const previewFields = computed(() => (fields.value ?? []).filter(field => field.name !== keyLabel.value))

async function refresh() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["collection"] }),
    queryClient.invalidateQueries({ queryKey: ["catalogue"] }),
  ])
}

const { mutate: setExcluded, isPending: isSettingExcluded } = useMutation({
  mutationFn: (input: { recordIds: string[], excluded: boolean }) =>
    trpc.collection.setRecordsExcluded.mutate({ id: collectionId.value, ...input }),
  onSuccess: refresh,
  onError: (error: Error) => toast.error(error.message),
})
const { mutate: excludeNotReady, isPending: isExcluding } = useMutation({
  mutationFn: () => trpc.collection.excludeNotReadyRecords.mutate({ id: collectionId.value }),
  onSuccess: async (count) => {
    await refresh()
    toast.success(count ? `${count} ${count === 1 ? singular.value.toLowerCase() : lowerPlural.value} excluded.` : "Everything here is ready.")
  },
  onError: (error: Error) => toast.error(error.message),
})
const { mutate: saveRules, isPending: isSavingRules } = useMutation({
  mutationFn: () => trpc.collection.setRecordRules.mutate({
    id: collectionId.value,
    recordFilters: rules.value,
    includesAllRecords: false,
  }),
  onSuccess: async () => {
    await refresh()
    toast.success("Rules saved.")
  },
  onError: (error: Error) => toast.error(error.message),
})
</script>

<template>
  <div class="admin-page admin-resource-page">
    <AdminPageHeader :title="collection?.name ?? plural" :description="`Build the collection, check its ${lowerPlural} and choose what readers see.`">
      <Button v-if="collection" type="button" variant="outline" as-child>
        <router-link :to="{ name: 'collection', params: { id: collectionId } }"><ExternalLink class="size-4" />View collection</router-link>
      </Button>
    </AdminPageHeader>
    <p class="text-body admin-text-secondary">Readers with access to this collection can view and download the linked pictures of its included {{ lowerPlural }}. No separate file collection is needed. Licence dates and regional restrictions still apply.</p>
    <router-link :to="{ name: 'admin-product-collections' }" class="admin-back-link"><span class="flex items-center gap-2"><ArrowLeft class="size-4" />{{ plural }} collections</span></router-link>
    <p v-if="collectionError" role="alert" class="admin-error">{{ collectionError.message }}</p>
    <Loader v-else-if="!collection" :text="true" />
    <div v-else class="grid min-w-0 gap-6">
      <section class="dv-panel p-5" aria-labelledby="catalogue-source-heading">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="catalogue-source-heading" class="text-body font-semibold">Add {{ lowerPlural }}</h2>
            <p class="mt-1 text-caption admin-text-secondary">Add references yourself, or keep the collection up to date with rules. Both sources can be used together.</p>
          </div>
          <span class="text-caption admin-text-secondary">{{ collection.includesAllRecords ? 'Whole database' : collection.recordFilters?.length ? 'Automatic rules active' : 'Fixed reference list' }}</span>
        </div>
        <p v-if="collection.includesAllRecords" class="admin-form-note mb-4">This collection currently shows the whole database. Saving rules switches it to a curated collection.</p>
        <Tabs v-model="feed">
          <TabsList aria-label="Product sources"><TabsTrigger value="fixed">References / CSV</TabsTrigger><TabsTrigger value="rules">Automatic rules</TabsTrigger></TabsList>
          <TabsContent value="fixed" class="pt-4">
            <p class="mb-4 text-body admin-text-secondary">Paste references or import a CSV. These {{ lowerPlural }} stay in the collection when its rules change.</p>
            <Button type="button" variant="outline" size="sm" @click="isAddByKeyOpen = true"><ListPlus class="size-4" />Add by reference</Button>
          </TabsContent>
          <TabsContent value="rules" class="grid gap-4 pt-4">
            <p class="text-body admin-text-secondary">{{ plural }} matching all rules are added automatically. They leave when they stop matching. Excluded rows stay excluded.</p>
            <RecordFilters v-if="fields" :fields="fields" :key-label="keyLabel ?? 'Key'" v-model="rules" />
            <div class="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
              <Button type="button" size="sm" :disabled="isSavingRules || incompleteRules || (!rulesChanged && !collection.includesAllRecords)" @click="saveRules()">{{ isSavingRules ? 'Saving…' : 'Save rules' }}</Button>
              <span v-if="incompleteRules" role="status" class="text-caption admin-text-secondary">Complete each rule before saving.</span>
              <span v-else-if="rulesChanged" role="status" class="text-caption admin-text-secondary">Unsaved changes. The preview shows the saved collection.</span>
              <span v-else class="text-caption admin-text-secondary">{{ rules.length ? 'Rules saved. The collection updates automatically.' : 'No automatic rules. Only added references are included.' }}</span>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <RelatedRecordsSettings :collection-id="collectionId" class="dv-panel p-5" />

      <section v-if="!collection.includesAllRecords" class="dv-panel admin-list" aria-labelledby="catalogue-preview-heading">
        <div class="admin-list-toolbar">
          <div>
            <h2 id="catalogue-preview-heading" class="text-body font-semibold text-neutral-900">Catalogue preview</h2>
            <p class="mt-1" role="status">{{ preview?.included ?? 0 }} included · {{ total - (preview?.included ?? 0) }} excluded · {{ total }} total</p>
          </div>
          <Button type="button" variant="outline" size="sm" :disabled="!notReady || isExcluding || isSettingExcluded" @click="excludeNotReady()">Exclude all not ready<span v-if="notReady"> ({{ notReady }})</span></Button>
        </div>
        <p v-if="previewError" role="alert" class="admin-error">{{ previewError.message }}</p>
        <Loader v-else-if="isFetching && !preview" :text="true" />
        <div v-else-if="!rows.length" class="admin-empty">
          <PackageSearch aria-hidden="true" />
          <h2>No {{ lowerPlural }} in this list yet</h2>
          <p>Add references or save rules to populate the preview.</p>
          <Button type="button" variant="outline" size="sm" @click="isAddByKeyOpen = true">Add by reference</Button>
        </div>
        <div v-else class="max-h-[60vh] overflow-auto" :aria-busy="isFetching">
          <table class="w-full border-collapse text-left">
            <thead class="sticky top-0 z-10"><tr>
              <th scope="col">Included</th>
              <th scope="col">{{ keyLabel ?? 'Reference' }}</th>
              <th scope="col">Readiness</th>
              <th scope="col">Source</th>
              <th v-for="field in previewFields" :key="field.id" scope="col">{{ field.displayName ?? field.name }}</th>
            </tr></thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" :class="row.excluded ? 'bg-neutral-50 text-neutral-400 [&_td:not(:first-child)]:opacity-60' : ''">
                <td><Switch :model-value="!row.excluded" :disabled="isSettingExcluded || isExcluding" :aria-label="`Include ${row.recordKey} in the catalogue`" @update:model-value="setExcluded({ recordIds: [row.id], excluded: !$event })" /></td>
                <td class="whitespace-nowrap font-medium">{{ row.recordKey }}</td>
                <td class="whitespace-nowrap">
                  <span class="flex items-center gap-2"><span aria-hidden="true" class="size-1.5 rounded-full" :class="row.readiness.ready ? 'bg-green-600' : 'bg-amber-500'" />{{ row.readiness.ready ? 'Ready' : 'Not ready' }}<span v-if="row.readiness.total" class="text-caption tabular-nums">{{ row.readiness.filled }}/{{ row.readiness.total }}</span></span>
                </td>
                <td class="whitespace-nowrap">{{ row.source === 'rule' ? 'Automatic rule' : 'Reference' }}</td>
                <td v-for="field in previewFields" :key="field.id"><span class="block max-w-64 truncate" :title="row.metaData[field.name]">{{ row.metaData[field.name] || '—' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="admin-list-footer">
          <span>Excluded {{ lowerPlural }} stay in this list and are hidden from readers.</span>
          <nav v-if="pages > 1" class="flex items-center gap-3" aria-label="Pages">
            <Button type="button" variant="outline" size="sm" :disabled="page === 0 || isFetching" @click="page--">Previous</Button>
            <span>Page {{ page + 1 }} of {{ pages }}</span>
            <Button type="button" variant="outline" size="sm" :disabled="page + 1 >= pages || isFetching" @click="page++">Next</Button>
          </nav>
        </footer>
      </section>
    </div>
    <CollectionDialogAddRecordsByKey v-model="isAddByKeyOpen" :collection-id="collectionId" />
  </div>
</template>
