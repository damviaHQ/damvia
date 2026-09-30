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
import RichTextEditor from "@/components/page-editor/RichTextEditor.vue"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc, type RouterOutput } from "@/services/server.ts"
import { emptyAudience, STATUS_LABELS, type AudienceFilter, type NewsletterStatus } from "@/utils/newsletter"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Braces, CalendarClock, Copy, Monitor, RotateCw, Send, Smartphone, Trash2 } from "@lucide/vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router"

type Newsletter = RouterOutput["newsletter"]["get"]
type Draft = { name: string, subject: string, preheader: string, heading: string, bodyHtml: string, audienceId: string | null, filter: AudienceFilter }
type TextField = 'subject' | 'preheader' | 'heading'
type RecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'bounced' | 'complained'

const route = useRoute()
const router = useRouter()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const id = computed(() => String(route.params.id))
const { data: newsletter, status, refetch } = useQuery({
  queryKey: computed(() => ['newsletter', id.value]),
  queryFn: () => trpc.newsletter.get.query(id.value),
  refetchInterval: (query) => query.state.data?.status === 'sending' ? 3000 : false,
})
const { data: audiences } = useQuery({ queryKey: ['newsletter-audiences'], queryFn: () => trpc.newsletter.audiences.query() })

const editable = computed(() => newsletter.value?.status === 'draft')
const step = ref<'compose' | 'audience' | 'review'>('compose')

function toDraft(source: Newsletter): Draft {
  const { name, subject, preheader, heading, bodyHtml, audienceId, filter } = source
  return { name, subject, preheader, heading, bodyHtml, audienceId, filter: { ...emptyAudience(), ...filter } }
}
const draft = ref<Draft>({ name: '', subject: '', preheader: '', heading: '', bodyHtml: '', audienceId: null, filter: emptyAudience() })
const saved = ref('')
watch(() => newsletter.value?.updatedAt, () => {
  if (!newsletter.value) return
  // A poll while sending must not wipe what is on screen.
  if (saved.value && JSON.stringify(draft.value) !== saved.value) return
  draft.value = toDraft(newsletter.value)
  saved.value = JSON.stringify(draft.value)
}, { immediate: true })
const isDirty = computed(() => !!newsletter.value && editable.value && JSON.stringify(draft.value) !== saved.value)

// Variables go where the cursor last was.
const lastField = ref<TextField | 'bodyHtml'>('bodyHtml')
const body = ref<InstanceType<typeof RichTextEditor> | null>(null)
const inputs: Partial<Record<TextField, HTMLInputElement>> = {}
function remember(field: TextField, event: FocusEvent) {
  lastField.value = field
  if (event.target instanceof HTMLInputElement) inputs[field] = event.target
}
async function insertVariable(name: string) {
  const token = `{{ ${name} }}`
  const field = lastField.value
  if (field === 'bodyHtml') return body.value?.insertText(token)
  const input = inputs[field]
  const value = draft.value[field]
  const start = input?.selectionStart ?? value.length
  const end = input?.selectionEnd ?? value.length
  draft.value[field] = value.slice(0, start) + token + value.slice(end)
  await nextTick()
  input?.focus()
  input?.setSelectionRange(start + token.length, start + token.length)
}

async function uploadImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, WebP or GIF image of up to 10 MB.')
  }
  const created = await trpc.newsletter.createImageUpload.mutate({ contentType: file.type as 'image/jpeg' })
  const form = new FormData()
  for (const [key, value] of Object.entries(created.fields)) form.append(key, value)
  form.append('file', file)
  const response = await fetch(created.url, { method: 'POST', body: form })
  if (!response.ok) throw new Error('The upload failed. Please try again.')
  try {
    return await trpc.newsletter.finalizeImageUpload.mutate({ uploadId: created.uploadId, newsletterId: id.value })
  } catch (error) {
    throw new Error(extractErrors(error as Error).message)
  }
}

const preview = ref<{ subject: string, html: string } | null>(null)
const previewError = ref('')
const previewWidth = ref<'desktop' | 'mobile'>('desktop')
let previewTimer: ReturnType<typeof setTimeout> | undefined
let previewRun = 0
async function refreshPreview() {
  if (!newsletter.value) return
  const run = ++previewRun
  const { subject, preheader, heading, bodyHtml } = draft.value
  try {
    const result = await trpc.newsletter.preview.mutate({ subject, preheader, heading, bodyHtml })
    if (run !== previewRun) return
    preview.value = result
    previewError.value = ''
  } catch (error) {
    if (run === previewRun) previewError.value = extractErrors(error as Error).message
  }
}
watch(() => [draft.value.subject, draft.value.preheader, draft.value.heading, draft.value.bodyHtml, !!newsletter.value], () => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(refreshPreview, 350)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(previewTimer))

// Picking a saved audience copies it; changing the copy afterwards makes it this newsletter's own.
const audienceCount = ref<number | null>(null)
const pickedAudience = computed(() => audiences.value?.find(audience => audience.id === draft.value.audienceId) ?? null)
function useAudience(audienceId: string) {
  const audience = audiences.value?.find(candidate => candidate.id === audienceId)
  if (audience) draft.value = { ...draft.value, audienceId: audience.id, filter: { ...audience.filter } }
}
watch(() => draft.value.filter, (filter) => {
  if (pickedAudience.value && JSON.stringify(filter) !== JSON.stringify(pickedAudience.value.filter)) draft.value.audienceId = null
}, { deep: true })
async function saveAsAudience() {
  const name = window.prompt('Name this audience', '')
  if (!name?.trim()) return
  try {
    const saved = await trpc.newsletter.saveAudience.mutate({ name: name.trim(), filter: draft.value.filter })
    await queryClient.invalidateQueries({ queryKey: ['newsletter-audiences'] })
    draft.value.audienceId = saved.id
    toast.success(`Saved as “${saved.name}”`)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  }
}

const busy = ref(false)
async function refreshAll() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['newsletters'] }),
    queryClient.invalidateQueries({ queryKey: ['newsletter', id.value] }),
  ])
}
async function save(quiet = false): Promise<boolean> {
  if (!isDirty.value) return true
  busy.value = true
  try {
    const result = await trpc.newsletter.update.mutate({ id: id.value, ...draft.value })
    draft.value.bodyHtml = result.bodyHtml
    saved.value = JSON.stringify(draft.value)
    await refreshAll()
    if (!quiet) toast.success('Newsletter saved')
    return true
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
    return false
  } finally { busy.value = false }
}
async function sendTest() {
  busy.value = true
  try {
    const { subject, preheader, heading, bodyHtml } = draft.value
    const result = await trpc.newsletter.sendTest.mutate({ subject, preheader, heading, bodyHtml })
    toast.success(`Test sent to ${result.sentTo}`)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { busy.value = false }
}

// Sending: now, or at a time in the admin's own time zone.
const when = ref<'now' | 'later'>('now')
const scheduleAt = ref('')
function localInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
const minimum = localInput(new Date(Date.now() + 5 * 60_000))
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const confirmOpen = ref(false)
const ready = computed(() => !!draft.value.subject.trim() && !!draft.value.bodyHtml && !previewError.value && (audienceCount.value ?? 0) > 0 && (when.value === 'now' || !!scheduleAt.value))
const blockers = computed(() => [
  !draft.value.subject.trim() && 'Write a subject.',
  !draft.value.bodyHtml && 'Write the message.',
  previewError.value && 'Fix the error shown in the preview.',
  !(audienceCount.value ?? 0) && 'Choose who receives it.',
  when.value === 'later' && !scheduleAt.value && 'Pick a date and time.',
].filter((item): item is string => !!item))
async function schedule() {
  confirmOpen.value = false
  if (!await save(true)) return
  busy.value = true
  try {
    const at = when.value === 'later' ? new Date(scheduleAt.value) : null
    const result = await trpc.newsletter.schedule.mutate({ id: id.value, at })
    saved.value = ''
    await refreshAll()
    toast.success(at ? `Scheduled for ${format(result.scheduledAt)}` : `Sending to ${result.recipients} people`)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { busy.value = false }
}
async function unschedule() {
  busy.value = true
  try {
    await trpc.newsletter.cancel.mutate(id.value)
    saved.value = ''
    await refreshAll()
    toast.success('Back to draft. Nothing was sent.')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { busy.value = false }
}
async function duplicate() {
  busy.value = true
  try {
    const copy = await trpc.newsletter.duplicate.mutate(id.value)
    await queryClient.invalidateQueries({ queryKey: ['newsletters'] })
    saved.value = ''
    router.push({ name: 'admin-newsletter', params: { id: copy.id } })
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { busy.value = false }
}
const removeOpen = ref(false)
async function remove() {
  busy.value = true
  try {
    await trpc.newsletter.remove.mutate(id.value)
    await queryClient.invalidateQueries({ queryKey: ['newsletters'] })
    saved.value = JSON.stringify(draft.value)
    router.push({ name: 'admin-newsletters' })
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { busy.value = false }
}
async function resume() {
  busy.value = true
  try {
    const result = await trpc.newsletter.resume.mutate(id.value)
    await refreshAll()
    await refetchRecipients()
    toast.success(result.retried ? `Trying ${result.retried} again` : 'Sending the rest')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { busy.value = false }
}

// Who it went to, once sending starts.
const recipientFilter = ref<RecipientStatus | undefined>(undefined)
const recipientSearch = ref('')
const recipientPage = ref(1)
const { data: recipients, refetch: refetchRecipients } = useQuery({
  queryKey: computed(() => ['newsletter-recipients', id.value, recipientFilter.value, recipientSearch.value, recipientPage.value]),
  queryFn: () => trpc.newsletter.recipients.query({ id: id.value, status: recipientFilter.value, search: recipientSearch.value || undefined, page: recipientPage.value, perPage: 50 }),
  enabled: computed(() => !!newsletter.value && ['sending', 'sent'].includes(newsletter.value.status)),
  refetchInterval: computed(() => newsletter.value?.status === 'sending' ? 3000 : false),
})
watch([recipientFilter, recipientSearch], () => { recipientPage.value = 1 })
const pages = computed(() => Math.max(1, Math.ceil((recipients.value?.total ?? 0) / 50)))

const format = (date: Date | string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
const progress = computed(() => {
  const counts = newsletter.value?.counts
  if (!counts?.total) return 0
  return Math.round((counts.total - counts.pending) / counts.total * 100)
})
const RECIPIENT_LABELS: Record<RecipientStatus, string> = { pending: 'Waiting', sent: 'Sent', failed: 'Failed', skipped: 'Skipped', bounced: 'Bounced', complained: 'Marked as spam' }

function guardUnload(event: BeforeUnloadEvent) {
  if (isDirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', guardUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnload))
onBeforeRouteLeave(() => !isDirty.value || window.confirm('Leave without saving your changes to this newsletter?'))
</script>

<template>
  <div class="admin-page newsletter-edit">
    <AdminPageHeader :title="newsletter?.name ?? 'Newsletter'" :description="newsletter ? STATUS_LABELS[newsletter.status as NewsletterStatus] + (newsletter.status === 'scheduled' && newsletter.scheduledAt ? ` for ${format(newsletter.scheduledAt)}` : '') : undefined">
      <template v-if="editable">
        <Button variant="ghost" class="dv-button" :disabled="busy" aria-label="Delete draft" title="Delete draft" @click="removeOpen = true"><Trash2 class="size-4" /></Button>
        <Button variant="outline" class="dv-button" :disabled="busy || !!previewError || !draft.subject.trim()" @click="sendTest">
          <Send class="size-4 mr-2" aria-hidden="true" />Send me a test
        </Button>
        <Button class="dv-button dv-button--primary" :disabled="!isDirty || busy || !draft.name.trim()" @click="save()">{{ busy ? 'Saving…' : 'Save' }}</Button>
      </template>
      <template v-else-if="newsletter">
        <Button v-if="newsletter.status === 'scheduled'" variant="outline" class="dv-button" :disabled="busy" @click="unschedule">Unschedule and edit</Button>
        <Button v-if="newsletter.status === 'sent' && newsletter.counts.failed" variant="outline" class="dv-button" :disabled="busy" @click="resume">
          <RotateCw class="size-4 mr-2" aria-hidden="true" />Retry {{ newsletter.counts.failed }} failed
        </Button>
        <Button variant="outline" class="dv-button" :disabled="busy" @click="duplicate"><Copy class="size-4 mr-2" aria-hidden="true" />Duplicate</Button>
      </template>
    </AdminPageHeader>

    <p v-if="status === 'pending'" role="status">Loading newsletter…</p>
    <div v-else-if="status === 'error'" role="alert">This newsletter could not be loaded. <Button class="dv-button" variant="outline" @click="refetch()">Try again</Button></div>
    <div v-else-if="newsletter" class="newsletter-grid">
      <div class="newsletter-main">
        <!-- Sending or sent: what happened, person by person. -->
        <section v-if="!editable" class="dv-panel newsletter-panel" aria-labelledby="delivery-heading">
          <h2 id="delivery-heading">{{ newsletter.status === 'scheduled' ? 'Scheduled' : 'Delivery' }}</h2>
          <template v-if="newsletter.status === 'scheduled'">
            <p class="newsletter-help">It goes out on <strong>{{ format(newsletter.scheduledAt!) }}</strong> to everyone matching the audience at that moment. Unschedule it to make changes.</p>
          </template>
          <template v-else>
            <div class="newsletter-progress" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" :aria-label="`${progress}% processed`">
              <span :style="{ width: `${progress}%` }" />
            </div>
            <dl class="newsletter-stats">
              <div><dt>Recipients</dt><dd>{{ newsletter.counts.total }}</dd></div>
              <div><dt>Sent</dt><dd>{{ newsletter.counts.sent }}</dd></div>
              <div><dt>Failed</dt><dd :class="{ 'is-failed': newsletter.counts.failed > 0 }">{{ newsletter.counts.failed }}</dd></div>
              <div><dt>Skipped</dt><dd>{{ newsletter.counts.skipped }}</dd></div>
              <div><dt>Bounced</dt><dd :class="{ 'is-failed': newsletter.counts.bounced > 0 }">{{ newsletter.counts.bounced }}</dd></div>
              <div><dt>Marked as spam</dt><dd :class="{ 'is-failed': newsletter.counts.complained > 0 }">{{ newsletter.counts.complained }}</dd></div>
            </dl>
            <p class="newsletter-help">
              <template v-if="newsletter.status === 'sending' && newsletter.pace.remaining === 0 && newsletter.pace.nextAt">The daily limit of {{ newsletter.pace.limit?.toLocaleString() }} emails is reached. Sending resumes by itself around {{ format(newsletter.pace.nextAt) }}.</template>
              <template v-else-if="newsletter.status === 'sending'">Sending, paced to stay within your mail provider's limits. You can leave this page.</template>
              <template v-else-if="newsletter.sentAt">Finished {{ format(newsletter.sentAt) }}.</template>
              Skipped people unsubscribed or lost access before their turn. “Sent” means your mail server accepted the message. Bounces and spam reports appear once your mail provider reports them; see the Emails settings.
            </p>
            <div class="newsletter-recipients-bar">
              <div class="newsletter-chips" role="group" aria-label="Show recipients">
                <button type="button" class="newsletter-chip" :aria-pressed="!recipientFilter" @click="recipientFilter = undefined">All</button>
                <button v-for="(label, key) in RECIPIENT_LABELS" :key="key" type="button" class="newsletter-chip" :aria-pressed="recipientFilter === key" @click="recipientFilter = key">{{ label }}</button>
              </div>
              <Input v-model="recipientSearch" type="search" class="newsletter-search" placeholder="Search name or email" aria-label="Search recipients" />
            </div>
            <table class="dv-table newsletter-recipients">
              <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Status</th></tr></thead>
              <tbody>
                <tr v-for="recipient in recipients?.items ?? []" :key="recipient.id">
                  <td>{{ recipient.name }}</td>
                  <td>{{ recipient.email }}</td>
                  <td><span class="newsletter-recipient-status" :data-status="recipient.status">{{ RECIPIENT_LABELS[recipient.status] }}</span><span v-if="recipient.error" class="newsletter-recipient-error">{{ recipient.error }}</span></td>
                </tr>
                <tr v-if="recipients && !recipients.items.length"><td colspan="3" class="newsletter-help">Nobody here.</td></tr>
              </tbody>
            </table>
            <div v-if="pages > 1" class="newsletter-pages">
              <Button variant="outline" size="sm" class="dv-button" :disabled="recipientPage <= 1" @click="recipientPage--">Previous</Button>
              <span>Page {{ recipientPage }} of {{ pages }}</span>
              <Button variant="outline" size="sm" class="dv-button" :disabled="recipientPage >= pages" @click="recipientPage++">Next</Button>
            </div>
          </template>
        </section>

        <template v-else>
          <nav class="newsletter-steps" aria-label="Steps">
            <button v-for="(label, key, index) in { compose: 'Compose', audience: 'Audience', review: 'Review and send' }" :key="key" type="button"
              :aria-current="step === key ? 'step' : undefined" @click="step = key">
              <span class="newsletter-step-number">{{ index + 1 }}</span>{{ label }}
            </button>
          </nav>

          <form v-show="step === 'compose'" class="dv-panel newsletter-panel newsletter-form" @submit.prevent="save()">
            <div class="newsletter-field">
              <Label for="newsletter-name">Name <span class="optional">only admins see it</span></Label>
              <Input id="newsletter-name" v-model="draft.name" maxlength="120" />
            </div>
            <div class="newsletter-field">
              <Label for="newsletter-subject">Subject</Label>
              <Input id="newsletter-subject" v-model="draft.subject" maxlength="300" placeholder="What is new this month" @focus="remember('subject', $event)" />
            </div>
            <div class="newsletter-field">
              <Label for="newsletter-preheader">Preview text <span class="optional">shown after the subject in most inboxes</span></Label>
              <Input id="newsletter-preheader" v-model="draft.preheader" maxlength="300" @focus="remember('preheader', $event)" />
            </div>
            <div class="newsletter-field">
              <Label for="newsletter-heading">Heading <span class="optional">optional</span></Label>
              <Input id="newsletter-heading" v-model="draft.heading" maxlength="300" @focus="remember('heading', $event)" />
            </div>
            <div class="newsletter-field">
              <span class="newsletter-label" id="newsletter-body-label">Message</span>
              <div class="newsletter-body" aria-labelledby="newsletter-body-label" @focusin="lastField = 'bodyHtml'">
                <RichTextEditor ref="body" v-model="draft.bodyHtml" :upload-image="uploadImage" placeholder="Write the message…" />
              </div>
            </div>
            <div class="newsletter-variables" aria-labelledby="variables-heading">
              <h2 id="variables-heading"><Braces class="size-4" aria-hidden="true" />Personalise</h2>
              <ul>
                <li v-for="variable in newsletter.variables" :key="variable.name">
                  <button type="button" class="newsletter-variable" :title="variable.description" @mousedown.prevent @click="insertVariable(variable.name)">
                    <code>{{ variable.name }}</code><span>{{ variable.description }}</span>
                  </button>
                </li>
              </ul>
            </div>
            <div class="newsletter-next"><Button type="button" class="dv-button" variant="outline" @click="step = 'audience'">Next: audience</Button></div>
          </form>

          <section v-show="step === 'audience'" class="dv-panel newsletter-panel" aria-labelledby="audience-heading">
            <div class="newsletter-audience-head">
              <h2 id="audience-heading">Who receives it</h2>
              <div v-if="audiences?.length" class="newsletter-saved">
                <label for="newsletter-saved-audience" class="sr-only">Use a saved audience</label>
                <select id="newsletter-saved-audience" class="dv-select" :value="draft.audienceId ?? ''" @change="useAudience(($event.target as HTMLSelectElement).value)">
                  <option value="" disabled>{{ draft.audienceId ? '' : 'Use a saved audience…' }}</option>
                  <option v-for="audience in audiences" :key="audience.id" :value="audience.id">{{ audience.name }} ({{ audience.count }})</option>
                </select>
              </div>
            </div>
            <AudienceBuilder v-model="draft.filter" v-model:count="audienceCount" />
            <div class="newsletter-next">
              <Button type="button" variant="ghost" class="dv-button" :disabled="!(audienceCount ?? 0)" @click="saveAsAudience">Save as audience…</Button>
              <Button type="button" variant="outline" class="dv-button" @click="step = 'review'">Next: review</Button>
            </div>
          </section>

          <section v-show="step === 'review'" class="dv-panel newsletter-panel" aria-labelledby="review-heading">
            <h2 id="review-heading">Review and send</h2>
            <dl class="newsletter-review">
              <div><dt>Subject</dt><dd>{{ preview?.subject || draft.subject || '—' }}</dd></div>
              <div><dt>Recipients</dt><dd>{{ audienceCount ?? '—' }}<template v-if="pickedAudience"> · {{ pickedAudience.name }}</template> <button type="button" class="newsletter-link" @click="step = 'audience'">Change</button></dd></div>
            </dl>
            <fieldset class="newsletter-when">
              <legend>When</legend>
              <label><input v-model="when" type="radio" value="now" /> Send now</label>
              <label><input v-model="when" type="radio" value="later" /> Schedule</label>
              <div v-if="when === 'later'" class="newsletter-field">
                <Label for="newsletter-at">Date and time <span class="optional">{{ timeZone }}</span></Label>
                <Input id="newsletter-at" v-model="scheduleAt" type="datetime-local" :min="minimum" />
              </div>
            </fieldset>
            <p v-if="newsletter.pace.limit && (audienceCount ?? 0) > (newsletter.pace.remaining ?? 0)" class="newsletter-pace" role="note">
              To protect your domain's reputation, at most {{ newsletter.pace.limit.toLocaleString() }} newsletter emails leave a day.
              {{ (newsletter.pace.remaining ?? 0).toLocaleString() }} can go now; the rest follow over the next {{ Math.ceil(((audienceCount ?? 0) - (newsletter.pace.remaining ?? 0)) / newsletter.pace.limit) }} day(s), automatically.
            </p>
            <ul v-if="blockers.length" class="newsletter-blockers">
              <li v-for="blocker in blockers" :key="blocker">{{ blocker }}</li>
            </ul>
            <p class="newsletter-help">Send yourself a test first: links, images and the unsubscribe link are checked best in a real inbox.</p>
            <div class="newsletter-next">
              <Button class="dv-button dv-button--primary" :disabled="!ready || busy" @click="confirmOpen = true">
                <CalendarClock v-if="when === 'later'" class="size-4 mr-2" aria-hidden="true" /><Send v-else class="size-4 mr-2" aria-hidden="true" />
                {{ when === 'later' ? 'Schedule' : 'Send now' }}
              </Button>
            </div>
          </section>
        </template>
      </div>

      <section class="newsletter-preview" aria-label="Preview">
        <div class="newsletter-preview-bar">
          <div class="newsletter-preview-subject">
            <span>Subject</span>
            <strong>{{ preview?.subject || draft.subject || 'No subject yet' }}</strong>
          </div>
          <div class="newsletter-preview-toggle" role="group" aria-label="Preview width">
            <button type="button" :aria-pressed="previewWidth === 'desktop'" aria-label="Desktop" title="Desktop" @click="previewWidth = 'desktop'"><Monitor class="size-4" /></button>
            <button type="button" :aria-pressed="previewWidth === 'mobile'" aria-label="Phone" title="Phone" @click="previewWidth = 'mobile'"><Smartphone class="size-4" /></button>
          </div>
        </div>
        <p v-if="previewError" class="newsletter-preview-error" role="alert">{{ previewError }}</p>
        <div class="newsletter-preview-frame" :class="`is-${previewWidth}`">
          <iframe v-if="preview" title="Newsletter preview" sandbox="" :srcdoc="preview.html" />
        </div>
        <p class="newsletter-help">Shown with your own name. Your logo, accent colour and footer come from <router-link :to="{ name: 'admin-settings' }">Settings</router-link> and <router-link :to="{ name: 'admin-emails' }">Emails</router-link>.</p>
      </section>
    </div>

    <AlertDialog :open="confirmOpen" @update:open="open => confirmOpen = open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ when === 'later' ? 'Schedule' : 'Send' }} to {{ audienceCount }} {{ audienceCount === 1 ? 'person' : 'people' }}?</AlertDialogTitle>
          <AlertDialogDescription>
            <template v-if="when === 'later'">It goes out on {{ scheduleAt && format(new Date(scheduleAt)) }}. You can unschedule it until then.</template>
            <template v-else>Sending starts within a minute and cannot be stopped once it has begun.</template>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button class="dv-button dv-button--primary" @click="schedule">{{ when === 'later' ? 'Schedule' : 'Send now' }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="removeOpen" @update:open="open => removeOpen = open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>“{{ newsletter?.name }}” is deleted. Nothing has been sent.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" class="dv-button" @click="remove">Delete draft</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
.newsletter-grid { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.05fr); gap:24px; align-items:start; }
.newsletter-main { display:grid; gap:16px; min-width:0; }
.newsletter-panel { padding:28px; display:grid; gap:18px; }
.newsletter-panel h2 { font-size:var(--dv-size-section); }
.newsletter-field { display:grid; gap:8px; }
.newsletter-label { font-size:var(--dv-size-body); font-weight:500; }
.optional { color:var(--dv-text-secondary); font-weight:400; font-size:var(--dv-size-caption); margin-left:4px; }
.newsletter-help { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.newsletter-help a { text-decoration:underline; }
.newsletter-steps { display:flex; gap:4px; border-bottom:1px solid var(--dv-color-line); }
.newsletter-steps button { display:flex; align-items:center; gap:8px; padding:8px 14px; font-size:var(--dv-size-body); color:var(--dv-text-secondary); border-bottom:2px solid transparent; margin-bottom:-1px; }
.newsletter-steps button[aria-current=step] { color:var(--dv-text-primary); border-bottom-color:var(--dv-text-primary); font-weight:550; }
.newsletter-steps button:focus-visible { outline:2px solid var(--dv-action-primary); outline-offset:-2px; }
.newsletter-step-number { display:grid; place-items:center; width:20px; height:20px; border-radius:999px; background:var(--dv-surface-canvas); font-size:11px; }
.newsletter-steps button[aria-current=step] .newsletter-step-number { background:var(--dv-text-primary); color:white; }
.newsletter-body { border:1px solid hsl(var(--input)); padding:12px 14px; min-height:260px; background:white; font-size:var(--dv-size-body); }
.newsletter-body:focus-within { outline:2px solid hsl(var(--ring)); outline-offset:1px; }
.newsletter-body :deep(.tiptap) { min-height:200px; }
.newsletter-body :deep(h1) { font-size:1.25rem; }
.newsletter-body :deep(h2) { font-size:1.125rem; }
.newsletter-body :deep(h3), .newsletter-body :deep(h4) { font-size:1rem; }
.newsletter-variables { border-top:1px solid var(--dv-color-line); padding-top:18px; }
.newsletter-variables h2 { display:flex; align-items:center; gap:8px; font-size:var(--dv-size-body); font-weight:600; }
.newsletter-variables ul { list-style:none; margin:10px 0 0; padding:0; display:flex; flex-wrap:wrap; gap:6px; }
.newsletter-variable { display:flex; align-items:baseline; gap:8px; border:1px solid var(--dv-color-line); background:white; padding:6px 10px; cursor:pointer; }
.newsletter-variable:hover { border-color:var(--dv-action-primary); }
.newsletter-variable:focus-visible { outline:2px solid var(--dv-action-primary); outline-offset:1px; }
.newsletter-variable code { font-size:var(--dv-size-caption); color:var(--dv-action-primary); white-space:nowrap; }
.newsletter-variable span { font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.newsletter-next { display:flex; justify-content:flex-end; gap:8px; }
.newsletter-audience-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.newsletter-review { display:grid; gap:10px; }
.newsletter-review div { display:grid; grid-template-columns:110px minmax(0, 1fr); gap:12px; font-size:var(--dv-size-body); }
.newsletter-review dt { color:var(--dv-text-secondary); }
.newsletter-link { text-decoration:underline; color:var(--dv-action-primary); margin-left:6px; font-size:var(--dv-size-caption); }
.newsletter-when { display:grid; gap:10px; border:0; padding:0; margin:0; }
.newsletter-when legend { font-size:var(--dv-size-body); font-weight:500; margin-bottom:6px; }
.newsletter-when label { display:flex; align-items:center; gap:8px; font-size:var(--dv-size-body); }
.newsletter-when .newsletter-field { max-width:280px; margin-left:24px; }
.newsletter-pace { padding:10px 14px; background:var(--dv-action-soft); font-size:var(--dv-size-caption); }
.newsletter-blockers { margin:0; padding:10px 14px 10px 30px; background:#fffaeb; color:#93370d; font-size:var(--dv-size-caption); list-style:disc; }
.newsletter-progress { height:8px; background:var(--dv-surface-canvas); overflow:hidden; }
.newsletter-progress span { display:block; height:100%; background:var(--dv-action-primary); transition:width .3s ease; }
.newsletter-stats { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
.newsletter-stats div { border:1px solid var(--dv-color-line); padding:12px; }
.newsletter-stats dt { font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.newsletter-stats dd { font-size:1.375rem; font-weight:600; font-variant-numeric:tabular-nums; }
.newsletter-stats dd.is-failed { color:var(--dv-color-danger, #b42318); }
.newsletter-recipients-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.newsletter-chips { display:flex; flex-wrap:wrap; gap:6px; }
.newsletter-chip { min-height:30px; padding:3px 12px; border:1px solid var(--dv-color-line); background:white; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.newsletter-chip[aria-pressed=true] { border-color:var(--dv-text-primary); background:var(--dv-surface-canvas); color:var(--dv-text-primary); }
.newsletter-search { max-width:240px; }
.newsletter-recipients { width:100%; font-size:var(--dv-size-caption); }
.newsletter-recipients th { text-align:left; font-weight:500; color:var(--dv-text-secondary); padding:8px 10px; border-bottom:1px solid var(--dv-color-line); }
.newsletter-recipients td { padding:8px 10px; border-bottom:1px solid var(--dv-color-line); vertical-align:top; overflow-wrap:anywhere; }
.newsletter-recipient-status { font-weight:500; }
.newsletter-recipient-status[data-status=failed], .newsletter-recipient-status[data-status=bounced], .newsletter-recipient-status[data-status=complained] { color:var(--dv-color-danger, #b42318); }
.newsletter-recipient-status[data-status=sent] { color:#067647; }
.newsletter-recipient-error { display:block; color:var(--dv-text-secondary); margin-top:2px; }
.newsletter-pages { display:flex; align-items:center; justify-content:flex-end; gap:12px; font-size:var(--dv-size-caption); }
.newsletter-preview { position:sticky; top:16px; display:grid; gap:12px; }
.newsletter-preview-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.newsletter-preview-subject { display:grid; gap:2px; min-width:0; }
.newsletter-preview-subject span { font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.newsletter-preview-subject strong { font-size:var(--dv-size-body); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.newsletter-preview-toggle { display:flex; border:1px solid var(--dv-color-line); background:white; }
.newsletter-preview-toggle button { display:grid; place-items:center; width:36px; height:32px; color:var(--dv-text-secondary); }
.newsletter-preview-toggle button[aria-pressed="true"] { background:var(--dv-action-soft); color:var(--dv-action-primary); }
.newsletter-preview-error { color:var(--dv-color-danger, #b42318); font-size:var(--dv-size-caption); border:1px solid currentColor; padding:8px 12px; background:white; }
.newsletter-preview-frame { background:#f4f4f5; border:1px solid var(--dv-color-line); height:calc(100vh - 220px); min-height:520px; display:flex; justify-content:center; overflow:hidden; }
.newsletter-preview-frame iframe { border:0; width:100%; height:100%; background:#f4f4f5; transition:width .2s ease; }
.newsletter-preview-frame.is-mobile iframe { width:375px; border-left:1px solid var(--dv-color-line); border-right:1px solid var(--dv-color-line); }
.newsletter-edit :deep(.dv-button) { height:auto; padding:9px 14px; box-shadow:none; border-radius:0; }
@media(max-width:1100px) {
  .newsletter-grid { grid-template-columns:1fr; }
  .newsletter-preview { position:static; }
  .newsletter-preview-frame { height:640px; }
}
@media(max-width:600px) {
  .newsletter-panel { padding:20px; }
  .newsletter-stats { grid-template-columns:repeat(2, minmax(0, 1fr)); }
}
</style>
