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
import { computed, ref, watch, watchEffect } from 'vue'
import { FileStack, Table2, Download } from '@lucide/vue'
import { useQueryClient } from '@tanstack/vue-query'
import CollectionDownloadFileOptions from './CollectionDownloadFileOptions.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGlobalToast } from '@/composables/useGlobalToast'
import { useRecordLabel } from '@/composables/useRecordLabel'
import { RouterInput, RouterOutput, trpc } from '@/services/server'
import { useDownloadStore } from '@/stores/downloadStore'
import { useGlobalStore } from '@/stores/globalStore'
import { formatFileSize } from '@/utils/fileSize'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', open: boolean): void }>()
const store = useGlobalStore()
const labels = useRecordLabel()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const downloads = useDownloadStore()
const res = ref<RouterOutput['collection']['getFiles'] | null>(null)
const error = ref('')
const busy = ref(false)
const mode = ref<'files' | 'list'>('files')
const format = ref<'xlsx' | 'csv'>('xlsx')
const columns = ref<string[]>([])
const views = ref<string[]>([])
const excluded = ref<string[]>([])
const accepted = ref(false)
const imageFormat = ref<'original' | 'jpg' | 'png' | 'webp'>('original')
const imageResolution = ref<'high' | 'medium' | 'low'>('medium')
const videoFormat = ref<'original' | 'mp4' | 'webm'>('original')
const videoResolution = ref<'high' | 'medium' | 'low'>('medium')
const delivery = ref<'direct' | 'email'>('direct')
const reload = ref(0)
const viewOptions = computed(() => [...new Set((res.value?.files ?? []).map(file => file.recordView ?? ''))].sort())
const filterViews = computed(() => !!res.value?.viewsEnabled && viewOptions.value.some(Boolean))
const displayedFiles = computed(() => (res.value?.files ?? []).filter(file => !filterViews.value || views.value.includes(file.recordView ?? '')))
const files = computed(() => displayedFiles.value.filter(file => !excluded.value.includes(file.id)))
function toggleFile(id: string) {
  excluded.value = excluded.value.includes(id) ? excluded.value.filter(current => current !== id) : [...excluded.value, id]
}
const bytes = computed(() => files.value.reduce((sum, file) => sum + file.size, 0))
const imageCount = computed(() => files.value.filter(file => file.mimeType.startsWith('image/')).length)
const directAllowed = computed(() => bytes.value <= 2_000_000_000 && imageCount.value <= 300)
const licenses = computed(() => [...new Map(files.value.flatMap(file => file.license ? [[file.license.id, file.license] as const] : [])).values()])
const selectedColumns = computed(() => (res.value?.columns ?? []).filter(column => columns.value.includes(column.id)))
const canDownload = computed(() => !!res.value && !busy.value && (mode.value === 'list'
  ? !!res.value.recordCount && !!columns.value.length
  : !!files.value.length && bytes.value < 10_000_000_000 && (!licenses.value.length || accepted.value)))

watch([() => props.modelValue, () => store.selection, reload], async (_, __, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  res.value = null
  error.value = ''
  accepted.value = false
  if (!props.modelValue) return
  try {
    const data = await trpc.collection.getFiles.mutate({ items: store.selection })
    if (cancelled) return
    res.value = data
    columns.value = (data.columns ?? []).map(column => column.id)
    views.value = [...new Set(data.files.map(file => file.recordView ?? ''))]
    excluded.value = []
    imageFormat.value = 'original'
    videoFormat.value = 'original'
    mode.value = data.files.length || !data.recordCount ? 'files' : 'list'
    delivery.value = directAllowed.value ? 'direct' : 'email'
  } catch (cause) {
    if (!cancelled) error.value = (cause as Error).message
  }
}, { immediate: true })
watchEffect(() => {
  if (!directAllowed.value) delivery.value = 'email'
  if (imageCount.value > 300) imageFormat.value = 'original'
})
watch(files, () => { accepted.value = false })

async function download() {
  if (!canDownload.value) return
  busy.value = true
  try {
    if (mode.value === 'list') {
      const result = await trpc.download.exportRecords.mutate({ items: store.selection, columns: selectedColumns.value.map(column => column.id), format: format.value })
      const content = Uint8Array.from(atob(result.content), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([content], { type: result.mimeType }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${labels.lowerPlural.value}.${format.value}`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } else {
      const result = await trpc.download.create.mutate({ collectionFileIds: files.value.map(file => file.id), imageFormat: imageFormat.value, imageResolution: imageResolution.value, videoFormat: videoFormat.value, videoResolution: videoResolution.value, downloadType: delivery.value } as RouterInput['download']['create'])
      queryClient.invalidateQueries({ queryKey: ['downloads'] })
      if (result.url) {
        const link = document.createElement('a')
        link.href = result.url
        document.body.append(link)
        link.click()
        link.remove()
      } else {
        toast.success('We’ll email your download link when it’s ready.')
        downloads.startRefetch()
      }
    }
    emit('update:modelValue', false)
  } catch (cause) {
    toast.error((cause as Error).message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="download-dialog" :aria-describedby="undefined">
      <DialogHeader>
        <DialogTitle>{{ res?.recordCount ? `Download ${labels.lowerPlural.value}` : 'Selected files' }}</DialogTitle>
      </DialogHeader>
      <div v-if="error" class="download-state" role="alert">
        <p>{{ error }}</p>
        <Button variant="outline" @click="reload++">Try again</Button>
      </div>
      <div v-else-if="!res" class="download-state" role="status">Loading selection…</div>
      <template v-else>
        <div v-if="res.recordCount" class="download-modes" role="group" aria-label="Download content">
          <button type="button" :aria-pressed="mode === 'files'" @click="mode = 'files'"><FileStack :size="18" />Files <span>{{ res.files.length }}</span></button>
          <button type="button" :aria-pressed="mode === 'list'" @click="mode = 'list'"><Table2 :size="18" />{{ labels.singular.value }} list <span>{{ res.recordCount }}</span></button>
        </div>
        <div class="download-body" :data-mode="mode">
          <div class="download-preview">
            <template v-if="mode === 'files'">
              <div v-if="filterViews" class="download-views">
                <div class="section-heading"><h3>Views</h3><button type="button" class="text-action" @click="views = [...viewOptions]">Select all</button></div>
                <div class="view-options">
                  <label v-for="view in viewOptions" :key="view" :class="{ chosen: views.includes(view) }">
                    <input v-model="views" type="checkbox" :value="view" />{{ view ? `View ${view}` : 'Unnumbered' }}
                  </label>
                </div>
              </div>
              <div class="section-heading"><h3>{{ files.length }} {{ files.length === 1 ? 'file' : 'files' }}</h3></div>
              <div v-if="displayedFiles.length" class="download-file-grid">
                <label v-for="file in displayedFiles" :key="file.id" class="download-file" :class="{ 'is-excluded': excluded.includes(file.id) }">
                  <span class="file-picture">
                    <input type="checkbox" :checked="!excluded.includes(file.id)" :aria-label="`Include ${file.name}`" @change="toggleFile(file.id)" />
                    <img v-if="file.thumbnailURL" :src="file.thumbnailURL" alt="" loading="lazy" />
                    <FileStack v-else :size="32" class="file-placeholder" />
                    <span v-if="filterViews && file.recordView" class="view-badge">{{ file.recordView }}</span>
                  </span>
                  <span class="file-name" :title="file.name">{{ file.name }}</span>
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                </label>
              </div>
              <p v-else class="download-state">{{ res.files.length ? 'Select a view to continue.' : 'No files in this selection.' }}</p>
            </template>
            <template v-else>
              <div class="section-heading"><h3>Preview</h3><span>{{ res.recordCount }} {{ labels.lowerPlural.value }}</span></div>
              <div v-if="selectedColumns.length" class="list-preview" tabindex="0" aria-label="List preview">
                <table><thead><tr><th v-for="column in selectedColumns" :key="column.id">{{ column.label }}</th></tr></thead>
                  <tbody><tr v-for="(row, index) in res.previewRows" :key="index"><td v-for="column in selectedColumns" :key="column.id">{{ row[res.columns.findIndex(item => item.id === column.id)] || '—' }}</td></tr></tbody>
                </table>
              </div>
              <p v-else class="download-state">Select at least one column.</p>
              <p v-if="res.recordCount > 5 && selectedColumns.length" class="preview-caption">First 5 of {{ res.recordCount }} {{ labels.lowerPlural.value }}</p>
            </template>
          </div>
          <aside class="download-options" aria-label="Download options">
            <template v-if="mode === 'list'">
              <fieldset><legend>Format</legend><div class="format-options">
                <label :class="{ chosen: format === 'xlsx' }"><input v-model="format" type="radio" value="xlsx" name="list-format" />Excel <span>.xlsx</span></label>
                <label :class="{ chosen: format === 'csv' }"><input v-model="format" type="radio" value="csv" name="list-format" />CSV <span>.csv</span></label>
              </div></fieldset>
              <fieldset class="columns-fieldset"><legend>Columns <span>{{ columns.length }} / {{ res.columns.length }}</span></legend>
                <div class="column-actions"><button type="button" class="text-action" @click="columns = res.columns.map(column => column.id)">Select all</button><button type="button" class="text-action" @click="columns = []">Clear</button></div>
                <div class="column-list"><label v-for="column in res.columns" :key="column.id"><input v-model="columns" type="checkbox" :value="column.id" />{{ column.label }}</label></div>
              </fieldset>
            </template>
            <CollectionDownloadFileOptions v-else :files="files"
              v-model:image-format="imageFormat" v-model:image-resolution="imageResolution"
              v-model:video-format="videoFormat" v-model:video-resolution="videoResolution"
              v-model:delivery="delivery" v-model:accepted="accepted" />
          </aside>
        </div>
        <div class="download-footer">
          <span role="status">{{ mode === 'list' ? `${res.recordCount} ${labels.lowerPlural.value} · ${columns.length} columns` : `${files.length} files · ${formatFileSize(bytes)}` }}</span>
          <div><Button variant="outline" :disabled="busy" @click="emit('update:modelValue', false)">Cancel</Button><Button :disabled="!canDownload" @click="download"><Download :size="16" />{{ busy ? 'Preparing…' : mode === 'list' ? `Download ${format === 'xlsx' ? 'Excel' : 'CSV'}` : delivery === 'email' ? 'Email download link' : 'Download' }}</Button></div>
        </div>
        <p v-if="mode === 'files' && bytes >= 10_000_000_000" class="text-sm text-destructive" role="alert">Select fewer files to stay under 10 GB.</p>
      </template>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
:global(.download-dialog) { display:flex; flex-direction:column; gap:20px; width:100vw; height:100dvh; max-width:none; max-height:none; border:0; border-radius:0; padding:20px 28px; overflow:hidden; }
.download-dialog h3, .download-dialog legend { font-size:13px; font-weight:600; }
.download-modes { display:flex; gap:8px; }
.download-modes button { display:flex; align-items:center; gap:8px; padding:10px 14px; border:1px solid hsl(var(--border)); font-size:14px; }
.download-modes button[aria-pressed=true] { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); border-color:hsl(var(--primary)); }
.download-modes span { font-size:12px; opacity:.8; }
.download-body { display:grid; grid-template-columns:minmax(0,1fr) 320px; flex:1; min-height:0; }
.download-preview { min-width:0; padding-right:24px; max-height:100%; overflow-y:auto; }
.download-options { display:flex; flex-direction:column; gap:22px; border-left:1px solid hsl(var(--border)); padding-left:24px; min-width:0; max-height:100%; overflow-y:auto; }
.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; font-size:12px; color:hsl(var(--muted-foreground)); }
.section-heading h3 { color:hsl(var(--foreground)); }
.text-action { font-size:12px; text-decoration:underline; text-underline-offset:3px; }
.download-views { margin-bottom:22px; }
.view-options { display:flex; flex-wrap:wrap; gap:8px; }
.view-options label { display:flex; align-items:center; gap:7px; padding:7px 9px; border:1px solid hsl(var(--border)); font-size:12px; cursor:pointer; }
.chosen { border-color:hsl(var(--primary)) !important; }
.download-dialog input { width:16px; height:16px; accent-color:hsl(var(--primary)); flex-shrink:0; }
.download-dialog button:focus-visible, .download-dialog input:focus-visible, .download-dialog select:focus-visible, .list-preview:focus-visible { outline:2px solid hsl(var(--ring)); outline-offset:3px; }
.download-file-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:18px 12px; }
.download-file { min-width:0; cursor:pointer; }
.download-file.is-excluded .file-picture img { filter:grayscale(1); opacity:.35; }
.download-file.is-excluded .file-placeholder, .download-file.is-excluded .view-badge { opacity:.4; }
.download-file.is-excluded .file-name { color:hsl(var(--muted-foreground)); }
.file-picture { position:relative; display:flex; align-items:center; justify-content:center; height:160px; background:hsl(var(--muted)); border:1px solid hsl(var(--border)); cursor:pointer; }
.file-picture input { position:absolute; top:8px; left:8px; }
.file-picture img { width:100%; height:100%; object-fit:contain; padding:18px; }
.file-placeholder { color:hsl(var(--muted-foreground)); }
.view-badge { position:absolute; bottom:6px; right:6px; padding:2px 5px; background:hsl(var(--background)); font-size:11px; }
.file-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; margin-top:6px; }
.file-size, .preview-caption { display:block; font-size:12px; color:hsl(var(--muted-foreground)); margin-top:4px; }
.download-options legend { margin-bottom:10px; width:100%; }
.download-options legend span { float:right; font-weight:400; color:hsl(var(--muted-foreground)); }
.format-options, .delivery-options, .column-list { display:flex; flex-direction:column; gap:10px; }
.format-options label, .delivery-options label, .column-list label, .accept-terms { display:flex; align-items:center; gap:9px; font-size:13px; cursor:pointer; overflow-wrap:anywhere; }
.format-options label { border:1px solid hsl(var(--border)); padding:10px; }
.format-options span { margin-left:auto; font-size:12px; color:hsl(var(--muted-foreground)); }
.column-actions { display:flex; justify-content:space-between; margin-bottom:12px; }
.column-list label { padding:4px 0; }
.list-preview { overflow-x:auto; border:1px solid hsl(var(--border)); }
.list-preview table { width:100%; border-collapse:collapse; text-align:left; font-size:12px; white-space:nowrap; }
.list-preview th { background:hsl(var(--muted)); font-weight:600; }
.list-preview th, .list-preview td { padding:12px; border-bottom:1px solid hsl(var(--border)); max-width:240px; overflow:hidden; text-overflow:ellipsis; }
.list-preview tr:last-child td { border-bottom:0; }
.download-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-top:18px; border-top:1px solid hsl(var(--border)); }
.download-footer > span { color:hsl(var(--muted-foreground)); font-size:12px; }
.download-footer > div { display:flex; gap:8px; }
.download-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:40px 16px; font-size:14px; color:hsl(var(--muted-foreground)); }
@media (max-width:640px) {
  .download-body { display:flex; flex-direction:column; min-height:0; max-height:none; overflow-y:auto; }
  .download-preview { flex-shrink:0; padding-right:0; max-height:none; overflow-y:visible; }
  .download-options { flex-shrink:0; border-left:0; border-top:1px solid hsl(var(--border)); padding:20px 0 0; margin-top:20px; max-height:none; }
  .download-body[data-mode="list"] .download-options { order:-1; border-top:0; border-bottom:1px solid hsl(var(--border)); padding:0 0 20px; margin:0 0 20px; }
  .download-footer { align-items:stretch; flex-direction:column; }
  .download-footer > div { justify-content:flex-end; }
  .download-modes button { flex:1; justify-content:center; padding:10px; }
}
</style>
