<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import RecordFilters from "@/components/records/RecordFilters.vue"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc, type RouterOutput } from "@/services/server"
import { filterIsComplete } from "@/utils/recordFilters"
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { Plus, X } from "@lucide/vue"
import { computed, ref, useId, watch } from "vue"

type Settings = RouterOutput["settings"]["getEnrichment"]["relatedRecords"]
const props = defineProps<{ collectionId?: string }>()
const { plural, singular, lowerPlural } = useRecordLabel()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const headingId = useId()
const { data: enrichment } = useQuery({ queryKey: ["enrichment-settings"], queryFn: () => trpc.settings.getEnrichment.query() })
const { data: collection } = useQuery({
  enabled: computed(() => !!props.collectionId),
  queryKey: computed(() => ["collection", props.collectionId]),
  queryFn: () => trpc.collection.findById.query(props.collectionId!),
})
const { data: fields } = useQuery({ queryKey: ["record-attributes"], queryFn: () => trpc.recordAttribute.list.query() })
const readableFields = computed(() => (fields.value ?? []).filter(field => field.viewable))
const settings = ref<Settings>({ enabled: true, groups: [] })
const inherited = ref(true)
const saved = computed(() => props.collectionId ? collection.value?.relatedRecords : enrichment.value?.relatedRecords)
function reset() {
  inherited.value = !!props.collectionId && !saved.value
  settings.value = JSON.parse(JSON.stringify(saved.value ?? enrichment.value?.relatedRecords ?? { enabled: true, groups: [] }))
}
watch([saved, enrichment], reset, { immediate: true })
const incomplete = computed(() => settings.value.groups.some(group => [...group.filters, ...group.excludeFilters].some(filter => !filterIsComplete(filter))))
const changed = computed(() => props.collectionId && inherited.value ? !!saved.value : JSON.stringify(settings.value) !== JSON.stringify(saved.value))
const { mutate: save, isPending } = useMutation({
  mutationFn: async () => {
    if (props.collectionId) return trpc.collection.setRecordRules.mutate({ id: props.collectionId, relatedRecords: inherited.value ? null : settings.value })
    return trpc.settings.updateEnrichment.mutate({ ...enrichment.value!, relatedRecords: settings.value })
  },
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["enrichment-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["collection"] }),
      queryClient.invalidateQueries({ queryKey: ["catalogue"] }),
    ])
    toast.success(`Related ${lowerPlural.value} saved.`)
  },
  onError: (error: Error) => toast.error(error.message),
})
function addGroup() {
  settings.value.groups.push({ scope: props.collectionId ? "current" : "all", matchField: null, hasPhoto: false, filters: [], excludeFilters: [] })
}
</script>

<template>
  <section class="grid min-w-0 gap-4" :aria-labelledby="headingId">
    <div>
      <h2 :id="headingId" class="text-body font-semibold">Related {{ plural }}</h2>
      <p class="mt-1 text-caption admin-text-secondary">Choose what appears on {{ singular.toLowerCase() }} detail pages. The current entry is always excluded; readers only see entries and photos they can access.</p>
    </div>
    <label v-if="collectionId" class="flex items-center gap-3 text-body">
      <Switch v-model="inherited" />Use the default related {{ lowerPlural }} settings
    </label>
    <template v-if="!inherited">
      <label class="flex items-center gap-3 text-body"><Switch v-model="settings.enabled" />Show related {{ lowerPlural }}</label>
      <template v-if="settings.enabled">
        <p class="text-caption admin-text-secondary">Combine groups with OR. Within a group, every condition must match. A matching exclusion removes the entry from that group.</p>
        <div v-for="(group, index) in settings.groups" :key="index" class="grid min-w-0 gap-4 border-t border-neutral-200 pt-4" role="group" :aria-label="`Related group ${index + 1}`">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-body font-semibold">{{ index ? 'OR · ' : '' }}Group {{ index + 1 }}</h3>
            <Button v-if="settings.groups.length > 1" type="button" variant="ghost" size="icon-sm" :aria-label="`Remove group ${index + 1}`" @click="settings.groups.splice(index, 1)"><X class="size-4" /></Button>
          </div>
          <label class="grid gap-2 text-body">Look in
            <select v-model="group.scope" class="record-native-select">
              <option value="current">Current list</option>
              <option value="all">All accessible lists</option>
            </select>
          </label>
          <p v-if="group.scope === 'current'" class="text-caption admin-text-secondary">Uses the list from which the detail page was opened, including its subcollections. Without a list, this group shows no results.</p>
          <label class="grid gap-2 text-body">Related by
            <select v-model="group.matchField" class="record-native-select">
              <option :value="null">Any {{ lowerPlural }} matching the conditions</option>
              <option value="$family">Same model</option>
              <option v-for="field in readableFields" :key="field.id" :value="field.name">Same {{ field.displayName ?? field.name }}</option>
            </select>
          </label>
          <label class="flex items-center gap-3 text-body"><Switch v-model="group.hasPhoto" />At least one accessible photo</label>
          <div class="grid gap-2">
            <h4 class="text-caption font-medium">Match all filters (AND)</h4>
            <RecordFilters v-model="group.filters" :fields="readableFields" key-label="Reference" />
          </div>
          <div class="grid gap-2">
            <h4 class="text-caption font-medium">Exclude if any filter matches</h4>
            <RecordFilters v-model="group.excludeFilters" :fields="readableFields" key-label="Reference" />
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" class="justify-self-start" :disabled="settings.groups.length >= 5" @click="addGroup"><Plus class="size-4" />Add OR group</Button>
      </template>
    </template>
    <div class="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
      <Button type="button" size="sm" :disabled="isPending || !enrichment || !changed || (!inherited && incomplete)" @click="save()">{{ isPending ? 'Saving…' : 'Save related settings' }}</Button>
      <Button v-if="changed" type="button" variant="ghost" size="sm" :disabled="isPending" @click="reset">Cancel changes</Button>
      <span v-if="!inherited && incomplete" role="status" class="text-caption admin-text-secondary">Complete each filter before saving.</span>
    </div>
  </section>
</template>
