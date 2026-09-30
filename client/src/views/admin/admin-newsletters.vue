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
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import AudienceBuilder from "@/components/newsletter/AudienceBuilder.vue"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc, type RouterOutput } from "@/services/server.ts"
import { describeAudience, emptyAudience, STATUS_LABELS, type AudienceFilter, type NewsletterStatus } from "@/utils/newsletter"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ChevronRight, Plus, Trash2 } from "@lucide/vue"
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"

type Audience = RouterOutput["newsletter"]["audiences"][number]

const route = useRoute()
const router = useRouter()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const tab = computed<'newsletters' | 'audiences'>(() => route.query.tab === 'audiences' ? 'audiences' : 'newsletters')
const showTab = (value: 'newsletters' | 'audiences') => router.replace({ query: value === 'audiences' ? { tab: value } : {} })

const { data: newsletters, status, refetch } = useQuery({
  queryKey: ['newsletters'],
  queryFn: () => trpc.newsletter.list.query(),
  refetchInterval: (query) => query.state.data?.some(item => item.status === 'sending') ? 3000 : false,
})
const { data: audiences, status: audienceStatus } = useQuery({ queryKey: ['newsletter-audiences'], queryFn: () => trpc.newsletter.audiences.query() })
const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: () => trpc.group.list.query() })
const { data: regions } = useQuery({ queryKey: ['regions'], queryFn: () => trpc.region.list.query() })
const names = computed(() => ({
  groups: new Map((groups.value ?? []).map(group => [group.id, group.name])),
  regions: new Map((regions.value ?? []).map(region => [region.id, region.name])),
  people: new Map<string, string>(),
}))

const sections = computed(() => {
  const items = newsletters.value ?? []
  return [
    { key: 'draft', title: 'Drafts', items: items.filter(item => item.status === 'draft') },
    { key: 'scheduled', title: 'Scheduled and sending', items: items.filter(item => item.status === 'scheduled' || item.status === 'sending') },
    { key: 'sent', title: 'Sent', items: items.filter(item => item.status === 'sent') },
  ].filter(section => section.items.length)
})

const creating = ref(false)
async function create() {
  creating.value = true
  try {
    const { id } = await trpc.newsletter.create.mutate({})
    await queryClient.invalidateQueries({ queryKey: ['newsletters'] })
    router.push({ name: 'admin-newsletter', params: { id } })
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { creating.value = false }
}

const format = (date: Date | string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
function when(item: NonNullable<typeof newsletters.value>[number]) {
  if (item.status === 'sent' && item.sentAt) return `Sent ${format(item.sentAt)}`
  if (item.status === 'scheduled' && item.scheduledAt) return `Sends ${format(item.scheduledAt)}`
  if (item.status === 'sending') return `Sending: ${item.counts.total - item.counts.pending} of ${item.counts.total}`
  return `Edited ${format(item.updatedAt)}${item.updatedBy ? ` by ${item.updatedBy}` : ''}`
}

// Saved audiences: edited in a dialog.
const editing = ref<{ id?: string, name: string, filter: AudienceFilter } | null>(null)
const editingCount = ref<number | null>(null)
const savingAudience = ref(false)
const audienceError = ref('')
function editAudience(audience?: Audience) {
  audienceError.value = ''
  editing.value = audience ? { id: audience.id, name: audience.name, filter: { ...audience.filter } } : { name: '', filter: emptyAudience() }
}
async function saveAudience() {
  if (!editing.value) return
  savingAudience.value = true
  audienceError.value = ''
  try {
    await trpc.newsletter.saveAudience.mutate(editing.value)
    await queryClient.invalidateQueries({ queryKey: ['newsletter-audiences'] })
    toast.success('Audience saved')
    editing.value = null
  } catch (error) {
    audienceError.value = extractErrors(error as Error).message
  } finally { savingAudience.value = false }
}
const removing = ref<Audience | null>(null)
async function removeAudience() {
  if (!removing.value) return
  try {
    await trpc.newsletter.removeAudience.mutate(removing.value.id)
    await queryClient.invalidateQueries({ queryKey: ['newsletter-audiences'] })
    toast.success('Audience deleted')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { removing.value = null }
}
</script>

<template>
  <div class="admin-page admin-resource-page">
    <AdminPageHeader description="Write an email once and send it to everyone, or to the people you choose. Account emails are under Emails.">
      <Button v-if="tab === 'newsletters'" class="dv-button dv-button--primary" :disabled="creating" @click="create">
        <Plus class="size-4 mr-2" aria-hidden="true" />{{ creating ? 'Creating…' : 'New newsletter' }}
      </Button>
      <Button v-else class="dv-button dv-button--primary" @click="editAudience()"><Plus class="size-4 mr-2" aria-hidden="true" />New audience</Button>
    </AdminPageHeader>

    <div class="newsletters">
      <div class="newsletters-tabs" role="group" aria-label="Show">
        <button type="button" :aria-pressed="tab === 'newsletters'" @click="showTab('newsletters')">Newsletters</button>
        <button type="button" :aria-pressed="tab === 'audiences'" @click="showTab('audiences')">Saved audiences</button>
      </div>

      <template v-if="tab === 'newsletters'">
        <p v-if="status === 'pending'" role="status">Loading newsletters…</p>
        <div v-else-if="status === 'error'" role="alert">The newsletters could not be loaded. <Button class="dv-button" variant="outline" @click="refetch()">Try again</Button></div>
        <section v-else-if="!sections.length" class="dv-panel newsletters-empty">
          <h2>No newsletters yet</h2>
          <p>Announce a new collection, share a product launch or send a monthly update. Each person gets their own copy, with a link to unsubscribe.</p>
          <Button class="dv-button dv-button--primary" :disabled="creating" @click="create"><Plus class="size-4 mr-2" aria-hidden="true" />Write the first one</Button>
        </section>
        <section v-for="section in sections" v-else :key="section.key" class="dv-panel newsletters-group" :aria-labelledby="`section-${section.key}`">
          <h2 :id="`section-${section.key}`">{{ section.title }}</h2>
          <ul class="newsletters-list">
            <li v-for="item in section.items" :key="item.id">
              <router-link :to="{ name: 'admin-newsletter', params: { id: item.id } }" class="newsletters-row">
                <span class="newsletters-main">
                  <span class="newsletters-title">{{ item.name }}<span class="newsletters-status" :data-status="item.status">{{ STATUS_LABELS[item.status as NewsletterStatus] }}</span></span>
                  <span class="newsletters-sub">{{ item.subject || 'No subject yet' }}</span>
                </span>
                <span class="newsletters-meta">
                  <span v-if="item.status === 'sent'">{{ item.counts.sent }} sent<template v-if="item.counts.failed + item.counts.bounced"> · <strong class="newsletters-failed">{{ item.counts.failed + item.counts.bounced }} not delivered</strong></template><template v-if="item.counts.complained"> · <strong class="newsletters-failed">{{ item.counts.complained }} spam</strong></template></span>
                  <span v-else-if="item.audienceName">To: {{ item.audienceName }}</span>
                  <span class="newsletters-sub">{{ when(item) }}</span>
                </span>
                <ChevronRight class="newsletters-chevron" aria-hidden="true" />
              </router-link>
            </li>
          </ul>
        </section>
      </template>

      <template v-else>
        <p v-if="audienceStatus === 'pending'" role="status">Loading audiences…</p>
        <section v-else-if="!audiences?.length" class="dv-panel newsletters-empty">
          <h2>No saved audiences</h2>
          <p>Save a selection you send to often, such as “Guests in Europe” or “Retail partners”, and pick it in one click.</p>
          <Button class="dv-button dv-button--primary" @click="editAudience()"><Plus class="size-4 mr-2" aria-hidden="true" />New audience</Button>
        </section>
        <section v-else class="dv-panel newsletters-group" aria-label="Saved audiences">
          <ul class="newsletters-list">
            <li v-for="audience in audiences" :key="audience.id" class="newsletters-audience">
              <button type="button" class="newsletters-row" @click="editAudience(audience)">
                <span class="newsletters-main">
                  <span class="newsletters-title">{{ audience.name }}</span>
                  <span class="newsletters-sub">{{ describeAudience(audience.filter, names) }}</span>
                </span>
                <span class="newsletters-meta"><span>{{ audience.count }} {{ audience.count === 1 ? 'person' : 'people' }} now</span></span>
                <ChevronRight class="newsletters-chevron" aria-hidden="true" />
              </button>
              <Button variant="ghost" size="icon" class="newsletters-remove" :aria-label="`Delete ${audience.name}`" @click="removing = audience"><Trash2 class="size-4" /></Button>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <Dialog :open="!!editing" @update:open="open => { if (!open && !savingAudience) editing = null }">
      <DialogContent class="dv-theme dv-admin admin-dialog admin-dialog--wide">
        <form v-if="editing" class="grid gap-5" @submit.prevent="saveAudience">
          <DialogHeader>
            <DialogTitle>{{ editing.id ? 'Edit audience' : 'New audience' }}</DialogTitle>
            <DialogDescription>Newsletters copy the audience when you pick it, so changing it here does not change newsletters already written.</DialogDescription>
          </DialogHeader>
          <div class="grid gap-2">
            <Label for="audience-name">Name</Label>
            <Input id="audience-name" v-model="editing.name" maxlength="120" placeholder="Guests in Europe" required />
          </div>
          <AudienceBuilder v-model="editing.filter" v-model:count="editingCount" />
          <p v-if="audienceError" class="admin-form-error" role="alert">{{ audienceError }}</p>
          <DialogFooter>
            <Button type="button" variant="outline" class="dv-button" :disabled="savingAudience" @click="editing = null">Cancel</Button>
            <Button type="submit" class="dv-button dv-button--primary" :disabled="savingAudience || !editing.name.trim()">{{ savingAudience ? 'Saving…' : 'Save audience' }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="!!removing" @update:open="open => { if (!open) removing = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{{ removing?.name }}”?</AlertDialogTitle>
          <AlertDialogDescription>Newsletters that used it keep their recipients.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" class="dv-button" @click="removeAudience">Delete audience</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
.newsletters { display:grid; gap:20px; max-width:960px; }
.newsletters-tabs { display:flex; gap:4px; border-bottom:1px solid var(--dv-color-line); }
.newsletters-tabs button { padding:8px 14px; font-size:var(--dv-size-body); color:var(--dv-text-secondary); border-bottom:2px solid transparent; margin-bottom:-1px; }
.newsletters-tabs button[aria-pressed=true] { color:var(--dv-text-primary); border-bottom-color:var(--dv-text-primary); font-weight:550; }
.newsletters-tabs button:focus-visible { outline:2px solid var(--dv-action-primary); outline-offset:-2px; }
.newsletters-empty { padding:32px 28px; display:grid; gap:12px; justify-items:start; }
.newsletters-empty h2, .newsletters-group h2 { font-size:var(--dv-size-section); }
.newsletters-empty p { color:var(--dv-text-secondary); font-size:var(--dv-size-body); max-width:60ch; }
.newsletters-group { padding:0; overflow:hidden; }
.newsletters-group h2 { padding:20px 28px 12px; }
.newsletters-list { list-style:none; margin:0; padding:0; }
.newsletters-list > li + li, .newsletters-group h2 + .newsletters-list > li:first-child { border-top:1px solid var(--dv-color-line); }
.newsletters-row { display:grid; grid-template-columns:minmax(0, 1.3fr) minmax(0, 1fr) 20px; align-items:center; gap:24px; width:100%; padding:16px 28px; color:inherit; text-decoration:none; text-align:left; }
.newsletters-row:hover { background:var(--dv-surface-canvas); }
.newsletters-row:focus-visible { outline:2px solid var(--dv-action-primary); outline-offset:-2px; }
.newsletters-main, .newsletters-meta { display:grid; gap:4px; min-width:0; font-size:var(--dv-size-caption); }
.newsletters-title { display:flex; align-items:center; gap:10px; font-weight:550; font-size:var(--dv-size-body); }
.newsletters-sub { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.newsletters-status { font-size:11px; font-weight:500; padding:2px 8px; background:var(--dv-surface-canvas); color:var(--dv-text-secondary); }
.newsletters-status[data-status=scheduled], .newsletters-status[data-status=sending] { background:var(--dv-action-soft); color:var(--dv-action-primary); }
.newsletters-status[data-status=sent] { background:#ecfdf3; color:#067647; }
.newsletters-failed { color:var(--dv-color-danger, #b42318); font-weight:500; }
.newsletters-chevron { width:18px; height:18px; color:var(--dv-text-secondary); }
.newsletters-audience { display:flex; align-items:center; }
.newsletters-audience .newsletters-row { flex:1; }
.newsletters-remove { margin-right:16px; color:var(--dv-text-secondary); }
.admin-resource-page :deep(.dv-button) { height:auto; padding:9px 14px; box-shadow:none; border-radius:0; }
@media(max-width:700px) {
  .newsletters-row { grid-template-columns:minmax(0, 1fr) 20px; padding:14px 20px; gap:12px; }
  .newsletters-meta { display:none; }
  .newsletters-group h2 { padding:16px 20px 8px; }
}
</style>
