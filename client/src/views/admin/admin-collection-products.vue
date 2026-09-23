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
import CollectionDialogAddRecordsByKey from "@/components/collection/CollectionDialogAddRecordsByKey.vue"
import Loader from "@/components/Loader.vue"
import RecordFilters from "@/components/records/RecordFilters.vue"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import FieldDescription from "@/components/ui/field/FieldDescription.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { filterIsComplete, type RecordFilter } from "@/utils/recordFilters"
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { ListPlus, Trash2 } from "@lucide/vue"
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
// A collection is fed either by a list of references someone keeps, or by
// rules over the record fields. The two mix, so this only says which one the
// screen is showing.
const feed = ref<"fixed" | "rules">("fixed")
const rules = ref<RecordFilter[]>([])

const { data: collection } = useQuery({
  queryKey: computed(() => ["collection", collectionId.value]),
  queryFn: () => trpc.collection.findById.query(collectionId.value),
})
const { data: fields } = useQuery({ queryKey: ["record-attributes"], queryFn: () => trpc.recordAttribute.list.query() })
const { data: enrichment } = useQuery({ queryKey: ["enrichment-settings"], queryFn: () => trpc.settings.getEnrichment.query() })
const { data: keyLabel } = useQuery({
  queryKey: ["records", "key-label"],
  queryFn: async () => (await trpc.record.list.query({ offset: 0, limit: 1 })).keyColumnName ?? "Key",
})
const { data: preview, isFetching } = useQuery({
  queryKey: computed(() => ["collection", collectionId.value, "record-preview", page.value]),
  queryFn: () => trpc.collection.recordPreview.query({ id: collectionId.value, offset: page.value * PAGE_SIZE, limit: PAGE_SIZE }),
})

watch(collection, (current) => {
  if (!current) return
  rules.value = (current.recordFilters as RecordFilter[] | null) ?? []
  feed.value = rules.value.length ? "rules" : "fixed"
}, { immediate: true })

const rows = computed(() => preview.value?.rows ?? [])
const total = computed(() => preview.value?.total ?? 0)
const pages = computed(() => Math.ceil(total.value / PAGE_SIZE))
const notReady = computed(() => rows.value.filter((row) => !row.excluded && !row.readiness.ready).length)
const titleField = computed(() => fields.value?.find((field) => field.name === enrichment.value?.cardTitleAttributeName))

function refresh() {
  queryClient.invalidateQueries({ queryKey: ["collection", collectionId.value] })
}

const { mutate: setExcluded } = useMutation({
  mutationFn: (input: { recordIds: string[], excluded: boolean }) =>
    trpc.collection.setRecordsExcluded.mutate({ id: collectionId.value, ...input }),
  onSuccess: refresh,
  onError: (error: Error) => toast.error(error.message),
})
const { mutate: removeRecords } = useMutation({
  mutationFn: (recordIds: string[]) => trpc.collection.removeRecords.mutate({ id: collectionId.value, recordIds }),
  onSuccess: refresh,
  onError: (error: Error) => toast.error(error.message),
})
const { mutate: excludeNotReady, isPending: isExcluding } = useMutation({
  mutationFn: () => trpc.collection.excludeNotReadyRecords.mutate({ id: collectionId.value }),
  onSuccess: (count) => {
    refresh()
    toast.success(count ? `${count} ${count === 1 ? singular.value.toLowerCase() : lowerPlural.value} taken out.` : "Everything here is ready.")
  },
  onError: (error: Error) => toast.error(error.message),
})
const { mutate: saveRules, isPending: isSavingRules } = useMutation({
  mutationFn: () => trpc.collection.setRecordRules.mutate({
    id: collectionId.value,
    recordFilters: rules.value.filter(filterIsComplete),
  }),
  onSuccess: () => {
    refresh()
    toast.success("Rules saved.")
  },
  onError: (error: Error) => toast.error(error.message),
})
</script>

<template>
  <AdminPageHeader :title="collection?.name ?? plural"
    :description="`Choose what this collection holds and see what readers would get.`" />

  <div class="grid gap-6">
    <FieldGroup>
      <Label for="feed">How this collection is filled</Label>
      <select id="feed" v-model="feed" class="record-native-select w-max">
        <option value="fixed">A fixed list of references</option>
        <option value="rules">Rules on the {{ singular.toLowerCase() }} fields</option>
      </select>
      <FieldDescription v-if="feed === 'fixed'">
        The {{ lowerPlural }} you put here stay until you take them out.
      </FieldDescription>
      <FieldDescription v-else>
        Every {{ singular.toLowerCase() }} matching these rules joins the collection and leaves it when it stops matching.
      </FieldDescription>
    </FieldGroup>

    <div v-if="feed === 'fixed'">
      <Button type="button" variant="outline" size="sm" @click="isAddByKeyOpen = true">
        <ListPlus class="size-5" />Add by reference
      </Button>
    </div>
    <div v-else class="grid gap-3">
      <RecordFilters v-if="fields" :fields="fields" :key-label="keyLabel ?? 'Key'" v-model="rules" />
      <div><Button type="button" size="sm" :disabled="isSavingRules" @click="saveRules()">Save rules</Button></div>
    </div>

    <div class="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
      <span role="status" class="text-body text-neutral-600">{{ total }} {{ lowerPlural }} in this collection</span>
      <Button v-if="notReady" type="button" variant="outline" size="sm" :disabled="isExcluding" class="ml-auto"
        @click="excludeNotReady()">
        Exclude the {{ notReady }} not ready
      </Button>
    </div>

    <Loader v-if="isFetching && !rows.length" :text="true" />
    <p v-else-if="!rows.length" class="text-body text-neutral-600">
      Nothing here yet. Add {{ lowerPlural }} by reference, or write rules.
    </p>
    <table v-else class="dv-table">
      <thead>
        <tr>
          <th scope="col">In the catalogue</th>
          <th scope="col">{{ keyLabel ?? "Key" }}</th>
          <th v-if="titleField" scope="col">{{ titleField.displayName ?? titleField.name }}</th>
          <th scope="col">Ready</th>
          <th scope="col">Added</th>
          <th scope="col"><span class="dv-sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :class="row.excluded ? 'text-neutral-400' : ''">
          <td>
            <Switch :model-value="!row.excluded" :aria-label="`Keep ${row.recordKey} in the catalogue`"
              @update:model-value="setExcluded({ recordIds: [row.id], excluded: !$event })" />
          </td>
          <td>{{ row.recordKey }}</td>
          <td v-if="titleField">{{ row.metaData[titleField.name] || "-" }}</td>
          <td>
            <span class="flex items-center gap-2">
              <span aria-hidden="true" class="size-1.5 rounded-full"
                :class="row.readiness.ready ? 'bg-green-600' : 'bg-amber-500'" />
              {{ row.readiness.ready ? "Ready" : `${row.readiness.filled}/${row.readiness.total}` }}
            </span>
          </td>
          <td>{{ row.source === "rule" ? "By a rule" : "By hand" }}</td>
          <td>
            <Button v-if="row.source === 'manual'" type="button" variant="ghost" size="sm"
              :aria-label="`Remove ${row.recordKey} from this collection`" @click="removeRecords([row.id])">
              <Trash2 class="size-5" />
            </Button>
          </td>
        </tr>
      </tbody>
    </table>

    <nav v-if="pages > 1" class="flex items-center gap-3" aria-label="Pages">
      <Button type="button" variant="outline" size="sm" :disabled="page === 0" @click="page = page - 1">Previous</Button>
      <span class="text-caption text-neutral-600">Page {{ page + 1 }} of {{ pages }}</span>
      <Button type="button" variant="outline" size="sm" :disabled="page + 1 >= pages" @click="page = page + 1">Next</Button>
    </nav>
  </div>

  <CollectionDialogAddRecordsByKey v-model="isAddByKeyOpen" :collection-id="collectionId" />
</template>
