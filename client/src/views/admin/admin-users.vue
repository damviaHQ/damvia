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
import AdminUserEdit from '@/components/admin/AdminUserEdit.vue'
import Loader from '@/components/Loader.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useGlobalToast } from '@/composables/useGlobalToast'
import { extractErrors, trpc } from '@/services/server'
import { useGlobalStore } from '@/stores/globalStore'
import { canApproveUser, canDeleteUser, canEditUser, filterUsers, usersCsv, userState, userStateLabels, type AdminUser, type UserFilters, type UserSort, type UserView } from '@/utils/adminUsers'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { ArrowDownToLine, ArrowUpDown, Check, ChevronLeft, ChevronRight, ClipboardList, Search, SlidersHorizontal, Trash2, Users, X } from 'lucide-vue-next'
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'

const store = useGlobalStore()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const route = useRoute()
const { status, data, error, refetch } = useQuery({ queryKey: ['users'], queryFn: () => trpc.user.list.query(), refetchOnMount: true })
const users = computed(() => data.value ?? [])
const filters = ref<UserFilters>({ search: '', view: route.query.needsApproval === 'true' ? 'pending' : 'all', role: 'all', region: 'all', group: 'all' })
const showFilters = ref(false)
const sortKey = ref<UserSort>('createdAt')
const ascending = ref(false)
const page = ref(1)
const perPage = ref(20)
const selectedIds = ref<string[]>([])
const tabs: { key: UserView; label: string }[] = [{ key: 'all', label: 'All users' }, { key: 'pending', label: 'Needs approval' }, { key: 'active', label: 'Active' }, { key: 'unverified', label: 'Unverified' }]
const roleLabels: Record<string, string> = { admin: 'Admin', manager: 'Manager', member: 'Member', guest: 'Guest' }
const filtered = computed(() => filterUsers(users.value, filters.value, sortKey.value, ascending.value))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage.value)))
const visible = computed(() => filtered.value.slice((page.value - 1) * perPage.value, page.value * perPage.value))
const regions = computed(() => [...new Map(users.value.filter(user => user.region).map(user => [user.regionId, user.region!])).entries()].sort((a, b) => a[1].localeCompare(b[1])))
const groups = computed(() => [...new Map(users.value.flatMap(user => user.groups.map(group => [group.id, group.name] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1])))
const activeFilterCount = computed(() => [filters.value.role, filters.value.region, filters.value.group].filter(value => value !== 'all').length)
const hasFilters = computed(() => !!filters.value.search || filters.value.view !== 'all' || activeFilterCount.value > 0)
const allSelected = computed(() => visible.value.length > 0 && visible.value.every(user => selectedIds.value.includes(user.id)))
const someSelected = computed(() => visible.value.some(user => selectedIds.value.includes(user.id)) && !allSelected.value)
const exportRecords = computed(() => selectedIds.value.length ? filtered.value.filter(user => selectedIds.value.includes(user.id)) : filtered.value)
const verifiedEmailCount = computed(() => exportRecords.value.filter(user => user.emailVerified).length)
const busyId = ref<string | null>(null)
const deleting = ref<AdminUser | null>(null)
const deleteError = ref('')
const selectedUserId = ref<string | null>(null)
const selectedUser = computed(() => users.value.find(user => user.id === selectedUserId.value))
const detailsOpen = ref(false)
const savingDetails = ref(false)
const returnTarget = shallowRef<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
watch(() => route.query.needsApproval, value => { filters.value.view = value === 'true' ? 'pending' : 'all' })
watch([filters, perPage], () => { page.value = 1; selectedIds.value = [] }, { deep: true })
watch([sortKey, ascending], () => { page.value = 1 })
watch(filtered, records => { page.value = Math.min(page.value, pageCount.value); selectedIds.value = selectedIds.value.filter(id => records.some(user => user.id === id)) })
const count = (view: UserView) => view === 'all' ? users.value.length : users.value.filter(user => userState(user) === view).length
const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const initials = (name: string) => name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
function resetFilters() { filters.value = { search: '', view: 'all', role: 'all', region: 'all', group: 'all' } }
function sortBy(key: UserSort) { ascending.value = key === sortKey.value ? !ascending.value : key === 'name'; sortKey.value = key }
function toggleAll() {
  selectedIds.value = allSelected.value ? selectedIds.value.filter(id => !visible.value.some(user => user.id === id)) : [...new Set([...selectedIds.value, ...visible.value.map(user => user.id)])]
}
function openDetails(user: AdminUser, event: Event) {
  returnTarget.value = event.currentTarget as HTMLElement
  selectedUserId.value = user.id
  detailsOpen.value = true
}
function restoreFocus(event: Event) {
  event.preventDefault()
  if (returnTarget.value?.isConnected) returnTarget.value.focus()
  else searchInput.value?.focus()
}
async function refreshUsers() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['users'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]) }
async function approve(user: AdminUser) {
  if (!canApproveUser(store.user, user) || busyId.value) return
  busyId.value = user.id
  try { await trpc.user.approve.mutate(user.id); await refreshUsers(); toast.success(`${user.name} approved`) }
  catch (error) { toast.error(extractErrors(error as Error).message) }
  finally { busyId.value = null }
}
function askDelete(user: AdminUser, event: Event) {
  returnTarget.value = event.currentTarget as HTMLElement
  deleting.value = user
  deleteError.value = ''
}
async function remove() {
  if (!deleting.value || !canDeleteUser(store.user, deleting.value) || busyId.value) return
  busyId.value = deleting.value.id
  try {
    await trpc.user.remove.mutate(deleting.value.id)
    deleting.value = null
    await refreshUsers()
    toast.success('User deleted')
  } catch (error) { deleteError.value = extractErrors(error as Error).message }
  finally { busyId.value = null }
}
async function copyEmails() {
  try {
    await navigator.clipboard.writeText(exportRecords.value.filter(user => user.emailVerified).map(user => user.email).join(', '))
    toast.success(`${verifiedEmailCount.value} verified email${verifiedEmailCount.value === 1 ? '' : 's'} copied`)
  } catch { toast.error('Could not copy emails. Check your browser clipboard permissions.') }
}
function exportCsv() {
  const url = URL.createObjectURL(new Blob([usersCsv(exportRecords.value)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'damvia-users.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success(`${exportRecords.value.length} users exported`)
}
</script>

<template>
 <div class="admin-page admin-users">
  <header class="admin-heading">
   <div><h1>Users</h1><p v-if="store.user?.role === 'manager'">Users in your region.</p></div>
   <div class="admin-actions">
    <Button variant="outline" class="dv-button" :disabled="!verifiedEmailCount" @click="copyEmails"><ClipboardList />Copy emails</Button>
    <Button variant="outline" class="dv-button" :disabled="!exportRecords.length" @click="exportCsv"><ArrowDownToLine />{{ selectedIds.length ? `Export ${selectedIds.length} selected` : 'Export users' }}</Button>
   </div>
  </header>
  <Loader v-if="status === 'pending'" :text="true" />
  <div v-else-if="status === 'error'" class="admin-error" role="alert"><p>{{ error?.message }}</p><Button variant="outline" class="dv-button" @click="refetch()">Try again</Button></div>
  <section v-else class="dv-panel users-panel" aria-label="User directory">
   <div class="users-tabs" role="group" aria-label="User status">
    <button v-for="tab in tabs" :key="tab.key" :aria-pressed="filters.view === tab.key" :class="{ active: filters.view === tab.key }" @click="filters.view = tab.key">{{ tab.label }}<span>{{ count(tab.key) }}</span></button>
   </div>
   <div class="users-toolbar">
    <label class="users-search"><Search /><span class="dv-sr-only">Search users</span><input ref="searchInput" v-model="filters.search" type="search" placeholder="Search name, email or company" /></label>
    <Button variant="outline" class="dv-button" :aria-expanded="showFilters" aria-controls="user-filters" @click="showFilters = !showFilters"><SlidersHorizontal />Filters<span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span></Button>
    <button v-if="hasFilters" class="users-text-action" @click="resetFilters"><X />Clear filters</button>
    <span class="users-result-count" aria-live="polite">{{ filtered.length }} {{ filtered.length === 1 ? 'user' : 'users' }}</span>
   </div>
   <div v-if="showFilters" id="user-filters" class="users-filters">
    <div><label for="users-filter-role">Role</label><select id="users-filter-role" v-model="filters.role" class="dv-select"><option value="all">All roles</option><option value="no-guests">Exclude guests</option><option v-for="(label, value) in roleLabels" :key="value" :value="value">{{ label }}</option></select></div>
    <div><label for="users-filter-region">Region</label><select id="users-filter-region" v-model="filters.region" class="dv-select"><option value="all">All regions</option><option v-for="[id, name] in regions" :key="id" :value="id">{{ name }}</option></select></div>
    <div><label for="users-filter-group">Group</label><select id="users-filter-group" v-model="filters.group" class="dv-select"><option value="all">All groups</option><option v-for="[id, name] in groups" :key="id" :value="id">{{ name }}</option></select></div>
   </div>
   <div v-if="selectedIds.length" class="users-selection" role="status"><Check /><strong>{{ selectedIds.length }} selected</strong><span>Export and copy use your selection.</span><button class="users-text-action" @click="selectedIds = []">Clear selection</button></div>
   <div v-if="!filtered.length" class="admin-empty"><Users /><h2>{{ hasFilters ? 'No users match these filters' : 'No users yet' }}</h2><p>{{ hasFilters ? 'Try another search or clear your filters.' : 'Registered users will appear here.' }}</p><Button v-if="hasFilters" variant="outline" class="dv-button" @click="resetFilters">Clear filters</Button></div>
   <div v-else class="users-table-scroll" role="region" aria-label="Users table" tabindex="0">
    <table class="dv-table users-table">
     <thead><tr>
      <th class="selection-cell"><input type="checkbox" :checked="allSelected" :indeterminate="someSelected" aria-label="Select users on this page" @change="toggleAll" /></th>
      <th :aria-sort="sortKey === 'name' ? (ascending ? 'ascending' : 'descending') : 'none'"><button @click="sortBy('name')">User <ArrowUpDown /></button></th>
      <th>Role</th><th>Region & groups</th><th>Status</th>
      <th :aria-sort="sortKey === 'createdAt' ? (ascending ? 'ascending' : 'descending') : 'none'"><button @click="sortBy('createdAt')">Joined <ArrowUpDown /></button></th>
      <th><span class="dv-sr-only">Actions</span></th>
     </tr></thead>
     <tbody><tr v-for="user in visible" :key="user.id" :class="{ 'is-selected': selectedIds.includes(user.id) }">
      <td class="selection-cell"><input v-model="selectedIds" type="checkbox" :value="user.id" :aria-label="`Select ${user.name}`" /></td>
      <td><button class="user-identity" :aria-label="`View ${user.name}`" @click="openDetails(user, $event)"><span class="user-avatar">{{ initials(user.name) }}</span><span class="user-identity-copy"><strong>{{ user.name }}<small v-if="user.id === store.user?.id" class="self-label">You</small></strong><span>{{ user.email }}</span><span v-if="user.company">{{ user.company }}</span></span></button></td>
      <td><span class="user-role">{{ roleLabels[user.role] }}</span><span v-if="user.maintenanceContact" class="user-cell-secondary">Storage alerts</span></td>
      <td><span>{{ user.region || 'No region' }}</span><span class="user-cell-secondary">{{ user.groups.map(group => group.name).join(', ') || 'No groups' }}</span></td>
      <td><Button v-if="canApproveUser(store.user, user)" class="dv-button dv-button--primary user-status-approval" :disabled="!!busyId" :aria-label="`Approve ${user.name}`" @click="approve(user)"><Check />{{ busyId === user.id ? 'Approving…' : 'Approve' }}</Button><span v-else class="dv-badge" :class="{ 'dv-badge--success': userState(user) === 'active', 'dv-badge--warning': userState(user) === 'pending' }">{{ userStateLabels[userState(user)] }}</span></td>
      <td class="user-joined">{{ formatDate(user.createdAt) }}</td>
      <td><div class="user-row-actions"><button v-if="canDeleteUser(store.user, user)" class="user-delete" :disabled="!!busyId" :aria-label="`Delete ${user.name}`" @click="askDelete(user, $event)"><Trash2 /></button></div></td>
     </tr></tbody>
    </table>
   </div>
   <footer class="users-pagination"><span>{{ filtered.length ? (page - 1) * perPage + 1 : 0 }}–{{ Math.min(page * perPage, filtered.length) }} of {{ filtered.length }}</span><div><label>Rows<select v-model.number="perPage" class="dv-select"><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option></select></label><Button variant="outline" class="dv-button" :disabled="page === 1" aria-label="Previous page" @click="page--"><ChevronLeft /></Button><span>{{ page }} / {{ pageCount }}</span><Button variant="outline" class="dv-button" :disabled="page === pageCount" aria-label="Next page" @click="page++"><ChevronRight /></Button></div></footer>
  </section>
  <Dialog :open="detailsOpen" @update:open="value => { if (!savingDetails) detailsOpen = value }">
   <DialogContent class="dv-theme dv-admin admin-dialog user-details-dialog" @close-auto-focus="restoreFocus" @escape-key-down="event => { if (savingDetails) event.preventDefault() }" @interact-outside="event => { if (savingDetails) event.preventDefault() }">
    <DialogHeader><DialogTitle>{{ selectedUser?.name || 'User details' }}</DialogTitle><DialogDescription v-if="selectedUser">{{ selectedUser.email }} · Joined {{ formatDate(selectedUser.createdAt) }}</DialogDescription></DialogHeader>
    <template v-if="selectedUser">
     <div class="user-detail-status"><span class="dv-badge" :class="{ 'dv-badge--success': userState(selectedUser) === 'active', 'dv-badge--warning': userState(selectedUser) === 'pending' }">{{ userStateLabels[userState(selectedUser)] }}</span><Button v-if="canApproveUser(store.user, selectedUser)" class="dv-button dv-button--primary" :disabled="!!busyId || savingDetails" @click="approve(selectedUser)">{{ busyId ? 'Approving…' : 'Approve user' }}</Button></div>
     <AdminUserEdit v-if="canEditUser(store.user, selectedUser)" :key="selectedUser.id" :user="selectedUser" @saving="savingDetails = $event" @close="detailsOpen = false" />
     <div v-else class="read-only-details"><p>Only an administrator can edit this account.</p><dl><dt>Company</dt><dd>{{ selectedUser.company }}</dd><dt>Role</dt><dd>{{ roleLabels[selectedUser.role] }}</dd><dt>Region</dt><dd>{{ selectedUser.region || 'No region' }}</dd><dt>Groups</dt><dd>{{ selectedUser.groups.map(group => group.name).join(', ') || 'No groups' }}</dd></dl></div>
    </template>
   </DialogContent>
  </Dialog>
  <AlertDialog :open="!!deleting" @update:open="value => { if (!value && !busyId) deleting = null }">
   <AlertDialogContent class="dv-theme dv-admin admin-dialog" @close-auto-focus="restoreFocus" @escape-key-down="event => { if (busyId) event.preventDefault() }">
    <AlertDialogHeader><AlertDialogTitle>Delete {{ deleting?.name }}?</AlertDialogTitle><AlertDialogDescription>The account {{ deleting?.email }} and its access will be permanently removed. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
    <p v-if="deleteError" class="admin-error" role="alert">{{ deleteError }}</p>
    <AlertDialogFooter><AlertDialogCancel as-child><Button variant="outline" class="dv-button" :disabled="!!busyId">Cancel</Button></AlertDialogCancel><Button variant="destructive" class="dv-button user-confirm-delete" :disabled="!!busyId" @click="remove">{{ busyId ? 'Deleting…' : 'Delete user' }}</Button></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </div>
</template>

<style scoped>
.users-panel { overflow:hidden; width:100%; min-width:0; }
.users-tabs { display:flex; gap:26px; padding:0 24px; border-bottom:1px solid var(--dv-color-line); overflow-x:auto; }
.users-tabs button { display:flex; align-items:center; gap:8px; padding:19px 0 16px; white-space:nowrap; border-bottom:2px solid transparent; font-size:12px; color:var(--dv-text-secondary); }
.users-tabs button.active { border-color:var(--dv-action-primary); color:var(--dv-text-primary); font-weight:550; }
.users-tabs button span { padding:2px 6px; border-radius:var(--dv-radius-data); background:var(--dv-surface-canvas); font-size:10px; }
.users-tabs button.active span { background:var(--dv-action-primary); color:white; }
.users-toolbar { display:flex; align-items:center; gap:12px; padding:20px 24px; flex-wrap:wrap; }
.users-search { display:flex; align-items:center; gap:10px; padding:0 12px; border:1px solid var(--dv-color-line); min-height:40px; width:320px; max-width:100%; }
.users-search svg { width:16px; color:var(--dv-text-secondary); }
.users-search input { background:transparent; min-width:0; width:100%; border:0; outline:none; font-size:12px; padding:10px 0; }
.users-search:focus-within { outline:2px solid var(--dv-action-primary); outline-offset:2px; }
.users-text-action { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:var(--dv-text-secondary); white-space:nowrap; }
.users-text-action svg { width:14px; }
.users-result-count { margin-left:auto; font-size:11px; color:var(--dv-text-secondary); }
.users-filters { display:flex; gap:16px; flex-wrap:wrap; padding:0 24px 20px; }
.users-filters > div { display:grid; gap:7px; font-size:11px; color:var(--dv-text-secondary); flex:1; min-width:150px; max-width:250px; }
.users-filters select { width:100%; font-size:12px; }
.filter-count { background:var(--dv-surface-canvas); padding:1px 5px; }
.users-selection { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 24px; border-top:1px solid var(--dv-color-line); background:var(--dv-surface-canvas); font-size:12px; }
.users-selection > span { color:var(--dv-text-secondary); }
.users-selection button { margin-left:auto; }
.users-table-scroll { overflow-x:auto; width:100%; min-width:0; }
.users-table { min-width:850px; }
.users-table th { padding:12px 18px; }
.users-table td { padding:18px; font-size:12px; }
.users-table th.selection-cell, .users-table td.selection-cell { width:48px; padding-right:0; padding-left:24px; }
.users-table .is-selected { background:var(--dv-surface-canvas); }
.user-identity { display:flex; align-items:center; gap:12px; text-align:left; }
.user-avatar { width:36px; height:36px; border-radius:50%; display:grid; place-items:center; flex-shrink:0; background:#e6edfa; color:var(--dv-text-primary); font-size:11px; font-weight:550; }
.user-identity-copy { display:grid; gap:4px; min-width:190px; max-width:310px; overflow-wrap:anywhere; }
.user-identity-copy strong { font-weight:550; }
.user-identity-copy > span, .user-cell-secondary { color:var(--dv-text-secondary); font-size:11px; }
.user-cell-secondary { display:block; margin-top:5px; max-width:200px; }
.self-label { margin-left:8px; color:var(--dv-text-secondary); font-size:10px; font-weight:400; }
.user-role { font-weight:500; }
.user-row-actions { display:flex; align-items:center; justify-content:flex-end; gap:10px; }
.user-delete { padding:10px; color:var(--dv-text-secondary); }
.user-delete:hover { color:var(--dv-color-danger); background:var(--dv-color-danger-soft); }
.user-delete svg { width:15px; }
.user-joined { white-space:nowrap; color:var(--dv-text-secondary); }
.users-pagination { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; padding:16px 24px; border-top:1px solid var(--dv-color-line); font-size:11px; color:var(--dv-text-secondary); }
.users-pagination > div, .users-pagination label { display:flex; align-items:center; gap:10px; }
.users-pagination select { padding:7px 10px; font-size:11px; }
.user-details-dialog { max-width:640px; }
.user-detail-status { display:flex; align-items:center; justify-content:space-between; padding-bottom:20px; border-bottom:1px solid var(--dv-color-line); }
.user-confirm-delete { background:var(--dv-color-danger); color:white; border-color:var(--dv-color-danger); }
.user-confirm-delete:hover:not(:disabled) { background:var(--dv-color-danger); color:white; }
.read-only-details { font-size:13px; }
.read-only-details p { color:var(--dv-text-secondary); }
.read-only-details dl { display:grid; grid-template-columns:100px 1fr; gap:16px; margin-top:20px; }
.read-only-details dt { color:var(--dv-text-secondary); }
@media(max-width:760px) { .users-tabs { gap:20px; padding:0 18px; } .users-toolbar { padding:18px; } .users-search { width:100%; } .users-filters { padding:0 18px 18px; } .users-pagination { padding:16px 18px; } .users-selection > span { display:none; } }
</style>
