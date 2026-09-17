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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGlobalToast } from '@/composables/useGlobalToast'
import { extractErrors, trpc } from '@/services/server'
import { useGlobalStore } from '@/stores/globalStore'
import { canEditUser, type AdminUser } from '@/utils/adminUsers'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'

const props = defineProps<{ user: AdminUser }>()
const emit = defineEmits<{ updated: []; close: []; saving: [value: boolean] }>()
const store = useGlobalStore()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const isSelf = computed(() => store.user?.id === props.user.id)
const isOwnManagerProfile = computed(() => isSelf.value && store.user?.role === 'manager')
const { data: groups, status: groupsStatus, refetch: retryGroups } = useQuery({ queryKey: ['groups'], queryFn: () => trpc.group.list.query(), enabled: computed(() => !isOwnManagerProfile.value) })
const { data: regions, status: regionsStatus, refetch: retryRegions } = useQuery({ queryKey: ['regions'], queryFn: () => trpc.region.list.query(), enabled: computed(() => !isOwnManagerProfile.value) })
const draft = reactive({ name: '', email: '', company: '', regionId: '', role: props.user.role, groupIds: [] as string[], maintenanceContact: false })
const saving = ref(false)
watch(saving, value => emit('saving', value), { flush: 'sync' })
const rootError = ref('')
const errors = ref<Record<string, string>>({})
const groupSearch = ref('')
const visibleGroups = computed(() => (groups.value ?? []).filter(group => group.name.toLocaleLowerCase().includes(groupSearch.value.trim().toLocaleLowerCase())))
watch(() => props.user.id, () => {
  Object.assign(draft, { name: props.user.name, email: props.user.email, company: props.user.company, regionId: props.user.regionId, role: props.user.role, groupIds: props.user.groups.map(group => group.id), maintenanceContact: props.user.maintenanceContact ?? false })
  errors.value = {}; rootError.value = ''
}, { immediate: true })
const schema = z.object({ name: z.string().min(1, 'Enter a name.').max(80), email: z.string().email('Enter a valid email address.'), company: z.string().min(1, 'Enter a company name.').max(80), regionId: z.string().uuid('Choose a region.'), role: z.enum(['admin', 'manager', 'member', 'guest']), groupIds: z.string().uuid().array(), maintenanceContact: z.boolean() })
async function save() {
  if (saving.value || !canEditUser(store.user, props.user)) return
  rootError.value = ''; errors.value = {}
  const values = { ...draft, role: isSelf.value ? props.user.role : draft.role }
  if (isOwnManagerProfile.value) { values.regionId = props.user.regionId; values.groupIds = props.user.groups.map(group => group.id) }
  const validation = schema.safeParse(values)
  if (!validation.success) {
    for (const issue of validation.error.issues) errors.value[String(issue.path[0])] ??= issue.message
    return
  }
  saving.value = true
  try {
    await trpc.user.update.mutate({ id: props.user.id, ...values })
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['users'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })])
    if (isSelf.value) await store.fetchUser()
    toast.success('User updated')
    emit('updated'); emit('close')
  } catch (error) {
    const result = extractErrors(error as Error)
    rootError.value = result.message
    errors.value = result.fieldErrors
  } finally { saving.value = false }
}
</script>
<template>
 <form class="admin-form" @submit.prevent="save">
  <div v-if="rootError" class="admin-error" role="alert">{{ rootError }}</div>
  <fieldset :disabled="saving" class="admin-form">
   <div class="admin-form-grid">
    <div><label for="edit-user-name">Name</label><Input id="edit-user-name" v-model="draft.name" autocomplete="name" :aria-invalid="!!errors.name" :aria-describedby="errors.name ? 'edit-name-error' : undefined" /><p v-if="errors.name" id="edit-name-error" class="admin-form-error">{{ errors.name }}</p></div>
    <div><label for="edit-user-company">Company</label><Input id="edit-user-company" v-model="draft.company" autocomplete="organization" :aria-invalid="!!errors.company" :aria-describedby="errors.company ? 'edit-company-error' : undefined" /><p v-if="errors.company" id="edit-company-error" class="admin-form-error">{{ errors.company }}</p></div>
   </div>
   <div><label for="edit-user-email">Email address</label><Input id="edit-user-email" v-model="draft.email" type="email" autocomplete="email" :aria-invalid="!!errors.email" aria-describedby="edit-email-note edit-email-error" /><p v-if="draft.email !== user.email" id="edit-email-note" class="admin-form-note">Changing this address requires the user to verify their new email before they can access the DAM again.</p><p v-if="errors.email" id="edit-email-error" class="admin-form-error">{{ errors.email }}</p></div>
   <p v-if="isOwnManagerProfile" class="admin-form-note">An administrator manages your role, region and groups.</p>
   <template v-else>
    <div class="admin-form-grid">
     <div><label for="edit-user-role">Role</label><select id="edit-user-role" v-model="draft.role" :disabled="isSelf"><option value="guest">Guest</option><option value="member">Member</option><template v-if="store.user?.role === 'admin'"><option value="manager">Manager</option><option value="admin">Admin</option></template></select><p v-if="isSelf" class="admin-form-note">Ask another administrator to change your role.</p><p v-if="errors.role" class="admin-form-error">{{ errors.role }}</p></div>
     <div><label for="edit-user-region">Region</label><select id="edit-user-region" v-model="draft.regionId" :disabled="regionsStatus !== 'success'" :aria-invalid="!!errors.regionId"><option disabled value="">Choose a region</option><option v-for="region in regions" :key="region.id" :value="region.id">{{ region.name }}</option></select><p v-if="regionsStatus === 'pending'">Loading regions…</p><p v-if="regionsStatus === 'error'" class="admin-form-error">Regions could not be loaded. <button type="button" class="underline" @click="retryRegions()">Retry</button></p><p v-if="errors.regionId" class="admin-form-error">{{ errors.regionId }}</p></div>
    </div>
    <div><span id="edit-user-groups-label">Groups</span><Input v-if="(groups?.length ?? 0) > 5" id="edit-user-group-search" aria-label="Find a group" v-model="groupSearch" type="search" placeholder="Find a group" /><p v-if="groupsStatus === 'pending'">Loading groups…</p><p v-else-if="groupsStatus === 'error'" class="admin-form-error">Groups could not be loaded. <button type="button" class="underline" @click="retryGroups()">Retry</button></p><div v-else class="admin-group-options" role="group" aria-labelledby="edit-user-groups-label"><label v-for="group in visibleGroups" :key="group.id"><input v-model="draft.groupIds" type="checkbox" :value="group.id" />{{ group.name }}</label><p v-if="!visibleGroups.length">{{ groupSearch ? 'No matching groups.' : 'No groups configured.' }}</p></div><p v-if="errors.groupIds" class="admin-form-error">{{ errors.groupIds }}</p></div>
   </template>
   <label v-if="store.user?.role === 'admin' && draft.role === 'admin'" class="maintenance-toggle"><input v-model="draft.maintenanceContact" type="checkbox" />Receives storage and maintenance emails</label>
  </fieldset>
  <div class="admin-form-footer"><Button variant="outline" class="dv-button" type="button" :disabled="saving" @click="emit('close')">Cancel</Button><Button class="dv-button dv-button--primary" type="submit" :disabled="saving || (!isOwnManagerProfile && (regionsStatus !== 'success' || groupsStatus !== 'success'))">{{ saving ? 'Saving…' : 'Save changes' }}</Button></div>
 </form>
</template>
<style scoped>
.admin-form label + input, .admin-form label + select { margin-top:7px; }
.maintenance-toggle { display:flex; align-items:center; gap:10px; line-height:1.6; }
</style>
