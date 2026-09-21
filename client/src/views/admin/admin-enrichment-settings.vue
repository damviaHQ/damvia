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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { ref, watch } from "vue"

const toast = useGlobalToast()
const store = useGlobalStore()
const form = ref({ recordLabelSingular: "", recordLabelPlural: "" })
const errors = ref<Record<string, string>>({})
const { status, data, error } = useQuery({
  queryKey: ["enrichment-settings"],
  queryFn: () => trpc.settings.getEnrichment.query(),
})
watch(data, () => { if (data.value) form.value = { ...data.value } }, { immediate: true })

const saving = ref(false)
async function save(event: Event) {
  event.preventDefault()
  if (saving.value) return
  saving.value = true
  errors.value = {}
  try {
    await trpc.settings.updateEnrichment.mutate(form.value)
    await store.fetchEnv()
    toast.success("Settings saved")
  } catch (error) {
    const result = extractErrors(error as Error)
    errors.value = result.fieldErrors
    if (!Object.keys(result.fieldErrors).length) toast.error(result.message)
  } finally {
    saving.value = false
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
    <AdminPageHeader description="Name the things your records describe. The word is used everywhere records appear." />
    <form class="admin-form dv-panel" :aria-busy="saving" @submit.prevent="save">
      <div class="admin-form-grid">
        <FieldGroup>
          <Label for="recordLabelSingular">Record label, singular *</Label>
          <Input id="recordLabelSingular" v-model="form.recordLabelSingular" placeholder="Product" :aria-invalid="!!errors.recordLabelSingular" />
          <p v-if="errors.recordLabelSingular" class="admin-form-error">{{ errors.recordLabelSingular }}</p>
        </FieldGroup>
        <FieldGroup>
          <Label for="recordLabelPlural">Record label, plural *</Label>
          <Input id="recordLabelPlural" v-model="form.recordLabelPlural" placeholder="Products" :aria-invalid="!!errors.recordLabelPlural" />
          <p v-if="errors.recordLabelPlural" class="admin-form-error">{{ errors.recordLabelPlural }}</p>
        </FieldGroup>
      </div>
      <p class="admin-form-note">This changes "Products" to "{{ form.recordLabelPlural || 'Products' }}" everywhere, for example in the menu, the search filters and the asset type settings.</p>
      <div class="admin-form-footer">
        <Button type="submit" class="dv-button dv-button--primary" :disabled="saving || !form.recordLabelSingular.trim() || !form.recordLabelPlural.trim()">{{ saving ? "Saving…" : "Save" }}</Button>
      </div>
    </form>
  </div>
</template>
