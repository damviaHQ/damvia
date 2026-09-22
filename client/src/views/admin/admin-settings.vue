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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { computed, onMounted, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
const queryClient = useQueryClient()
const { data: logo, status: logoStatus, refetch: refetchLogo } = useQuery({ queryKey: ['client-logo'], queryFn: () => trpc.settings.getClientLogo.query() })
const logoInput = ref<HTMLInputElement | null>(null)
const isSavingLogo = ref(false)
async function uploadLogo(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  isSavingLogo.value = true
  try {
    const contentType = file.type as 'image/svg+xml' | 'image/png' | 'image/webp'
    if (!['image/svg+xml', 'image/png', 'image/webp'].includes(contentType) || file.size > 5 * 1024 * 1024 || !file.size) {
      throw new Error('Choose an SVG, PNG or WebP logo up to 5 MB.')
    }
    const upload = await trpc.settings.getClientLogoUpload.mutate({ contentType })
    const form = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value)
    form.append('file', file)
    const response = await fetch(upload.url, { method: 'POST', body: form })
    if (!response.ok) throw new Error('The logo upload failed. Please try again.')
    await trpc.settings.processClientLogo.mutate({ uploadId: upload.uploadId })
    await queryClient.invalidateQueries({ queryKey: ['client-logo'] })
    toast.success('Brand Logo updated')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally {
    isSavingLogo.value = false
    input.value = ''
  }
}
async function removeLogo() {
  isSavingLogo.value = true
  try {
    await trpc.settings.removeClientLogo.mutate()
    await queryClient.invalidateQueries({ queryKey: ['client-logo'] })
    toast.success('Brand Logo removed')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { isSavingLogo.value = false }
}

const toast = useGlobalToast()
const store = useGlobalStore()
const { data: enrichment, status: enrichmentStatus, refetch: refetchEnrichment } = useQuery({ queryKey: ['enrichment-settings'], queryFn: () => trpc.settings.getEnrichment.query() })
const recordLabel = ref({ recordLabelSingular: '', recordLabelPlural: '', viewsEnabled: false, viewSeparator: '.', viewDigits: 2, thumbnailView: '00', hideRecordsWithoutMedia: false, familyAttributeName: null as string | null })
const viewExample = computed(() => {
  const separator = recordLabel.value.viewSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `(key)(?:${separator}(\\d{${recordLabel.value.viewDigits}}))?`
})
const viewNumber = (view: number) => String(view).padStart(Math.max(1, recordLabel.value.viewDigits), '0')
const viewFile = (view: number) => `ABC123-001${recordLabel.value.viewSeparator}${viewNumber(view)}.jpg`
const recordLabelErrors = ref<Record<string, string>>({})
const { data: fields } = useQuery({ queryKey: ['record-attributes'], queryFn: () => trpc.recordAttribute.list.query() })
const { data: savedReadiness } = useQuery({ queryKey: ['readiness-definition'], queryFn: () => trpc.settings.getReadiness.query() })
const readiness = ref({ requiredAttributeIds: [] as string[], requiredViews: [] as string[], readyLabel: 'Ready to use', incompleteLabel: 'To complete' })
const requiredViewsText = ref('')
const isSavingReadiness = ref(false)
watch(savedReadiness, () => {
  if (!savedReadiness.value) return
  readiness.value = { ...savedReadiness.value }
  requiredViewsText.value = savedReadiness.value.requiredViews.join(', ')
}, { immediate: true })

function toggleRequiredField(id: string, checked: boolean) {
  const ids = readiness.value.requiredAttributeIds
  readiness.value.requiredAttributeIds = checked ? [...ids, id] : ids.filter((current) => current !== id)
}

// The catalogue reads the setting that hides empty products, so both are saved
// together from this one form.
async function saveReadiness() {
  if (isSavingReadiness.value) return
  isSavingReadiness.value = true
  try {
    await trpc.settings.saveReadiness.mutate({
      ...readiness.value,
      requiredViews: requiredViewsText.value.split(',').map((view) => view.trim()).filter(Boolean),
    })
    await trpc.settings.updateEnrichment.mutate(recordLabel.value)
    await queryClient.invalidateQueries({ queryKey: ['readiness-definition'] })
    await queryClient.invalidateQueries({ queryKey: ['enrichment-settings'] })
    toast.success('Readiness saved')
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    isSavingReadiness.value = false
  }
}
const isSavingRecordLabel = ref(false)
watch(enrichment, () => { if (enrichment.value) recordLabel.value = { ...enrichment.value } }, { immediate: true })
async function saveRecordLabel() {
  if (isSavingRecordLabel.value) return
  isSavingRecordLabel.value = true
  recordLabelErrors.value = {}
  try {
    await trpc.settings.updateEnrichment.mutate(recordLabel.value)
    await queryClient.invalidateQueries({ queryKey: ['enrichment-settings'] })
    await store.fetchEnv()
    toast.success('Settings saved')
  } catch (error) {
    const result = extractErrors(error as Error)
    recordLabelErrors.value = result.fieldErrors
    if (!Object.keys(result.fieldErrors).length) toast.error(result.message)
  } finally { isSavingRecordLabel.value = false }
}
const fileInput = ref<HTMLInputElement | null>(null)
const backgroundImageUrl = ref<string | null>(null)
const isLoading = ref(false)

onMounted(async () => {
  await fetchBackgroundImage()
})

const fetchBackgroundImage = async () => {
  try {
    const result = await trpc.settings.getAuthBackgroundImage.query()
    backgroundImageUrl.value = result.exists ? result.imageUrl : ""
  } catch (error) {
    toast.error("Failed to fetch background image")
  }
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    isLoading.value = true
    try {
      const uploadUrl = await trpc.settings.getAuthBackgroundUploadUrl.query()
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      })

      // After successful upload, trigger the server-side processing
      await trpc.settings.processAuthBackgroundImage.mutate()

      await fetchBackgroundImage() // Refresh the image after upload
      toast.success("Background image uploaded and processed successfully")
    } catch (error) {
      toast.error("Failed to upload or process background image")
    } finally {
      isLoading.value = false
    }
  }
}

const removeBackgroundImage = async () => {
  isLoading.value = true
  try {
    await trpc.settings.removeAuthBackgroundImage.mutate()
    backgroundImageUrl.value = ""
    toast.success("Background image removed successfully")
  } catch (error) {
    toast.error("Failed to remove background image")
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="admin-page admin-resource-page">
    <div class="settings-sections">
      <AdminPageHeader />

      <section class="dv-panel branding-settings">
        <h2>Brand Logo</h2>
        <p>Your logo appears in the client portal and on login pages. Your hosting provider controls whether it also appears in the admin sidebar.</p>
        <p v-if="logoStatus === 'pending'" role="status">Loading brand logo…</p>
        <div v-else-if="logoStatus === 'error'" role="alert">The logo could not be loaded. <Button class="dv-button" variant="outline" @click="refetchLogo()">Try again</Button></div>
        <template v-else>
          <div v-if="logo?.imageUrl" class="logo-preview"><img :src="logo.imageUrl" alt="Current brand logo" /></div>
          <p class="branding-note">SVG, PNG or WebP · up to 5 MB. Uploading a new logo replaces the previous one.</p>
          <input ref="logoInput" type="file" accept="image/svg+xml,image/png,image/webp" class="hidden" aria-label="Choose brand logo" @change="uploadLogo" />
          <div class="flex flex-wrap gap-3">
            <Button class="dv-button dv-button--primary" :disabled="isSavingLogo" @click="logoInput?.click()">{{ isSavingLogo ? 'Updating…' : logo?.exists ? 'Replace logo' : 'Upload logo' }}</Button>
            <Button v-if="logo?.exists" class="dv-button" variant="outline" :disabled="isSavingLogo" @click="removeLogo">Remove logo</Button>
          </div>
        </template>
      </section>
      <div class="dv-panel branding-settings">
        <h2>Login background</h2>
        <p class="branding-note">The image displayed behind your login screen.</p>

        <div v-if="backgroundImageUrl" class="mb-4">
          <img :src="backgroundImageUrl" alt="Current background" class="branding-background-preview w-full max-w-md" />
        </div>

        <div class="flex flex-wrap gap-4">
          <input type="file" ref="fileInput" @change="handleFileUpload" accept="image/*" class="hidden" aria-label="Choose login background" />
          <Button @click="fileInput?.click()" :disabled="isLoading">
            {{ isLoading ? 'Updating…' : backgroundImageUrl ? 'Replace background' : 'Upload background' }}
          </Button>
          <Button v-if="backgroundImageUrl" @click="removeBackgroundImage" variant="destructive" :disabled="isLoading">
            Remove background
          </Button>
        </div>
      </div>
      <section class="dv-panel branding-settings" aria-labelledby="record-label-heading">
        <h2 id="record-label-heading">Record label</h2>
        <p>The name of the things your records describe, such as products, events or venues. It replaces the word everywhere records appear: the admin menu, the search filters and the asset type settings.</p>
        <p v-if="enrichmentStatus === 'pending'" role="status">Loading record label…</p>
        <div v-else-if="enrichmentStatus === 'error'" role="alert">The record label could not be loaded. <Button class="dv-button" variant="outline" @click="refetchEnrichment()">Try again</Button></div>
        <form v-else class="record-label-form" :aria-busy="isSavingRecordLabel" @submit.prevent="saveRecordLabel">
          <div class="record-label-fields">
            <div class="record-label-field">
              <Label for="recordLabelSingular">Singular</Label>
              <Input id="recordLabelSingular" v-model="recordLabel.recordLabelSingular" placeholder="Product" :aria-invalid="!!recordLabelErrors.recordLabelSingular" />
              <p v-if="recordLabelErrors.recordLabelSingular" class="admin-form-error">{{ recordLabelErrors.recordLabelSingular }}</p>
            </div>
            <div class="record-label-field">
              <Label for="recordLabelPlural">Plural</Label>
              <Input id="recordLabelPlural" v-model="recordLabel.recordLabelPlural" placeholder="Products" :aria-invalid="!!recordLabelErrors.recordLabelPlural" />
              <p v-if="recordLabelErrors.recordLabelPlural" class="admin-form-error">{{ recordLabelErrors.recordLabelPlural }}</p>
            </div>
          </div>
          <p class="branding-note">For example, the menu entry will read "{{ recordLabel.recordLabelPlural.trim() || 'Products' }}".</p>
          <div class="flex flex-wrap gap-3">
            <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingRecordLabel || !recordLabel.recordLabelSingular.trim() || !recordLabel.recordLabelPlural.trim()">{{ isSavingRecordLabel ? 'Saving…' : 'Save label' }}</Button>
          </div>
        </form>
        <template v-if="enrichmentStatus === 'success'">
          <h3 id="views-heading" class="views-heading">Views</h3>
          <p>For brands that sell products. A product is usually shot several times: front, back, side, close-up, in use. Each of these pictures is a view, and a number after the product key in the file name tells them apart:</p>
          <ul class="views-example">
            <li><code>{{ viewFile(1) }}</code> product <code>ABC123-001</code>, view <code>{{ viewNumber(1) }}</code>, the front for example</li>
            <li><code>{{ viewFile(2) }}</code> same product, view <code>{{ viewNumber(2) }}</code>, the back</li>
            <li><code>{{ viewFile(3) }}</code> same product, view <code>{{ viewNumber(3) }}</code>, the side</li>
          </ul>
          <p>With views on, all these files are linked to the same {{ recordLabel.recordLabelSingular.toLowerCase() || 'product' }}, search can be filtered by view (only the fronts, for example), and one view is used as the {{ recordLabel.recordLabelSingular.toLowerCase() || 'product' }}'s picture. Leave views off if each file shows its record once, as for events or venues.</p>
          <form class="record-label-form" aria-labelledby="views-heading" :aria-busy="isSavingRecordLabel" @submit.prevent="saveRecordLabel">
            <label class="views-switch"><Switch v-model="recordLabel.viewsEnabled" />Files show several views of each {{ recordLabel.recordLabelSingular.toLowerCase() || 'record' }}</label>
            <template v-if="recordLabel.viewsEnabled">
              <div class="record-label-fields">
                <div class="record-label-field">
                  <Label for="viewSeparator">Separator</Label>
                  <Input id="viewSeparator" v-model="recordLabel.viewSeparator" maxlength="1" placeholder="." :aria-invalid="!!recordLabelErrors.viewSeparator" />
                  <p v-if="recordLabelErrors.viewSeparator" class="admin-form-error">{{ recordLabelErrors.viewSeparator }}</p>
                </div>
                <div class="record-label-field">
                  <Label for="viewDigits">Digits</Label>
                  <Input id="viewDigits" v-model.number="recordLabel.viewDigits" type="number" min="1" max="4" :aria-invalid="!!recordLabelErrors.viewDigits" />
                  <p v-if="recordLabelErrors.viewDigits" class="admin-form-error">{{ recordLabelErrors.viewDigits }}</p>
                </div>
                <div class="record-label-field">
                  <Label for="thumbnailView">Thumbnail view</Label>
                  <Input id="thumbnailView" v-model="recordLabel.thumbnailView" placeholder="00" :aria-invalid="!!recordLabelErrors.thumbnailView" />
                  <p class="admin-text-secondary">The view used as the picture of a {{ recordLabel.recordLabelSingular.toLowerCase() || 'record' }} in the admin list.</p>
                </div>
              </div>
              <p class="branding-note">Added after the key of every file name step: <code>{{ viewExample }}</code>. Turning views off hides the view filter from search; existing view values are kept until the next pass.</p>
            </template>
            <p v-else class="branding-note">Views are off: file names are read as the key only and the view filter is hidden from search.</p>
            <div class="flex flex-wrap gap-3">
              <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingRecordLabel || (recordLabel.viewsEnabled && recordLabel.viewSeparator.length !== 1)">{{ isSavingRecordLabel ? 'Saving…' : 'Save views' }}</Button>
            </div>
          </form>
        </template>

        <template v-if="enrichmentStatus === 'success'">
          <h3 id="readiness-heading" class="views-heading">Ready to use</h3>
          <p>Say what a {{ recordLabel.recordLabelSingular.toLowerCase() || 'product' }} must carry to count as ready. The catalogue then shows how far each one is, and readers can keep only the ones that are ready. Requiring nothing leaves every {{ recordLabel.recordLabelSingular.toLowerCase() || 'product' }} ready.</p>
          <div class="record-label-field">
            <Label for="familyAttributeName">Model field</Label>
            <select id="familyAttributeName" v-model="recordLabel.familyAttributeName" class="record-native-select">
              <option :value="null">No model grouping</option>
              <option v-for="field in fields ?? []" :key="field.id" :value="field.name">{{ field.displayName ?? field.name }}</option>
            </select>
            <p class="admin-text-secondary">
              {{ recordLabel.recordLabelPlural.toLowerCase() || 'products' }} sharing this value are one model, whatever the case, accents or spacing.
              The catalogue can then be read model by model, and each {{ recordLabel.recordLabelSingular.toLowerCase() || 'product' }} page lists the others of its model.
            </p>
          </div>
          <form class="record-label-form" aria-labelledby="readiness-heading" :aria-busy="isSavingReadiness" @submit.prevent="saveReadiness">
            <div class="record-label-field">
              <Label for="requiredFields">Required fields</Label>
              <div id="requiredFields" role="group" aria-labelledby="readiness-heading" class="flex flex-wrap gap-3">
                <label v-for="field in fields ?? []" :key="field.id" class="flex items-center gap-2 text-body">
                  <Checkbox :model-value="readiness.requiredAttributeIds.includes(field.id)"
                    @update:model-value="toggleRequiredField(field.id, !!$event)" />
                  {{ field.displayName ?? field.name }}
                </label>
              </div>
            </div>
            <div class="record-label-fields">
              <div class="record-label-field">
                <Label for="requiredViews">Required views</Label>
                <Input id="requiredViews" v-model="requiredViewsText" placeholder="00, 01" />
                <p class="admin-text-secondary">View numbers separated by commas. A {{ recordLabel.recordLabelSingular.toLowerCase() || 'product' }} needs one file per view listed here.</p>
              </div>
              <div class="record-label-field">
                <Label for="readyLabel">Ready label</Label>
                <Input id="readyLabel" v-model="readiness.readyLabel" placeholder="Ready to use" />
              </div>
              <div class="record-label-field">
                <Label for="incompleteLabel">Incomplete label</Label>
                <Input id="incompleteLabel" v-model="readiness.incompleteLabel" placeholder="To complete" />
              </div>
            </div>
            <label class="views-switch"><Switch v-model="recordLabel.hideRecordsWithoutMedia" />Keep {{ recordLabel.recordLabelPlural.toLowerCase() || 'products' }} with no visible file out of the catalogue</label>
            <div class="flex flex-wrap gap-3">
              <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingReadiness">{{ isSavingReadiness ? 'Saving…' : 'Save readiness' }}</Button>
            </div>
          </form>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.branding-settings { padding:28px; max-width:780px; margin-top:0; }
.settings-sections { display:grid; gap:24px; }
.settings-sections > .admin-heading { margin-bottom:4px; }
.branding-settings h2 { font-size:var(--dv-size-section); margin-bottom:12px; }
.branding-settings p { color:var(--dv-text-secondary); font-size:var(--dv-size-body); margin-top:8px; }
.logo-preview { display:flex; align-items:center; justify-content:center; height:110px; max-width:300px; margin:24px 0; background:white; border:1px solid var(--dv-color-line); border-radius:var(--dv-radius-graphic); }
.logo-preview img { max-width:260px; max-height:80px; object-fit:contain; }
.branding-background-preview { border-radius:var(--dv-radius-graphic); }
.branding-settings .branding-note { margin-bottom:20px; }
.record-label-fields { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:16px; margin-top:20px; }
.branding-settings .views-heading { font-size:var(--dv-size-body); font-weight:600; margin-top:28px; padding-top:24px; border-top:1px solid var(--dv-color-line); }
.views-example { display:grid; gap:6px; margin-top:12px; padding-left:0; list-style:none; color:var(--dv-text-secondary); font-size:var(--dv-size-body); }
.views-switch { display:flex; align-items:center; gap:10px; margin-top:16px; }
.branding-settings code { font-size:var(--dv-size-caption); }
.record-label-field { display:grid; gap:8px; align-content:start; }
.branding-settings .record-label-field p { margin-top:0; }
.branding-settings :deep(.dv-button) { height:auto; padding:9px 14px; box-shadow:none; border-radius:0; }
@media(max-width:600px) { .branding-settings { padding:20px; } .record-label-fields { grid-template-columns:1fr; } }
</style>
