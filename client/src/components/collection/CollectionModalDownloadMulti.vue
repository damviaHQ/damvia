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
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { ArrowDown, ArrowUp, FileStack, GripVertical, Table2, Download } from '@lucide/vue'
import { useQueryClient } from '@tanstack/vue-query'
import Draggable from 'vuedraggable'
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
const activeTab = ref<'files' | 'products'>('files')
const format = ref<'xlsx' | 'csv'>('xlsx')
const columns = ref<string[]>([])
const orderedColumns = ref<{ id: string, label: string }[]>([])
const views = ref<string[]>([])
const excluded = ref<string[]>([])
const accepted = ref(false)
const imageFormat = ref<'original' | 'jpg' | 'png' | 'webp'>('original')
const imageResolution = ref<'high' | 'medium' | 'low'>('medium')
const videoFormat = ref<'original' | 'mp4' | 'webm'>('original')
const videoResolution = ref<'high' | 'medium' | 'low'>('medium')
const delivery = ref<'direct' | 'email'>('direct')
const reload = ref(0)
const productViewsEnabled = computed(() => !!res.value?.viewsEnabled && !!res.value.recordCount)
const availableFiles = computed(() => (res.value?.files ?? []).filter(file => !productViewsEnabled.value || !!file.recordView))
const viewOptions = computed(() => [...new Set(availableFiles.value.map(file => file.recordView).filter((view): view is string => !!view))].sort())
const filterViews = computed(() => productViewsEnabled.value && !!viewOptions.value.length)
const displayedFiles = computed(() => availableFiles.value.filter(file => !filterViews.value || views.value.includes(file.recordView ?? '')))
const files = computed(() => displayedFiles.value.filter(file => !excluded.value.includes(file.id)))
function toggleFile(id: string) {
  excluded.value = excluded.value.includes(id) ? excluded.value.filter(current => current !== id) : [...excluded.value, id]
}
const bytes = computed(() => files.value.reduce((sum, file) => sum + file.size, 0))
const imageCount = computed(() => files.value.filter(file => file.mimeType.startsWith('image/')).length)
const directAllowed = computed(() => bytes.value <= 2_000_000_000 && imageCount.value <= 300)
const licenses = computed(() => [...new Map(files.value.flatMap(file => file.license ? [[file.license.id, file.license] as const] : [])).values()])
const selectedColumns = computed(() => orderedColumns.value.filter(column => columns.value.includes(column.id) && (format.value === 'xlsx' || column.id !== 'picture')))
const canDownloadFiles = computed(() => !!res.value && !busy.value && !!files.value.length && bytes.value < 10_000_000_000 && (!licenses.value.length || accepted.value))
const canDownloadList = computed(() => !!res.value && !busy.value && !!res.value.recordCount && !!selectedColumns.value.length)

function moveColumn(index: number, direction: number) {
  const next = [...orderedColumns.value]
  const target = index + direction
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  orderedColumns.value = next
}

async function focusTab(tab: 'files' | 'products') {
  activeTab.value = tab
  await nextTick()
  document.getElementById(tab === 'files' ? 'download-files-tab' : 'download-products-tab')?.focus()
}

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
    orderedColumns.value = [...data.columns].sort((a, b) => Number(b.id === 'picture') - Number(a.id === 'picture'))
    const availableViews = [...new Set(data.files.map(file => file.recordView).filter((view): view is string => !!view))].sort()
    views.value = availableViews.length ? [availableViews.includes(data.mainView) ? data.mainView : availableViews[0]] : []
    activeTab.value = data.files.some(file => !data.viewsEnabled || !data.recordCount || !!file.recordView) ? 'files' : 'products'
    excluded.value = []
    imageFormat.value = 'original'
    videoFormat.value = 'original'
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

async function download(choice: 'files' | 'list' | 'all') {
  if (choice === 'list' ? !canDownloadList.value : choice === 'files' ? !canDownloadFiles.value : !canDownloadFiles.value || !canDownloadList.value) return
  const items = store.selection.map(item => ({ ...item }))
  const selectedColumnIds = selectedColumns.value.map(column => column.id)
  const exportFormat = format.value
  const fileInput = {
    collectionFileIds: files.value.map(file => file.id),
    imageFormat: imageFormat.value,
    imageResolution: imageResolution.value,
    videoFormat: videoFormat.value,
    videoResolution: videoResolution.value,
    downloadType: delivery.value,
    ...(choice === 'all' ? { recordExport: { items, columns: selectedColumnIds, format: exportFormat } } : {}),
  } as RouterInput['download']['create']
  busy.value = true
  if (choice !== 'list') downloads.startPreparing()
  emit('update:modelValue', false)
  const notification = toast.loading('Preparing your download… You can keep browsing.')
  busy.value = false
  try {
    if (choice === 'list') {
      const result = await trpc.download.exportRecords.mutate({ items, columns: selectedColumnIds, format: exportFormat })
      const content = Uint8Array.from(atob(result.content), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([content], { type: result.mimeType }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${labels.lowerPlural.value}.${exportFormat}`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      toast.dismiss(notification)
      toast.success('Download ready.')
    } else {
      const result = await trpc.download.create.mutate(fileInput)
      await queryClient.invalidateQueries({ queryKey: ['downloads'] })
      toast.dismiss(notification)
      if (result.url) {
        const link = document.createElement('a')
        link.href = result.url
        document.body.append(link)
        link.click()
        link.remove()
        toast.success('Download ready.')
      } else {
        toast.success('We’ll email your download link when it’s ready.')
        downloads.startRefetch()
      }
    }
  } catch (cause) {
    toast.dismiss(notification)
    toast.error((cause as Error).message)
  } finally {
    if (choice !== 'list') downloads.finishPreparing()
  }
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="download-dialog" :aria-describedby="undefined">
      <DialogHeader class="download-header">
        <DialogTitle>{{ res?.recordCount ? `Download ${labels.lowerPlural.value}` : 'Selected files' }}</DialogTitle>
      </DialogHeader>
      <div v-if="error" class="download-state" role="alert">
        <p>{{ error }}</p>
        <Button variant="outline" @click="reload++">Try again</Button>
      </div>
      <div v-else-if="!res" class="download-state" role="status">Loading selection…</div>
      <template v-else>
        <div class="download-body">
          <div class="download-preview">
            <template v-if="availableFiles.length && activeTab === 'files'">
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
              <p v-else class="download-state">Select a view to continue.</p>
            </template>
            <div v-if="res.recordCount && activeTab === 'products'" class="record-preview">
              <div class="section-heading"><h3>{{ labels.singular.value }} list</h3><span>{{ res.recordCount }} {{ labels.lowerPlural.value }}</span></div>
              <div v-if="selectedColumns.length" class="list-preview" tabindex="0" aria-label="List preview">
                <table><thead><tr><th v-for="column in selectedColumns" :key="column.id">{{ column.label }}</th></tr></thead>
                  <tbody><tr v-for="(row, index) in res.previewRows" :key="index"><td v-for="(column, columnIndex) in selectedColumns" :key="column.id">
                    <img v-if="column.id === 'picture' && res.previewPictures[index]" class="product-picture" :src="res.previewPictures[index] ?? undefined" alt="" loading="lazy" />
                    <template v-else-if="column.id !== 'picture'"><img v-if="columnIndex === 0 && !selectedColumns.some(item => item.id === 'picture') && res.previewPictures[index]" class="product-picture is-inline" :src="res.previewPictures[index] ?? undefined" alt="" loading="lazy" />{{ row[res.columns.findIndex(item => item.id === column.id)] || '—' }}</template>
                    <span v-else class="picture-empty" aria-label="No picture" />
                  </td></tr></tbody>
                </table>
              </div>
              <p v-else class="download-state">Select at least one column.</p>
              <p v-if="res.recordCount > 12 && selectedColumns.length" class="preview-caption">First 12 of {{ res.recordCount }} {{ labels.lowerPlural.value }}</p>
            </div>
          </div>
          <aside class="download-options" aria-label="Download options">
            <div v-if="availableFiles.length && res.recordCount" class="download-tabs" role="tablist" aria-label="Download settings" @keydown.left.prevent="focusTab(activeTab === 'files' ? 'products' : 'files')" @keydown.right.prevent="focusTab(activeTab === 'files' ? 'products' : 'files')" @keydown.home.prevent="focusTab('files')" @keydown.end.prevent="focusTab('products')">
              <button id="download-files-tab" type="button" role="tab" :aria-selected="activeTab === 'files'" aria-controls="download-files-panel" :tabindex="activeTab === 'files' ? 0 : -1" @click="activeTab = 'files'"><FileStack :size="16" />Files</button>
              <button id="download-products-tab" type="button" role="tab" :aria-selected="activeTab === 'products'" aria-controls="download-products-panel" :tabindex="activeTab === 'products' ? 0 : -1" @click="activeTab = 'products'"><Table2 :size="16" />{{ labels.plural.value }}</button>
            </div>
            <section v-if="availableFiles.length && (!res.recordCount || activeTab === 'files')" id="download-files-panel" class="download-section" :role="res.recordCount ? 'tabpanel' : undefined" :aria-labelledby="res.recordCount ? 'download-files-tab' : undefined" aria-label="Files options">
              <h3 v-if="!res.recordCount" class="download-section-heading"><FileStack :size="16" />Files <span>{{ availableFiles.length }}</span></h3>
              <div class="download-section-body">
                <div v-if="filterViews" class="download-views">
                  <div class="section-heading"><h3>Views</h3><div class="view-actions"><button type="button" class="text-action" @click="views = [...viewOptions]">Select all</button><button type="button" class="text-action" @click="views = []">Remove all</button></div></div>
                  <div class="view-options">
                    <label v-for="view in viewOptions" :key="view" :class="{ chosen: views.includes(view) }">
                      <input v-model="views" type="checkbox" :value="view" />{{ view }}
                    </label>
                  </div>
                </div>
                <CollectionDownloadFileOptions :files="files"
                  v-model:image-format="imageFormat" v-model:image-resolution="imageResolution"
                  v-model:video-format="videoFormat" v-model:video-resolution="videoResolution"
                  v-model:delivery="delivery" v-model:accepted="accepted" />
              </div>
            </section>
            <section v-if="res.recordCount && (!availableFiles.length || activeTab === 'products')" id="download-products-panel" class="download-section" :role="availableFiles.length ? 'tabpanel' : undefined" :aria-labelledby="availableFiles.length ? 'download-products-tab' : undefined" :aria-label="`${labels.singular.value} list options`">
              <h3 v-if="!availableFiles.length" class="download-section-heading"><Table2 :size="16" />{{ labels.singular.value }} list <span>{{ res.recordCount }}</span></h3>
              <div class="download-section-body">
                <fieldset><legend>Format</legend><div class="format-options">
                  <label :class="{ chosen: format === 'xlsx' }"><input v-model="format" type="radio" value="xlsx" name="list-format" />Excel <span>.xlsx</span></label>
                  <label :class="{ chosen: format === 'csv' }"><input v-model="format" type="radio" value="csv" name="list-format" />CSV <span>.csv</span></label>
                </div></fieldset>
                <fieldset class="columns-fieldset"><legend>Columns <span>{{ selectedColumns.length }} / {{ res.columns.length - (format === 'csv' && res.columns.some(column => column.id === 'picture') ? 1 : 0) }}</span></legend>
                  <div class="column-actions"><button type="button" class="text-action" @click="columns = res.columns.map(column => column.id)">Select all</button><button type="button" class="text-action" @click="columns = []">Clear</button></div>
                  <Draggable v-model="orderedColumns" item-key="id" handle=".column-grip" tag="ul" class="column-list" :animation="150">
                    <template #item="{ element: column, index }">
                      <li class="column-choice" :class="{ 'is-unavailable': format === 'csv' && column.id === 'picture' }">
                        <button type="button" class="column-grip" :aria-label="`Drag ${column.label} to reorder`"><GripVertical :size="16" /></button>
                        <label><input v-model="columns" type="checkbox" :value="column.id" :disabled="format === 'csv' && column.id === 'picture'" />{{ column.label }}</label>
                        <span v-if="format === 'csv' && column.id === 'picture'" class="column-hint">Excel only</span>
                        <div class="column-move"><button type="button" :aria-label="`Move ${column.label} up`" :disabled="index === 0" @click="moveColumn(index, -1)"><ArrowUp :size="14" /></button><button type="button" :aria-label="`Move ${column.label} down`" :disabled="index === orderedColumns.length - 1" @click="moveColumn(index, 1)"><ArrowDown :size="14" /></button></div>
                      </li>
                    </template>
                  </Draggable>
                </fieldset>
              </div>
            </section>
          </aside>
        </div>
        <div class="download-footer">
          <span role="status">{{ [availableFiles.length ? `${files.length} files` : '', res.recordCount ? `${res.recordCount} ${labels.lowerPlural.value}` : ''].filter(Boolean).join(' · ') }}</span>
          <div class="download-actions">
            <Button variant="outline" :disabled="busy" @click="emit('update:modelValue', false)">Cancel</Button>
            <Button v-if="availableFiles.length" variant="outline" :disabled="!canDownloadFiles" @click="download('files')"><Download :size="16" />{{ delivery === 'email' ? 'Email files link' : 'Download files' }}</Button>
            <Button v-if="res.recordCount" variant="outline" :disabled="!canDownloadList" @click="download('list')"><Download :size="16" />{{ `Download ${format === 'xlsx' ? 'Excel' : 'CSV'}` }}</Button>
            <Button v-if="availableFiles.length && res.recordCount" :disabled="!canDownloadFiles || !canDownloadList" @click="download('all')"><Download :size="16" />{{ delivery === 'email' ? 'Email all link' : 'Download all' }}</Button>
          </div>
        </div>
        <p v-if="availableFiles.length && bytes >= 10_000_000_000" class="text-sm text-destructive" role="alert">Select fewer files to stay under 10 GB.</p>
      </template>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
:global(.download-dialog) { display:flex; flex-direction:column; gap:0; width:100vw; height:100dvh; max-width:none; max-height:none; border:0; border-radius:0; padding:0; overflow:hidden; }
:global(.download-dialog [data-dialog-close]) { top:7px; right:24px; }
.download-dialog :deep(button), .download-dialog :deep(select) { border-radius:0; }
.download-dialog h3, .download-dialog legend { font-size:13px; font-weight:600; }
.download-header { display:flex; flex-direction:row; align-items:center; min-height:46px; padding:7px 64px 7px 28px; border-bottom:1px solid hsl(var(--border)); }
.download-header :deep(h2) { font-size:16px; line-height:24px; }
.download-body { display:grid; grid-template-columns:minmax(0,1fr) 320px; flex:1; min-height:0; padding:16px 0 0 28px; }
.download-preview { min-width:0; max-height:100%; padding-right:20px; overflow-y:auto; }
.download-options { display:flex; flex-direction:column; border-left:1px solid hsl(var(--border)); min-width:0; max-height:100%; overflow-y:auto; }
.download-tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); border-bottom:1px solid hsl(var(--border)); }
.download-tabs button { display:flex; align-items:center; justify-content:center; gap:8px; min-height:42px; border-bottom:2px solid transparent; font-size:13px; color:hsl(var(--muted-foreground)); }
.download-tabs button[aria-selected="true"] { border-bottom-color:hsl(var(--foreground)); color:hsl(var(--foreground)); font-weight:600; }
.download-tabs button:hover { color:hsl(var(--foreground)); }
.download-section { flex-shrink:0; padding:18px 20px 24px; }
.download-section-heading { display:flex; align-items:center; gap:9px; margin-bottom:18px; font-size:13px; font-weight:600; }
.download-section-heading span { margin-left:auto; font-size:12px; font-weight:400; color:hsl(var(--muted-foreground)); font-variant-numeric:tabular-nums; }
.download-section-body { display:flex; flex-direction:column; gap:20px; }
.download-section-body :deep(.file-options) { gap:20px; }
.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; font-size:12px; color:hsl(var(--muted-foreground)); }
.section-heading h3 { color:hsl(var(--foreground)); }
.text-action { font-size:12px; text-decoration:underline; text-underline-offset:3px; }
.view-actions { display:flex; align-items:center; gap:12px; }
.download-views { min-width:0; }
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
.format-options, .delivery-options { display:flex; flex-direction:column; gap:10px; }
.format-options label, .delivery-options label, .column-list label, .accept-terms { display:flex; align-items:center; gap:9px; font-size:13px; cursor:pointer; overflow-wrap:anywhere; }
.format-options label { border:1px solid hsl(var(--border)); padding:10px; }
.format-options span { margin-left:auto; font-size:12px; color:hsl(var(--muted-foreground)); }
.column-actions { display:flex; justify-content:space-between; margin-bottom:12px; }
.column-list { display:flex; flex-direction:column; gap:2px; padding:0; margin:0; list-style:none; }
.column-choice { display:flex; align-items:center; gap:6px; min-height:38px; padding:2px 4px; }
.column-choice:hover, .column-choice:focus-within { background:hsl(var(--muted)); }
.column-choice.is-unavailable { opacity:.55; }
.column-choice label { flex:1; min-width:0; }
.column-grip, .column-move button { display:flex; align-items:center; justify-content:center; width:24px; height:28px; color:hsl(var(--muted-foreground)); }
.column-grip { cursor:grab; }
.column-grip:active { cursor:grabbing; }
.column-move { display:flex; opacity:0; }
.column-choice:hover .column-move, .column-choice:focus-within .column-move { opacity:1; }
.column-move button:disabled { opacity:.25; }
.column-hint { font-size:11px; color:hsl(var(--muted-foreground)); white-space:nowrap; }
.list-preview { overflow-x:auto; border:1px solid hsl(var(--border)); }
.list-preview table { width:100%; border-collapse:collapse; text-align:left; font-size:12px; white-space:nowrap; }
.list-preview th { background:hsl(var(--muted)); font-weight:600; }
.list-preview th, .list-preview td { padding:12px; border-bottom:1px solid hsl(var(--border)); max-width:240px; overflow:hidden; text-overflow:ellipsis; }
.list-preview tr:last-child td { border-bottom:0; }
.product-picture { display:block; width:48px; height:48px; object-fit:contain; background:hsl(var(--muted)); }
.product-picture.is-inline { display:inline-block; width:38px; height:38px; margin-right:10px; vertical-align:middle; }
.picture-empty { display:block; width:48px; height:48px; background:hsl(var(--muted)); }
.download-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:62px; margin:0 20px 0 28px; padding:10px 0; border-top:1px solid hsl(var(--border)); }
.download-footer > span { color:hsl(var(--muted-foreground)); font-size:12px; }
.download-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.download-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:40px 16px; font-size:14px; color:hsl(var(--muted-foreground)); }
@media (max-width:640px) {
  :global(.download-dialog [data-dialog-close]) { right:12px; }
  .download-header { padding:7px 52px 7px 16px; }
  .download-body { padding:14px 16px 0; }
  .download-body { display:flex; flex-direction:column; min-height:0; max-height:none; overflow-y:auto; }
  .download-preview { flex-shrink:0; max-height:none; padding-right:0; overflow-y:visible; }
  .download-options { order:-1; flex-shrink:0; border-left:0; border-bottom:1px solid hsl(var(--border)); padding:0 0 20px; margin:0 0 20px; max-height:none; }
  .download-section { padding:18px 0 20px; }
  .download-footer { align-items:stretch; flex-direction:column; margin:0 16px; }
  .download-actions { justify-content:flex-start; }
  .column-move { opacity:1; }
}
</style>
