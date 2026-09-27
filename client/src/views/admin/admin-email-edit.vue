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
import RichTextEditor from "@/components/page-editor/RichTextEditor.vue"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc, type RouterOutput } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Braces, Monitor, Send, Smartphone } from "@lucide/vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { onBeforeRouteLeave, useRoute } from "vue-router"

type Content = RouterOutput["emailTemplate"]["get"]["content"]
type Field = keyof Content

const route = useRoute()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const key = computed(() => String(route.params.key))
const { data: template, status, refetch } = useQuery({
  queryKey: computed(() => ['email-template', key.value]),
  queryFn: () => trpc.emailTemplate.get.query(key.value),
})

const draft = ref<Content>({ subject: '', preheader: '', heading: '', bodyHtml: '', buttonLabel: '' })
const saved = ref('')
watch(template, () => {
  if (!template.value) return
  draft.value = { ...template.value.content }
  saved.value = JSON.stringify(template.value.content)
}, { immediate: true })
const isDirty = computed(() => !!template.value && JSON.stringify(draft.value) !== saved.value)
const matchesDefault = computed(() => !!template.value && JSON.stringify(draft.value) === JSON.stringify(template.value.defaults))

// Variables go where the cursor last was.
const lastField = ref<Field>('bodyHtml')
const body = ref<InstanceType<typeof RichTextEditor> | null>(null)
const inputs: Partial<Record<Field, HTMLInputElement>> = {}
function remember(field: Field, event: FocusEvent) {
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

const preview = ref<{ subject: string, html: string } | null>(null)
const previewError = ref('')
const previewWidth = ref<'desktop' | 'mobile'>('desktop')
let previewTimer: ReturnType<typeof setTimeout> | undefined
let previewRun = 0
async function refreshPreview() {
  if (!template.value || !draft.value.subject.trim()) return
  const run = ++previewRun
  try {
    const result = await trpc.emailTemplate.preview.mutate({ key: key.value, content: draft.value })
    if (run !== previewRun) return
    preview.value = result
    previewError.value = ''
  } catch (error) {
    if (run === previewRun) previewError.value = extractErrors(error as Error).message
  }
}
watch(draft, () => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(refreshPreview, 350)
}, { deep: true, immediate: true })
onBeforeUnmount(() => clearTimeout(previewTimer))

const isSaving = ref(false)
const isSending = ref(false)
function applySaved(content: Content) {
  draft.value = { ...content }
  saved.value = JSON.stringify(content)
  queryClient.invalidateQueries({ queryKey: ['email-templates'] })
  queryClient.invalidateQueries({ queryKey: ['email-template', key.value] })
}
async function save() {
  isSaving.value = true
  try {
    const result = await trpc.emailTemplate.update.mutate({ key: key.value, content: draft.value })
    applySaved(result.content)
    toast.success('Email saved')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { isSaving.value = false }
}
async function reset() {
  isSaving.value = true
  try {
    const result = await trpc.emailTemplate.reset.mutate(key.value)
    applySaved(result.content)
    toast.success('Default wording restored')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { isSaving.value = false }
}
async function sendTest() {
  isSending.value = true
  try {
    const result = await trpc.emailTemplate.sendTest.mutate({ key: key.value, content: draft.value })
    toast.success(`Test sent to ${result.sentTo}`)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { isSending.value = false }
}

function guardUnload(event: BeforeUnloadEvent) {
  if (isDirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', guardUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnload))
onBeforeRouteLeave(() => !isDirty.value || window.confirm('Leave without saving your changes to this email?'))
</script>

<template>
  <div class="admin-page email-edit">
    <AdminPageHeader :title="template?.label ?? 'Edit email'" :description="template ? `${template.trigger} Sent to: ${template.recipients}.` : undefined">
      <AlertDialog v-if="template?.customised">
        <AlertDialogTrigger as-child>
          <Button variant="ghost" class="dv-button" :disabled="isSaving">Reset to default</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore the default wording?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to this email are removed. Future improvements to the default wording will then apply automatically.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction @click="reset">Restore default</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button variant="outline" class="dv-button" :disabled="!template || isSending || !!previewError" @click="sendTest">
        <Send class="size-4 mr-2" aria-hidden="true" />{{ isSending ? 'Sending…' : 'Send me a test' }}
      </Button>
      <Button class="dv-button dv-button--primary" :disabled="!isDirty || isSaving || !draft.subject.trim()" @click="save">{{ isSaving ? 'Saving…' : 'Save' }}</Button>
    </AdminPageHeader>

    <p v-if="status === 'pending'" role="status">Loading email…</p>
    <div v-else-if="status === 'error'" role="alert">This email could not be loaded. <Button class="dv-button" variant="outline" @click="refetch()">Try again</Button></div>
    <div v-else-if="template" class="email-edit-grid">
      <form class="dv-panel email-form" @submit.prevent="save">
        <div class="email-field">
          <Label for="email-subject">Subject</Label>
          <Input id="email-subject" v-model="draft.subject" maxlength="300" @focus="remember('subject', $event)" />
        </div>
        <div class="email-field">
          <Label for="email-preheader">Preview text <span class="optional">shown after the subject in most inboxes</span></Label>
          <Input id="email-preheader" v-model="draft.preheader" maxlength="300" @focus="remember('preheader', $event)" />
        </div>
        <div class="email-field">
          <Label for="email-heading">Heading</Label>
          <Input id="email-heading" v-model="draft.heading" maxlength="300" @focus="remember('heading', $event)" />
        </div>
        <div class="email-field">
          <span class="email-label" id="email-body-label">Message</span>
          <div class="email-body" aria-labelledby="email-body-label" @focusin="lastField = 'bodyHtml'">
            <RichTextEditor ref="body" v-model="draft.bodyHtml" placeholder="Write the message. Select text to format it." />
          </div>
        </div>
        <div v-if="template.hasButton" class="email-field">
          <Label for="email-button">Button label <span class="optional">leave empty for no button</span></Label>
          <Input id="email-button" v-model="draft.buttonLabel" maxlength="80" @focus="remember('buttonLabel', $event)" />
        </div>

        <div class="email-variables" aria-labelledby="variables-heading">
          <h2 id="variables-heading"><Braces class="size-4" aria-hidden="true" />Personalise</h2>
          <p>Click to insert where your cursor is.</p>
          <ul>
            <li v-for="variable in [...template.variables, ...template.blocks]" :key="variable.name">
              <button type="button" class="email-variable" :title="variable.description" @mousedown.prevent @click="insertVariable(variable.name)">
                <code>{{ variable.name }}</code><span>{{ variable.description }}</span>
              </button>
            </li>
          </ul>
          <p class="email-variables-help">Values are inserted safely. Conditions such as <code v-pre>{% if … %}</code> work too; see the documentation.</p>
        </div>
        <p v-if="matchesDefault && template.customised" class="email-note">This matches the default wording. Use <strong>Reset to default</strong> to follow future improvements.</p>
      </form>

      <section class="email-preview" aria-label="Preview">
        <div class="email-preview-bar">
          <div class="email-preview-subject">
            <span>Subject</span>
            <strong>{{ preview?.subject ?? draft.subject }}</strong>
          </div>
          <div class="email-preview-toggle" role="group" aria-label="Preview width">
            <button type="button" :aria-pressed="previewWidth === 'desktop'" aria-label="Desktop" title="Desktop" @click="previewWidth = 'desktop'"><Monitor class="size-4" /></button>
            <button type="button" :aria-pressed="previewWidth === 'mobile'" aria-label="Phone" title="Phone" @click="previewWidth = 'mobile'"><Smartphone class="size-4" /></button>
          </div>
        </div>
        <p v-if="previewError" class="email-preview-error" role="alert">{{ previewError }}</p>
        <div class="email-preview-frame" :class="`is-${previewWidth}`">
          <iframe v-if="preview" title="Email preview" sandbox="" :srcdoc="preview.html" />
        </div>
        <p class="email-note">The preview uses sample values. Your logo and accent colour come from <router-link :to="{ name: 'admin-settings' }">Settings</router-link>.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.email-edit-grid { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.1fr); gap:24px; align-items:start; }
.email-form { padding:28px; display:grid; gap:20px; }
.email-field { display:grid; gap:8px; }
.email-label { font-size:var(--dv-size-body); font-weight:500; }
.optional { color:var(--dv-text-secondary); font-weight:400; font-size:var(--dv-size-caption); margin-left:4px; }
.email-body { border:1px solid hsl(var(--input)); padding:12px 14px; min-height:180px; background:white; font-size:var(--dv-size-body); }
.email-body:focus-within { outline:2px solid hsl(var(--ring)); outline-offset:1px; }
.email-body :deep(.tiptap) { min-height:150px; }
.email-body :deep(h1) { font-size:1.25rem; }
.email-body :deep(h2) { font-size:1.125rem; }
.email-body :deep(h3), .email-body :deep(h4) { font-size:1rem; }
.email-variables { border-top:1px solid var(--dv-color-line); padding-top:20px; }
.email-variables h2 { display:flex; align-items:center; gap:8px; font-size:var(--dv-size-body); font-weight:600; }
.email-variables > p { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); margin-top:4px; }
.email-variables ul { list-style:none; margin:12px 0 0; padding:0; display:grid; gap:6px; }
.email-variable { display:flex; align-items:baseline; gap:10px; width:100%; text-align:left; border:1px solid var(--dv-color-line); background:white; padding:8px 10px; cursor:pointer; }
.email-variable:hover { border-color:var(--dv-action-primary); }
.email-variable:focus-visible { outline:2px solid var(--dv-action-primary); outline-offset:1px; }
.email-variable code { font-size:var(--dv-size-caption); color:var(--dv-action-primary); white-space:nowrap; }
.email-variable span { font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.email-variables .email-variables-help { margin-top:12px; }
.email-variables-help code { font-size:inherit; }
.email-note { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.email-note a { text-decoration:underline; }
.email-preview { position:sticky; top:16px; display:grid; gap:12px; }
.email-preview-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.email-preview-subject { display:grid; gap:2px; min-width:0; }
.email-preview-subject span { font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.email-preview-subject strong { font-size:var(--dv-size-body); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.email-preview-toggle { display:flex; border:1px solid var(--dv-color-line); background:white; }
.email-preview-toggle button { display:grid; place-items:center; width:36px; height:32px; color:var(--dv-text-secondary); }
.email-preview-toggle button[aria-pressed="true"] { background:var(--dv-action-soft); color:var(--dv-action-primary); }
.email-preview-error { color:var(--dv-color-danger, #b42318); font-size:var(--dv-size-caption); border:1px solid currentColor; padding:8px 12px; background:white; }
.email-preview-frame { background:#f4f4f5; border:1px solid var(--dv-color-line); height:calc(100vh - 220px); min-height:520px; display:flex; justify-content:center; overflow:hidden; }
.email-preview-frame iframe { border:0; width:100%; height:100%; background:#f4f4f5; transition:width .2s ease; }
.email-preview-frame.is-mobile iframe { width:375px; border-left:1px solid var(--dv-color-line); border-right:1px solid var(--dv-color-line); }
.email-edit :deep(.dv-button) { height:auto; padding:9px 14px; box-shadow:none; border-radius:0; }
@media(max-width:1100px) {
  .email-edit-grid { grid-template-columns:1fr; }
  .email-preview { position:static; }
  .email-preview-frame { height:640px; }
}
@media(max-width:600px) { .email-form { padding:20px; } }
</style>
