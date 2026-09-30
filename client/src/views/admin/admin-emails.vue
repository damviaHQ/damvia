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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, XCircle } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const { data: templates, status, refetch } = useQuery({ queryKey: ['email-templates'], queryFn: () => trpc.emailTemplate.list.query() })
const { data: settings } = useQuery({ queryKey: ['email-settings'], queryFn: () => trpc.emailTemplate.getSettings.query() })

// What the sender domain publishes, looked up again after the sender changes.
const selector = ref('')
const checkedSelector = ref('')
const { data: domain, error: domainError, isFetching: checkingDomain, refetch: recheckDomain } = useQuery({
  queryKey: computed(() => ['email-domain', settings.value?.effectiveFrom.address, checkedSelector.value]),
  queryFn: () => trpc.emailTemplate.checkDomain.query({ selector: checkedSelector.value || undefined }),
  enabled: computed(() => !!settings.value),
  staleTime: 60_000,
  retry: false,
})
function checkSelector() {
  if (checkedSelector.value === selector.value.trim()) recheckDomain()
  else checkedSelector.value = selector.value.trim()
}
const STATUS_LABELS = { ok: 'Set up', warning: 'Needs attention', missing: 'Missing' } as const

const groups = [
  { key: 'account', title: 'Account', description: 'Sign-up, sign-in and approval.' },
  { key: 'sharing', title: 'Sharing and downloads', description: 'Invitations to collections and prepared downloads.' },
  { key: 'alerts', title: 'Alerts', description: 'Sent to administrators only.' },
] as const
const grouped = computed(() => groups.map((group) => ({ ...group, items: (templates.value ?? []).filter((item) => item.group === group.key) })))

const sender = ref({ senderName: '', senderAddress: '', replyTo: '', footerText: '' })
const senderErrors = ref<Record<string, string>>({})
const isSavingSender = ref(false)
watch(settings, () => {
  if (!settings.value) return
  sender.value = {
    senderName: settings.value.senderName ?? '',
    senderAddress: settings.value.senderAddress ?? '',
    replyTo: settings.value.replyTo ?? '',
    footerText: settings.value.footerText,
  }
}, { immediate: true })

async function saveSender() {
  isSavingSender.value = true
  senderErrors.value = {}
  try {
    await trpc.emailTemplate.updateSettings.mutate({
      senderName: sender.value.senderName.trim() || null,
      senderAddress: sender.value.senderAddress.trim() || null,
      replyTo: sender.value.replyTo.trim() || null,
      footerText: sender.value.footerText,
    })
    await queryClient.invalidateQueries({ queryKey: ['email-settings'] })
    toast.success('Sender saved')
  } catch (error) {
    const result = extractErrors(error as Error)
    senderErrors.value = result.fieldErrors
    if (!Object.keys(result.fieldErrors).length) toast.error(result.message)
  } finally { isSavingSender.value = false }
}

function edited(date: Date | string | null, by: string | null) {
  if (!date) return ''
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date))
  return by ? `Edited ${when} by ${by}` : `Edited ${when}`
}
</script>

<template>
  <div class="admin-page admin-resource-page">
    <div class="emails-sections">
      <AdminPageHeader description="Every email Damvia sends uses your logo and accent colour. Edit the wording of each one; the layout stays consistent." />

      <section class="dv-panel emails-panel" aria-labelledby="sender-heading">
        <h2 id="sender-heading">Sender</h2>
        <p>Who the emails come from, and the line printed at the bottom of each one.</p>
        <form class="sender-form" :aria-busy="isSavingSender" @submit.prevent="saveSender">
          <div class="sender-fields">
            <div class="sender-field">
              <Label for="senderName">Name</Label>
              <Input id="senderName" v-model="sender.senderName" maxlength="120" placeholder="Your brand name" />
            </div>
            <div class="sender-field">
              <Label for="senderAddress">Address</Label>
              <Input id="senderAddress" v-model="sender.senderAddress" type="email" placeholder="assets@yourbrand.com" :aria-invalid="!!senderErrors.senderAddress" />
              <p v-if="senderErrors.senderAddress" class="admin-form-error">{{ senderErrors.senderAddress }}</p>
            </div>
            <div class="sender-field">
              <Label for="replyTo">Replies go to <span class="optional">optional</span></Label>
              <Input id="replyTo" v-model="sender.replyTo" type="email" placeholder="support@yourbrand.com" :aria-invalid="!!senderErrors.replyTo" />
              <p v-if="senderErrors.replyTo" class="admin-form-error">{{ senderErrors.replyTo }}</p>
            </div>
          </div>
          <div class="sender-field">
            <Label for="footerText">Footer <span class="optional">optional</span></Label>
            <textarea id="footerText" v-model="sender.footerText" rows="2" maxlength="1000" class="dv-textarea" placeholder="Your company · 12 Main Street, City" />
          </div>
          <p v-if="settings" class="emails-note">Emails currently go out as <strong>{{ settings.effectiveFrom.name }} &lt;{{ settings.effectiveFrom.address }}&gt;</strong>. The address must be allowed by your mail provider, or messages will be rejected or land in spam.</p>
          <div><Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingSender">{{ isSavingSender ? 'Saving…' : 'Save sender' }}</Button></div>
        </form>
      </section>

      <section class="dv-panel emails-panel" aria-labelledby="domain-heading">
        <div class="domain-head">
          <div>
            <h2 id="domain-heading">Sender domain<template v-if="domain?.domain">: {{ domain.domain }}</template></h2>
            <p>Receivers check these DNS records before trusting an email. Without them, emails land in spam and the domain loses its reputation.<template v-if="settings?.provider"> Emails go through {{ settings.provider }}.</template></p>
          </div>
          <Button variant="outline" class="dv-button" :disabled="checkingDomain" @click="recheckDomain()"><RefreshCw class="size-4 mr-2" aria-hidden="true" />{{ checkingDomain ? 'Checking…' : 'Check again' }}</Button>
        </div>
        <p v-if="domainError && !checkingDomain" class="domain-problem" role="alert">{{ extractErrors(domainError).message }}</p>
        <p v-else-if="domain?.problem" class="domain-problem" role="alert">{{ domain.problem }}</p>
        <ul v-else-if="domain" class="domain-checks">
          <li v-for="check in domain.checks" :key="check.key" :data-status="check.status">
            <CheckCircle2 v-if="check.status === 'ok'" class="domain-icon" aria-hidden="true" />
            <AlertTriangle v-else-if="check.status === 'warning'" class="domain-icon" aria-hidden="true" />
            <XCircle v-else class="domain-icon" aria-hidden="true" />
            <div class="domain-body">
              <p class="domain-title"><strong>{{ check.label }}</strong><span>{{ STATUS_LABELS[check.status] }}</span></p>
              <code v-for="value in check.found" :key="value">{{ value }}</code>
              <p v-if="check.advice" class="domain-advice">{{ check.advice }}</p>
              <form v-if="check.key === 'dkim'" class="domain-selector" @submit.prevent="checkSelector">
                <Label for="dkim-selector" class="sr-only">DKIM selector</Label>
                <Input id="dkim-selector" v-model="selector" placeholder="Selector, such as 20260901pm" maxlength="63" />
                <Button type="submit" variant="outline" class="dv-button" :disabled="checkingDomain">Check selector</Button>
              </form>
            </div>
          </li>
        </ul>
        <div v-if="settings" class="domain-events" :data-status="settings.emailEvents.enabled ? 'ok' : 'warning'">
          <p class="domain-title"><strong>Bounce and spam reports</strong><span>{{ settings.emailEvents.enabled ? 'Connected' : 'Not connected' }}</span></p>
          <p v-if="settings.emailEvents.enabled" class="domain-advice">
            Your mail provider posts them to <code>{{ settings.emailEvents.url }}…</code>
            <template v-if="settings.emailEvents.lastAt"> Last report {{ new Date(settings.emailEvents.lastAt).toLocaleString() }}.</template><template v-else> No report received yet.</template>
            {{ settings.emailEvents.bounced }} {{ settings.emailEvents.bounced === 1 ? 'address is' : 'addresses are' }} paused after a bounce; they show as <strong>Bounced</strong> in Users.
          </p>
          <p v-else class="domain-advice">Without them, addresses that bounce keep being sent to, and people who mark newsletters as spam keep receiving them, which harms the domain's reputation. The host sets <code>EMAIL_EVENTS_SECRET</code> and gives your provider the address <code>{{ settings.emailEvents.url }}&lt;secret&gt;</code>.</p>
        </div>
        <p v-if="settings" class="emails-note">
          Newsletters leave at {{ settings.newsletterPace.perSecond }} a second<template v-if="settings.newsletterPace.perDay">, at most {{ settings.newsletterPace.perDay.toLocaleString() }} a day; a bigger audience is spread over the following days</template><template v-else>, with no daily limit</template>.
          A new domain earns trust slowly: start with small sends. The host sets both limits (<code>NEWSLETTER_RATE_PER_SECOND</code>, <code>NEWSLETTER_DAILY_LIMIT</code>).
        </p>
      </section>

      <p v-if="status === 'pending'" role="status">Loading emails…</p>
      <div v-else-if="status === 'error'" role="alert">The emails could not be loaded. <Button class="dv-button" variant="outline" @click="refetch()">Try again</Button></div>
      <section v-for="group in grouped" v-else :key="group.key" class="dv-panel emails-group" :aria-labelledby="`group-${group.key}`">
        <header class="emails-group-header">
          <h2 :id="`group-${group.key}`">{{ group.title }}</h2>
          <p>{{ group.description }}</p>
        </header>
        <ul class="emails-list">
          <li v-for="item in group.items" :key="item.key">
            <router-link :to="{ name: 'admin-email', params: { key: item.key } }" class="emails-row">
              <span class="emails-row-main">
                <span class="emails-row-title">
                  {{ item.label }}
                  <span v-if="item.customised" class="emails-badge">Customised</span>
                </span>
                <span class="emails-row-trigger">{{ item.trigger }}</span>
              </span>
              <span class="emails-row-meta">
                <span class="emails-row-recipients">To: {{ item.recipients }}</span>
                <span v-if="item.customised" class="emails-row-edited">{{ edited(item.updatedAt, item.updatedBy) }}</span>
              </span>
              <ChevronRight class="emails-row-chevron" aria-hidden="true" />
            </router-link>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.emails-sections { display:grid; gap:24px; max-width:960px; }
.emails-panel { padding:28px; }
.emails-panel h2, .emails-group-header h2 { font-size:var(--dv-size-section); }
.emails-panel > p, .emails-group-header p { color:var(--dv-text-secondary); font-size:var(--dv-size-body); margin-top:6px; }
.sender-form { display:grid; gap:16px; margin-top:20px; }
.sender-fields { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; }
.sender-field { display:grid; gap:8px; align-content:start; }
.sender-field .admin-form-error { margin:0; }
.optional { color:var(--dv-text-secondary); font-weight:400; font-size:var(--dv-size-caption); margin-left:4px; }
.dv-textarea { width:100%; border:1px solid hsl(var(--input)); padding:8px 12px; font:inherit; font-size:var(--dv-size-body); resize:vertical; background:white; }
.dv-textarea:focus-visible { outline:2px solid hsl(var(--ring)); outline-offset:1px; }
.emails-note { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.emails-group { padding:0; overflow:hidden; }
.emails-group-header { padding:24px 28px 16px; }
.emails-list { list-style:none; margin:0; padding:0; }
.emails-list li + li .emails-row, .emails-list li:first-child .emails-row { border-top:1px solid var(--dv-color-line); }
.emails-row { display:grid; grid-template-columns:minmax(0, 1.1fr) minmax(0, 1fr) 20px; align-items:center; gap:24px; padding:16px 28px; color:inherit; text-decoration:none; }
.emails-row:hover { background:var(--dv-surface-canvas); }
.emails-row:focus-visible { outline:2px solid var(--dv-action-primary); outline-offset:-2px; }
.emails-row-main, .emails-row-meta { display:grid; gap:4px; min-width:0; }
.emails-row-title { display:flex; align-items:center; gap:10px; font-weight:550; font-size:var(--dv-size-body); }
.emails-row-trigger, .emails-row-edited { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.emails-row-recipients { font-size:var(--dv-size-caption); color:var(--dv-text-primary); }
.emails-badge { font-size:11px; font-weight:500; padding:2px 8px; background:var(--dv-action-soft); color:var(--dv-action-primary); }
.emails-row-chevron { width:18px; height:18px; color:var(--dv-text-secondary); }
.domain-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.domain-problem { margin-top:16px; padding:10px 14px; background:#fffaeb; color:#93370d; font-size:var(--dv-size-body); }
.domain-checks { list-style:none; margin:20px 0 16px; padding:0; border:1px solid var(--dv-color-line); }
.domain-checks li { display:flex; gap:12px; padding:14px 16px; }
.domain-checks li + li { border-top:1px solid var(--dv-color-line); }
.domain-icon { width:18px; height:18px; flex-shrink:0; margin-top:2px; }
.domain-checks [data-status=ok] .domain-icon { color:#067647; }
.domain-checks [data-status=warning] .domain-icon { color:#b54708; }
.domain-checks [data-status=missing] .domain-icon { color:var(--dv-color-danger, #b42318); }
.domain-body { display:grid; gap:6px; min-width:0; flex:1; }
.domain-title { display:flex; gap:10px; align-items:baseline; font-size:var(--dv-size-body); }
.domain-title span { font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.domain-body code { font-size:var(--dv-size-caption); background:var(--dv-surface-canvas); padding:4px 8px; overflow-wrap:anywhere; }
.domain-advice { font-size:var(--dv-size-caption); color:var(--dv-text-primary); }
.domain-selector { display:flex; gap:8px; max-width:420px; }
.emails-note code, .domain-events code { font-size:inherit; overflow-wrap:anywhere; }
.domain-events { display:grid; gap:4px; padding:14px 16px; margin-bottom:16px; border:1px solid var(--dv-color-line); }
.domain-events[data-status=warning] { background:#fffaeb; }
.emails-panel :deep(.dv-button) { height:auto; padding:9px 14px; box-shadow:none; border-radius:0; }
@media(max-width:700px) {
  .emails-panel { padding:20px; }
  .emails-group-header { padding:20px 20px 12px; }
  .emails-row { grid-template-columns:minmax(0, 1fr) 20px; padding:14px 20px; gap:12px; }
  .emails-row-meta { display:none; }
}
</style>
