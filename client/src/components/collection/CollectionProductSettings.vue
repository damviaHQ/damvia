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
import RecordFilters from "@/components/records/RecordFilters.vue"
import FieldDescription from "@/components/ui/field/FieldDescription.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { useGlobalStore } from "@/stores/globalStore.ts"
import { trpc } from "@/services/server.ts"
import { filterIsComplete, type RecordFilter } from "@/utils/recordFilters"
import { useQuery } from "@tanstack/vue-query"
import { ListPlus } from "@lucide/vue"
import { computed } from "vue"

const props = defineProps<{ collectionId: string, numberOfRecords: number }>()
const catalogueMode = defineModel<"files" | "products" | "both">("catalogueMode", { required: true })
const includesAllRecords = defineModel<boolean>("includesAllRecords", { required: true })
const recordFilters = defineModel<RecordFilter[]>("recordFilters", { required: true })

const globalStore = useGlobalStore()
const { plural, singular, lowerPlural } = useRecordLabel()
// The rules are written against the catalogue fields, which only an
// administrator may read.
const isAdmin = computed(() => globalStore.user?.role === "admin")
const { data: fields } = useQuery({
  enabled: isAdmin,
  queryKey: ["record-attributes"],
  queryFn: () => trpc.recordAttribute.list.query(),
})
const { data: keyLabel } = useQuery({
  enabled: isAdmin,
  queryKey: ["records", "key-label"],
  queryFn: async () => (await trpc.record.list.query({ offset: 0, limit: 1 })).keyColumnName ?? "Key",
})
const incomplete = computed(() => recordFilters.value.some((filter) => !filterIsComplete(filter)))
</script>

<template>
  <section class="grid gap-4" aria-labelledby="collection-products-heading">
    <h3 id="collection-products-heading" class="text-sm font-semibold">{{ plural }}</h3>
    <FieldGroup>
      <Label for="collection-catalogue-mode">What readers browse here</Label>
      <select id="collection-catalogue-mode" v-model="catalogueMode" class="record-native-select">
        <option value="files">Files only</option>
        <option value="products">{{ plural }} only</option>
        <option value="both">Files and {{ plural.toLowerCase() }}</option>
      </select>
      <FieldDescription>{{ numberOfRecords }} {{ numberOfRecords === 1 ? singular.toLowerCase() : plural.toLowerCase() }} in this collection.</FieldDescription>
    </FieldGroup>

    <div v-if="catalogueMode !== 'files'" class="grid justify-items-start gap-1">
      <Button type="button" variant="outline" size="sm" as-child>
        <router-link :to="{ name: 'admin-collection-products', params: { id: collectionId } }">
          <ListPlus class="size-5" />Build this catalogue
        </router-link>
      </Button>
      <FieldDescription>
        Pick the {{ lowerPlural }} by reference or by rules, see what is ready, and take out the ones you do not want.
      </FieldDescription>
    </div>

    <div v-if="isAdmin" class="flex items-start gap-3">
      <Checkbox id="collection-all-records" v-model="includesAllRecords" class="mt-0.5" aria-describedby="collection-all-records-help" />
      <div class="grid gap-1">
        <Label for="collection-all-records">Show the whole catalogue</Label>
        <FieldDescription id="collection-all-records-help">Every {{ singular.toLowerCase() }} is reachable through this collection, without listing them one by one.</FieldDescription>
      </div>
    </div>

    <FieldGroup v-if="isAdmin && !includesAllRecords">
      <Label>Rules</Label>
      <RecordFilters v-if="fields" :fields="fields" :key-label="keyLabel ?? 'Key'" v-model="recordFilters" />
      <FieldDescription>
        Every {{ singular.toLowerCase() }} matching these rules joins the collection, and leaves it when it stops matching.
        {{ plural }} added by hand stay whatever the rules say.
      </FieldDescription>
      <p v-if="incomplete" role="status" class="text-caption text-neutral-500">A rule without a value is ignored until you fill it.</p>
    </FieldGroup>
  </section>
</template>
