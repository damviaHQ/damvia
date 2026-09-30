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
import RelatedRecordsSettings from "@/components/catalogue/RelatedRecordsSettings.vue"
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { contrast, HEX_COLOR, textOn } from "@/lib/brand-color"
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

const DEFAULT_ACCENT = '#171717'
const { data: brandTheme } = useQuery({ queryKey: ['brand-theme'], queryFn: () => trpc.settings.getBrandTheme.query() })
const accent = ref(DEFAULT_ACCENT)
const isSavingAccent = ref(false)
const brandNameInput = ref('')
const isSavingBrandName = ref(false)
watch(brandTheme, () => {
  accent.value = brandTheme.value?.accentColor ?? DEFAULT_ACCENT
  brandNameInput.value = brandTheme.value?.brandName ?? ''
}, { immediate: true })
async function saveBrandName() {
  isSavingBrandName.value = true
  try {
    await trpc.settings.updateBrandTheme.mutate({ brandName: brandNameInput.value.trim() || null })
    await queryClient.invalidateQueries({ queryKey: ['brand-theme'] })
    await store.fetchEnv()
    toast.success('Brand name saved')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { isSavingBrandName.value = false }
}
const accentValid = computed(() => HEX_COLOR.test(accent.value))
const accentPreview = computed(() => accentValid.value ? accent.value : DEFAULT_ACCENT)
// Links in the portal and emails sit on white; under 3:1 they are hard to see.
const accentTooLight = computed(() => accentValid.value && contrast(accent.value, '#ffffff') < 3)
async function saveAccent(value: string | null) {
  isSavingAccent.value = true
  try {
    await trpc.settings.updateBrandTheme.mutate({ accentColor: value })
    await queryClient.invalidateQueries({ queryKey: ['brand-theme'] })
    toast.success(value ? 'Accent colour saved' : 'Accent colour reset')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { isSavingAccent.value = false }
}
const { data: enrichment, status: enrichmentStatus, refetch: refetchEnrichment } = useQuery({ queryKey: ['enrichment-settings'], queryFn: () => trpc.settings.getEnrichment.query() })
const recordLabel = ref({ recordLabelSingular: '', recordLabelPlural: '', viewsEnabled: false, viewSeparator: '.', viewDigits: 2, thumbnailView: '00', hideRecordsWithoutMedia: false, familyAttributeName: null as string | null, cardTitleAttributeName: null as string | null })
const viewExample = computed(() => {
  const separator = recordLabel.value.viewSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `(key)(?:${separator}(\\d{${recordLabel.value.viewDigits}}))?`
})
const singularLower = computed(() => recordLabel.value.recordLabelSingular.trim().toLowerCase() || 'product')
const plural = computed(() => recordLabel.value.recordLabelPlural.trim() || 'Products')
const pluralLower = computed(() => plural.value.toLowerCase())
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

async function saveReadiness() {
  if (isSavingReadiness.value) return
  isSavingReadiness.value = true
  try {
    await trpc.settings.saveReadiness.mutate({
      ...readiness.value,
      requiredViews: requiredViewsText.value.split(',').map((view) => view.trim()).filter(Boolean),
    })
    await queryClient.invalidateQueries({ queryKey: ['readiness-definition'] })
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
      const contentType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || file.size > 20 * 1024 * 1024 || !file.size) {
        throw new Error('Choose a JPEG, PNG or WebP image up to 20 MB.')
      }
      const upload = await trpc.settings.getAuthBackgroundUpload.mutate({ contentType })
      const form = new FormData()
      for (const [key, value] of Object.entries(upload.fields)) form.append(key, value)
      form.append('file', file)
      const response = await fetch(upload.url, { method: 'POST', body: form })
      if (!response.ok) throw new Error('The upload failed. Please try again.')

      // After successful upload, trigger the server-side processing
      await trpc.settings.processAuthBackgroundImage.mutate({ uploadId: upload.uploadId })

      await fetchBackgroundImage() // Refresh the image after upload
      toast.success("Background image uploaded and processed successfully")
    } catch (error) {
      toast.error(extractErrors(error as Error).message)
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

      <section class="settings-group" aria-labelledby="branding-heading">
        <header class="settings-group-header">
          <h2 id="branding-heading">Branding</h2>
          <p>How the client portal, login pages and emails look to your readers.</p>
        </header>
        <div class="dv-panel settings-panel">
          <div class="setting-row">
            <div class="setting-main">
              <h3 id="brand-name-heading">Brand name</h3>
              <form class="setting-form" aria-labelledby="brand-name-heading" @submit.prevent="saveBrandName">
                <div class="record-label-field setting-narrow">
                  <Label for="brandName" class="sr-only">Brand name</Label>
                  <Input id="brandName" v-model="brandNameInput" maxlength="120" :placeholder="store.env?.appName ?? 'Your brand'" />
                </div>
                <div class="setting-actions">
                  <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingBrandName || brandNameInput.trim() === (brandTheme?.brandName ?? '')">{{ isSavingBrandName ? 'Saving…' : 'Save name' }}</Button>
                </div>
              </form>
            </div>
            <div class="setting-help">
              <p>Shown in the browser tab, and in every email: as the sender, at the top when there is no logo, and in the footer.</p>
              <p>Leave empty to use the name your hosting provider set.</p>
            </div>
          </div>
  
          <div class="setting-row">
            <div class="setting-main">
              <h3>Brand logo</h3>
              <p v-if="logoStatus === 'pending'" role="status">Loading brand logo…</p>
              <div v-else-if="logoStatus === 'error'" role="alert">The logo could not be loaded. <Button class="dv-button" variant="outline" @click="refetchLogo()">Try again</Button></div>
              <div v-else class="setting-form">
                <div v-if="logo?.imageUrl" class="logo-preview"><img :src="logo.imageUrl" alt="Current brand logo" /></div>
                <input ref="logoInput" type="file" accept="image/svg+xml,image/png,image/webp" class="hidden" aria-label="Choose brand logo" @change="uploadLogo" />
                <div class="setting-actions">
                  <Button class="dv-button dv-button--primary" :disabled="isSavingLogo" @click="logoInput?.click()">{{ isSavingLogo ? 'Updating…' : logo?.exists ? 'Replace logo' : 'Upload logo' }}</Button>
                  <Button v-if="logo?.exists" class="dv-button" variant="outline" :disabled="isSavingLogo" @click="removeLogo">Remove logo</Button>
                </div>
              </div>
            </div>
            <div class="setting-help">
              <p>Appears in the client portal and on login pages. Your hosting provider controls whether it also appears in the admin sidebar.</p>
              <p>SVG, PNG or WebP, up to 5 MB. A new logo replaces the previous one.</p>
            </div>
          </div>
  
          <div class="setting-row">
            <div class="setting-main">
              <h3 id="accent-heading">Accent colour</h3>
              <form class="setting-form" aria-labelledby="accent-heading" @submit.prevent="saveAccent(accent.toLowerCase())">
                <div class="accent-fields">
                  <input v-model="accent" type="color" class="accent-swatch" aria-label="Pick the accent colour" />
                  <div class="record-label-field">
                    <Label for="accentHex">Hex code</Label>
                    <Input id="accentHex" v-model.trim="accent" maxlength="7" placeholder="#171717" :aria-invalid="!accentValid" class="accent-hex" />
                  </div>
                  <div class="accent-sample" aria-hidden="true">
                    <span class="accent-sample-button" :style="{ background: accentPreview, color: textOn(accentPreview) }">Download</span>
                    <span class="accent-sample-link" :style="{ color: accentPreview }">View collection</span>
                  </div>
                </div>
                <p v-if="!accentValid" class="admin-form-error">Enter a colour as # followed by six hexadecimal digits, such as #0044f4.</p>
                <p v-else-if="accentTooLight" class="setting-warning" role="status">This colour is light: buttons get dark text, and links may be hard to read on white.</p>
                <div class="setting-actions">
                  <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingAccent || !accentValid">{{ isSavingAccent ? 'Saving…' : 'Save colour' }}</Button>
                  <Button v-if="brandTheme?.accentColor" type="button" class="dv-button" variant="outline" :disabled="isSavingAccent" @click="saveAccent(null)">Use the default</Button>
                </div>
              </form>
            </div>
            <div class="setting-help">
              <p>Colours buttons and links in the client portal and in every email. The administration keeps its own colours.</p>
            </div>
          </div>
  
          <div class="setting-row">
            <div class="setting-main">
              <h3>Login background</h3>
              <div class="setting-form">
                <img v-if="backgroundImageUrl" :src="backgroundImageUrl" alt="Current background" class="background-preview" />
                <input type="file" ref="fileInput" @change="handleFileUpload" accept="image/jpeg,image/png,image/webp" class="hidden" aria-label="Choose login background" />
                <div class="setting-actions">
                  <Button class="dv-button dv-button--primary" :disabled="isLoading" @click="fileInput?.click()">{{ isLoading ? 'Updating…' : backgroundImageUrl ? 'Replace background' : 'Upload background' }}</Button>
                  <Button v-if="backgroundImageUrl" class="dv-button" variant="outline" :disabled="isLoading" @click="removeBackgroundImage">Remove background</Button>
                </div>
              </div>
            </div>
            <div class="setting-help">
              <p>The image displayed behind the login screen.</p>
              <p>JPEG, PNG or WebP, up to 20 MB.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-group" aria-labelledby="enrichment-heading">
        <header class="settings-group-header">
          <h2 id="enrichment-heading">Data enrichment</h2>
          <p>How {{ pluralLower }} are named, matched to files and shown in the catalogue.</p>
        </header>
        <section v-if="enrichmentStatus !== 'success'" class="dv-panel settings-panel">
          <p v-if="enrichmentStatus === 'pending'" role="status">Loading record settings…</p>
          <div v-else role="alert">The record settings could not be loaded. <Button class="dv-button" variant="outline" @click="refetchEnrichment()">Try again</Button></div>
        </section>
        <template v-else>
          <section class="dv-panel settings-panel" aria-labelledby="records-heading">
            <header class="settings-panel-header">
              <h3 id="records-heading">Naming and views</h3>
              <p>What your records are called, and how their files are named.</p>
            </header>
  
            <div class="setting-row">
              <div class="setting-main">
                <h4 id="record-label-heading">Record label</h4>
                <form class="setting-form" aria-labelledby="record-label-heading" :aria-busy="isSavingRecordLabel" @submit.prevent="saveRecordLabel">
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
                  <div class="setting-actions">
                    <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingRecordLabel || !recordLabel.recordLabelSingular.trim() || !recordLabel.recordLabelPlural.trim()">{{ isSavingRecordLabel ? 'Saving…' : 'Save label' }}</Button>
                  </div>
                </form>
              </div>
              <div class="setting-help">
                <p>The name of the things your records describe, such as products, events or venues.</p>
                <p>It replaces the word everywhere records appear: the admin menu, the search filters and the asset type settings. The menu entry will read "{{ plural }}".</p>
              </div>
            </div>
  
            <div class="setting-row">
              <div class="setting-main">
                <h4 id="views-heading">Views</h4>
                <form class="setting-form" aria-labelledby="views-heading" :aria-busy="isSavingRecordLabel" @submit.prevent="saveRecordLabel">
                  <label class="views-switch"><Switch v-model="recordLabel.viewsEnabled" />Files show several views of each {{ singularLower }}</label>
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
                      </div>
                    </div>
                    <ul class="views-example" aria-label="File name examples">
                      <li><code>{{ viewFile(1) }}</code><span>view {{ viewNumber(1) }}, the front for example</span></li>
                      <li><code>{{ viewFile(2) }}</code><span>view {{ viewNumber(2) }}, the back</span></li>
                      <li><code>{{ viewFile(3) }}</code><span>view {{ viewNumber(3) }}, the side</span></li>
                    </ul>
                  </template>
                  <div class="setting-actions">
                    <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingRecordLabel || (recordLabel.viewsEnabled && recordLabel.viewSeparator.length !== 1)">{{ isSavingRecordLabel ? 'Saving…' : 'Save views' }}</Button>
                  </div>
                </form>
              </div>
              <div class="setting-help">
                <p>Optional. Tells apart several pictures of the same {{ singularLower }} (front, back, side, close-up) by a number after its reference in the file name.</p>
                <p>With views on, these files link to the same {{ singularLower }}, search can be filtered by view, and one view is used as the {{ singularLower }}'s picture.</p>
                <template v-if="recordLabel.viewsEnabled">
                  <p><strong>Separator</strong> and <strong>digits</strong> describe the number, added after the key of every file name rule: <code>{{ viewExample }}</code></p>
                  <p><strong>Thumbnail view</strong> is the picture of a {{ singularLower }} in the admin list.</p>
                </template>
                <p v-else>Views are off: file names are read as the key only and the view filter is hidden from search.</p>
                <p>Matching and picture access through collections work either way.</p>
              </div>
            </div>
          </section>
  
          <section class="dv-panel settings-panel" aria-labelledby="catalogue-heading">
            <header class="settings-panel-header">
              <h3 id="catalogue-heading">Catalogue</h3>
              <p>How {{ pluralLower }} are shown to readers in the catalogue.</p>
            </header>
            <form :aria-busy="isSavingRecordLabel" @submit.prevent="saveRecordLabel">
              <div class="setting-row">
                <div class="setting-main">
                  <div class="record-label-field setting-narrow">
                    <Label for="cardTitleAttributeName">Card title field</Label>
                    <select id="cardTitleAttributeName" v-model="recordLabel.cardTitleAttributeName" class="record-native-select">
                      <option :value="null">Reference only</option>
                      <option v-for="field in fields ?? []" :key="field.id" :value="field.name">{{ field.displayName ?? field.name }}</option>
                    </select>
                  </div>
                </div>
                <div class="setting-help">
                  <p>The one field shown under the reference on a catalogue card, on a single line. Every other field is read on the {{ singularLower }} page.</p>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-main">
                  <div class="record-label-field setting-narrow">
                    <Label for="familyAttributeName">Model field</Label>
                    <select id="familyAttributeName" v-model="recordLabel.familyAttributeName" class="record-native-select">
                      <option :value="null">No model grouping</option>
                      <option v-for="field in fields ?? []" :key="field.id" :value="field.name">{{ field.displayName ?? field.name }}</option>
                    </select>
                  </div>
                </div>
                <div class="setting-help">
                  <p>{{ plural }} sharing this value are one model, whatever the case, accents or spacing. The catalogue can then be read model by model, and each {{ singularLower }} page lists the others of its model.</p>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-main">
                  <label class="views-switch"><Switch v-model="recordLabel.hideRecordsWithoutMedia" />Hide {{ pluralLower }} with no visible file</label>
                </div>
                <div class="setting-help">
                  <p>Keeps {{ pluralLower }} that have no file the reader can see out of the catalogue.</p>
                </div>
              </div>
              <div class="setting-actions setting-footer">
                <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingRecordLabel">{{ isSavingRecordLabel ? 'Saving…' : 'Save catalogue' }}</Button>
              </div>
            </form>
          </section>
  
          <section class="dv-panel settings-panel" aria-labelledby="readiness-heading">
            <header class="settings-panel-header">
              <h3 id="readiness-heading">Ready to use</h3>
              <p>What a {{ singularLower }} must carry to count as ready. The catalogue shows how far each one is, and readers can keep only the ready ones. Requiring nothing leaves every {{ singularLower }} ready.</p>
            </header>
            <form :aria-busy="isSavingReadiness" @submit.prevent="saveReadiness">
              <div class="setting-row">
                <div class="setting-main">
                  <div class="record-label-field">
                    <span id="requiredFieldsLabel" class="setting-label">Required fields</span>
                    <div role="group" aria-labelledby="requiredFieldsLabel" class="required-fields">
                      <label v-for="field in fields ?? []" :key="field.id" class="flex items-center gap-2 text-body">
                        <Checkbox :model-value="readiness.requiredAttributeIds.includes(field.id)"
                          @update:model-value="toggleRequiredField(field.id, !!$event)" />
                        {{ field.displayName ?? field.name }}
                      </label>
                    </div>
                  </div>
                </div>
                <div class="setting-help">
                  <p>A {{ singularLower }} is ready once every checked field has a value.</p>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-main">
                  <div class="record-label-field setting-narrow">
                    <Label for="requiredViews">Required views</Label>
                    <Input id="requiredViews" v-model="requiredViewsText" placeholder="00, 01" />
                  </div>
                </div>
                <div class="setting-help">
                  <p>View numbers separated by commas. A {{ singularLower }} needs one file per view listed here.</p>
                </div>
              </div>
              <div class="setting-row">
                <div class="setting-main">
                  <div class="record-label-fields">
                    <div class="record-label-field">
                      <Label for="readyLabel">Ready label</Label>
                      <Input id="readyLabel" v-model="readiness.readyLabel" placeholder="Ready to use" />
                    </div>
                    <div class="record-label-field">
                      <Label for="incompleteLabel">Incomplete label</Label>
                      <Input id="incompleteLabel" v-model="readiness.incompleteLabel" placeholder="To complete" />
                    </div>
                  </div>
                </div>
                <div class="setting-help">
                  <p>The words readers see on each {{ singularLower }} and in the catalogue filter.</p>
                </div>
              </div>
              <div class="setting-actions setting-footer">
                <Button type="submit" class="dv-button dv-button--primary" :disabled="isSavingReadiness">{{ isSavingReadiness ? 'Saving…' : 'Save readiness' }}</Button>
              </div>
            </form>
          </section>
  
          <RelatedRecordsSettings class="dv-panel settings-panel related-panel" />
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-sections { display:grid; gap:40px; }
.settings-group { display:grid; gap:16px; max-width:1080px; }
.settings-group-header h2 { font-size:var(--dv-size-section); }
.settings-group-header p { margin-top:4px; color:var(--dv-text-secondary); font-size:var(--dv-size-body); }
.settings-panel { padding:4px 28px 24px; max-width:1080px; margin-top:0; }
.settings-panel-header { padding:20px 0; }
.settings-panel-header h3 { font-size:var(--dv-size-body); font-weight:600; }
.settings-panel-header p { max-width:640px; margin-top:6px; color:var(--dv-text-secondary); font-size:var(--dv-size-body); }
.settings-panel > .setting-row:first-child { border-top:0; }
.setting-row { display:grid; grid-template-columns:minmax(0, 1fr) minmax(240px, 340px); gap:40px; padding:24px 0; border-top:1px solid var(--dv-color-line); }
.setting-main { display:grid; gap:14px; align-content:start; min-width:0; }
.setting-main :is(h3, h4), .setting-label { font-size:var(--dv-size-body); font-weight:600; }
.setting-help { display:grid; gap:8px; align-content:start; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); line-height:1.5; }
.setting-help strong { color:var(--dv-text-primary, inherit); font-weight:600; }
.setting-help code { overflow-wrap:anywhere; }
.setting-form { display:grid; gap:14px; }
.setting-narrow { max-width:360px; }
.setting-actions { display:flex; flex-wrap:wrap; gap:12px; }
.setting-footer { padding-top:20px; border-top:1px solid var(--dv-color-line); }
.setting-warning { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.logo-preview { display:flex; align-items:center; justify-content:center; width:220px; height:88px; background:white; border:1px solid var(--dv-color-line); border-radius:var(--dv-radius-graphic); }
.logo-preview img { max-width:190px; max-height:60px; object-fit:contain; }
.background-preview { width:220px; aspect-ratio:16 / 10; object-fit:cover; border:1px solid var(--dv-color-line); border-radius:var(--dv-radius-graphic); }
.record-label-fields { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:16px; max-width:560px; }
.record-label-field { display:grid; gap:8px; align-content:start; }
.required-fields { display:flex; flex-wrap:wrap; gap:10px 20px; }
.views-switch { display:flex; align-items:center; gap:10px; font-size:var(--dv-size-body); }
.views-example { display:grid; gap:6px; padding:12px 14px; list-style:none; background:var(--dv-surface-canvas); border:1px solid var(--dv-color-line); max-width:560px; font-size:var(--dv-size-caption); color:var(--dv-text-secondary); }
.views-example li { display:flex; flex-wrap:wrap; gap:4px 12px; }
.settings-panel code { font-size:var(--dv-size-caption); }
.settings-panel :deep(.dv-button) { height:auto; padding:9px 14px; box-shadow:none; border-radius:0; }
.accent-fields { display:flex; flex-wrap:wrap; align-items:flex-end; gap:16px; }
.accent-swatch { width:44px; height:40px; padding:0; border:1px solid var(--dv-color-line); background:none; cursor:pointer; }
.accent-hex { width:130px; font-family:var(--dv-font-mono, ui-monospace, monospace); }
.accent-sample { display:flex; align-items:center; gap:16px; padding:10px 16px; border:1px solid var(--dv-color-line); background:white; }
.accent-sample-button { padding:8px 14px; border-radius:6px; font-size:var(--dv-size-caption); font-weight:600; }
.accent-sample-link { font-size:var(--dv-size-caption); text-decoration:underline; }
.related-panel { padding-top:28px; }
@media(max-width:900px) { .setting-row { grid-template-columns:1fr; gap:12px; } }
@media(max-width:600px) { .settings-panel { padding:4px 20px 20px; } .record-label-fields { grid-template-columns:1fr; } }
</style>
