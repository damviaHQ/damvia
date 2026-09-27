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
import { ChevronRight } from "@lucide/vue"
import { computed, ref, watch } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const { data: templates, status, refetch } = useQuery({ queryKey: ['email-templates'], queryFn: () => trpc.emailTemplate.list.query() })
const { data: settings } = useQuery({ queryKey: ['email-settings'], queryFn: () => trpc.emailTemplate.getSettings.query() })

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
.emails-panel :deep(.dv-button) { height:auto; padding:9px 14px; box-shadow:none; border-radius:0; }
@media(max-width:700px) {
  .emails-panel { padding:20px; }
  .emails-group-header { padding:20px 20px 12px; }
  .emails-row { grid-template-columns:minmax(0, 1fr) 20px; padding:14px 20px; gap:12px; }
  .emails-row-meta { display:none; }
}
</style>
