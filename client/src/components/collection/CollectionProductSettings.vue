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
import CollectionDialogAddRecordsByKey from "@/components/collection/CollectionDialogAddRecordsByKey.vue"
import FieldDescription from "@/components/ui/field/FieldDescription.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { useGlobalStore } from "@/stores/globalStore.ts"
import type { RecordFilter } from "@/utils/recordFilters"
import { ListPlus } from "@lucide/vue"
import { computed, ref } from "vue"

defineProps<{ collectionId: string, numberOfRecords: number, personal?: boolean }>()
const catalogueMode = defineModel<"files" | "products" | "both">("catalogueMode", { required: true })
const includesAllRecords = defineModel<boolean>("includesAllRecords", { required: true })
defineModel<RecordFilter[]>("recordFilters", { required: true })

const globalStore = useGlobalStore()
const { plural, singular, lowerPlural } = useRecordLabel()
const isAdmin = computed(() => globalStore.user?.role === "admin")
const isAddByKeyOpen = ref(false)
</script>

<template>
  <section class="grid gap-4" aria-labelledby="collection-products-heading">
    <h3 id="collection-products-heading" class="text-sm font-semibold">{{ personal ? "Contents" : plural }}</h3>
    <FieldDescription v-if="personal">This collection can hold files and {{ lowerPlural }}. Its contents are displayed automatically.</FieldDescription>
    <FieldDescription v-if="personal || catalogueMode !== 'files' || numberOfRecords > 0">
      Anyone who can open this collection can view and download its {{ lowerPlural }}’ linked pictures.
      No separate file collection is needed. Licence dates and regional restrictions still apply.
    </FieldDescription>
    <FieldGroup v-if="!personal && isAdmin">
      <Label for="collection-catalogue-mode">What readers browse here</Label>
      <select id="collection-catalogue-mode" v-model="catalogueMode" class="record-native-select">
        <option value="files">Files only</option>
        <option value="products">{{ plural }} only</option>
        <option value="both">Files and {{ lowerPlural }}</option>
      </select>
      <FieldDescription>{{ numberOfRecords }} {{ numberOfRecords === 1 ? singular.toLowerCase() : lowerPlural }} in this collection.</FieldDescription>
    </FieldGroup>
    <div v-if="personal || catalogueMode !== 'files'" class="grid justify-items-start gap-2">
      <Button v-if="isAdmin && !personal" type="button" variant="outline" size="sm" as-child>
        <router-link :to="{ name: 'admin-collection-products', params: { id: collectionId } }"><ListPlus class="size-4" />Build this catalogue</router-link>
      </Button>
      <Button v-else type="button" variant="outline" size="sm" @click="isAddByKeyOpen = true"><ListPlus class="size-4" />Add by reference</Button>
      <FieldDescription v-if="isAdmin && !personal">Manage references, automatic rules and readiness in the catalogue builder.</FieldDescription>
      <FieldDescription v-else>Add {{ lowerPlural }} from the catalogue or paste their references.</FieldDescription>
    </div>
    <div v-if="isAdmin && !personal && catalogueMode !== 'files'" class="flex items-start gap-3">
      <Checkbox id="collection-all-records" v-model="includesAllRecords" class="mt-0.5" aria-describedby="collection-all-records-help" />
      <div class="grid gap-1">
        <Label for="collection-all-records">Show the whole catalogue</Label>
        <FieldDescription id="collection-all-records-help">Every {{ singular.toLowerCase() }} and its linked pictures are accessible through this collection. Use a curated collection to include or exclude individual entries.</FieldDescription>
      </div>
    </div>
    <CollectionDialogAddRecordsByKey v-model="isAddByKeyOpen" :collection-id="collectionId" />
  </section>
</template>
