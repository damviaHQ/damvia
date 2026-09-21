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
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import AdminAssetsLinkTree from "@/components/admin/AdminAssetsLinkTree.vue"
import RecordPicker, { type RecordTarget } from "@/components/admin/RecordPicker.vue"
import { useRecordLabel } from "@/composables/useRecordLabel"
import Loader from "@/components/Loader.vue"
import PathBreadcrumb, { type PathBreadcrumbItem } from "@/components/navigation/PathBreadcrumb.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  CloudOff,
  Copyright,
  FileCog,
  Folder,
  FolderOpen,
  GripVertical,
  HardDrive,
  Link2,
  Server,
} from "@lucide/vue"
import type { AcceptableValue } from "reka-ui"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"

export type Asset = RouterOutput["asset"]["tree"][number]

const route = useRoute()
const queryClient = useQueryClient()
const toast = useGlobalToast()
const isEditModalOpen = ref(false)
const NO_ASSET_TYPE = "NO_ASSET_TYPE"
const NO_LICENSE = "NO_LICENSE"
const form = ref<{ assetTypeId: string; licenseId: string }>({
  assetTypeId: NO_ASSET_TYPE,
  licenseId: NO_LICENSE,
})
const { data: assetTypes } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})
const { data: licenses } = useQuery({
  queryKey: ["licenses"],
  queryFn: () => trpc.license.list.query(),
})
const {
  data: asset,
  error: assetError,
  isError: isAssetError,
  isPending: isAssetLoading,
} = useQuery({
  enabled: computed(() => !!route.params.id),
  queryKey: computed(() => ["asset", route.params.id]),
  queryFn: () => trpc.asset.findById.query(route.params.id as string),
})
const { status, data: assets, error } = useQuery({
  queryKey: ["asset", "tree"],
  queryFn: () => trpc.asset.tree.query(),
})
const { data: sourceStatus } = useQuery({
  queryKey: ["asset", "sources"],
  queryFn: () => trpc.asset.sources.query(),
  refetchInterval: 30_000,
})
const sources = computed(() => sourceStatus.value?.sources ?? [])
const syncPaused = computed(() => !!sourceStatus.value?.sync.paused)
const sourceStateLabels: Record<string, string> = { ok: 'Synced', failed: 'Failed', running: 'Syncing', never: 'Never synced' }
const sourceStateVariant = (state: string) => state === 'failed' ? 'destructive' : state === 'ok' ? 'secondary' : 'outline'
const formatDate = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleString() : 'never'
const number = (value: number) => value.toLocaleString()

const assetPath = computed(() => {
  if (!asset.value) {
    return []
  }
  const path = [asset.value]
  for (let current = asset.value.parent; current; current = current.parent) {
    path.push(current)
  }
  return path.reverse()
})

watch([asset], () => {
  form.value = {
    assetTypeId: asset.value?.assetTypeId ?? NO_ASSET_TYPE,
    licenseId: asset.value?.licenseId ?? NO_LICENSE,
  }
})

const assetPaths = computed(() => {
  const paths: string[][] = []
  const pushItems = (prefix: string[], assets: Asset[]) =>
    assets?.forEach((asset) => {
      paths.push([...prefix, asset.id])
      if (asset.children) {
        pushItems([...prefix, asset.id], asset.children)
      }
    })
  if (assets.value) {
    pushItems([], assets.value)
  }
  return paths
})
const openAssets = computed(() => {
  if (!(route.name === "admin-assets" && route.params.id)) {
    return []
  }
  return assetPaths.value.find((item) => item[item.length - 1] === route.params.id)
})
const rootAssets = computed(() => assets.value?.filter((asset) => !asset.parentId) ?? [])
const recordLabel = useRecordLabel()
const { data: attachments } = useQuery({
  queryKey: computed(() => ["entity-resolution", "attachments", route.params.id]),
  queryFn: () => trpc.entityResolution.folderAttachments.query(String(route.params.id)),
  enabled: computed(() => !!route.params.id),
})
const pickerOpen = ref(false)
const linking = ref(false)
async function attachFolder(target: RecordTarget) {
  linking.value = true
  try {
    const result = await trpc.entityResolution.attach.mutate({ target, folderId: String(route.params.id) })
    toast.success(`${result.files} ${result.files === 1 ? "file" : "files"} linked`)
    pickerOpen.value = false
    await queryClient.invalidateQueries({ queryKey: ["entity-resolution"] })
    await queryClient.invalidateQueries({ queryKey: ["enrichment"] })
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    linking.value = false
  }
}
async function detachFolder(attachmentId: string) {
  try {
    await trpc.entityResolution.detach.mutate({ attachmentId })
    toast.success("Link removed")
    await queryClient.invalidateQueries({ queryKey: ["entity-resolution"] })
    await queryClient.invalidateQueries({ queryKey: ["enrichment"] })
  } catch (error) {
    toast.error((error as Error).message)
  }
}
const { data: folderRules } = useQuery({
  queryKey: ["asset-type-rules"],
  queryFn: () => trpc.assetTypeRule.list.query(),
})
const assetTypeOrigin = computed(() => {
  if (asset.value?.assetTypeSource === "manual") return "set by hand"
  if (asset.value?.assetTypeSource === "rule") return `set by the rule ${folderRules.value?.rules.find((rule) => rule.id === asset.value?.assetTypeRuleId)?.pattern ?? "(removed)"}`
  if (asset.value?.assetTypeSource === "inherited") return "inherited from a parent folder"
  return "not applied yet, waiting for the next sync"
})
const childFolders = computed(() => asset.value?.children ?? [])
const assetFiles = computed(() => asset.value?.files ?? [])
const breadcrumbItems = computed<PathBreadcrumbItem[]>(() => [
  { id: 'assets', label: 'Assets', to: { name: 'admin-assets' } },
  ...assetPath.value.map(item => ({
    id: item.id,
    label: item.name,
    to: { name: 'admin-assets', params: { id: item.id } },
  })),
])

function onSubmit() {
  trpc.asset.update
    .mutate({
      id: asset.value.id,
      assetTypeId:
        form.value.assetTypeId === NO_ASSET_TYPE ? null : form.value.assetTypeId,
      licenseId: form.value.licenseId === NO_LICENSE ? null : form.value.licenseId,
    })
    .then(() => queryClient.invalidateQueries({ queryKey: ["asset", route.params.id] }))
    .then(() => {
      toast.success("Asset Types and License settings saved")
      isEditModalOpen.value = false
    })
    .catch((error) => toast.error((error as Error).message))
}

function onAssetTypeChange(value: AcceptableValue) {
  form.value.assetTypeId = String(value)
}

function onLicenseChange(value: AcceptableValue) {
  form.value.licenseId = String(value)
}


function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2)
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <ResizablePanelGroup v-else-if="status === 'success'" direction="horizontal"
    class="admin-assets-workspace">
    <ResizablePanel :default-size="23" class="asset-browser__sidebar">
      <div class="asset-browser__sidebar-inner">
        <div class="asset-browser__sidebar-heading">
          <span class="asset-browser__sidebar-icon"><FolderOpen /></span>
          <div>
            <h2>Cloud folders</h2>
            <p>{{ rootAssets.length }} {{ rootAssets.length === 1 ? 'source' : 'sources' }}</p>
          </div>
        </div>
        <nav aria-label="Cloud folders" class="asset-browser__tree">
          <AdminAssetsLinkTree v-for="treeAsset in assets" :key="treeAsset.id" :asset="treeAsset"
            :open-items="openAssets ?? []" />
        </nav>
      </div>
    </ResizablePanel>
    <ResizableHandle class="asset-browser__handle">
      <GripVertical />
    </ResizableHandle>
    <ResizablePanel :default-size="77">
      <div class="asset-browser__main">
        <div class="asset-browser__breadcrumb">
          <PathBreadcrumb :items="breadcrumbItems" />
        </div>
        <div v-if="isAssetLoading && route.params.id">
          <Loader :text="true" />
        </div>
        <div v-else-if="isAssetError" class="admin-error" role="alert">
          {{ assetError?.message ?? 'The folder could not be loaded.' }}
        </div>
        <template v-else-if="asset">
          <AdminPageHeader
            class="asset-browser__page-heading"
            :title="asset.name"
            :description="`${childFolders.length} ${childFolders.length === 1 ? 'folder' : 'folders'} · ${assetFiles.length} ${assetFiles.length === 1 ? 'file' : 'files'}`"
          >
            <template #lead><span class="asset-browser__eyebrow">Folder</span></template>
          </AdminPageHeader>

          <section class="asset-settings dv-panel" aria-labelledby="asset-settings-heading">
            <div class="asset-settings__intro">
              <span class="asset-settings__icon"><FileCog /></span>
              <div>
                <h2 id="asset-settings-heading">Folder defaults</h2>
                <p>Apply an asset type and license to this folder.</p>
                <p v-if="asset.assetTypeId">Asset type {{ assetTypeOrigin }}.</p>
              </div>
            </div>
            <div class="asset-settings__fields">
              <div class="asset-settings__field">
                <span><FileCog /> Asset type</span>
                <Select v-model="form.assetTypeId" @update:modelValue="onAssetTypeChange">
                  <SelectTrigger aria-label="Asset type">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="NO_ASSET_TYPE">No asset type</SelectItem>
                    <SelectItem v-for="type in assetTypes" :key="type.id" :value="type.id">
                      {{ type.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="asset-settings__field">
                <span><Copyright /> License</span>
                <Select v-model="form.licenseId" @update:modelValue="onLicenseChange">
                  <SelectTrigger aria-label="License">
                    <SelectValue placeholder="Select license" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="NO_LICENSE">No license</SelectItem>
                    <SelectItem v-for="license in licenses" :key="license.id" :value="license.id">
                      {{ license.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" class="dv-button dv-button--primary" @click="onSubmit">Save defaults</Button>
            </div>
          </section>

          <section class="asset-settings dv-panel" aria-labelledby="asset-links-heading">
            <div class="asset-settings__intro">
              <span class="asset-settings__icon"><Link2 /></span>
              <div>
                <h2 id="asset-links-heading">Linked {{ recordLabel.lower.value }}</h2>
                <p>Every file in this folder and its subfolders is linked to what you choose here, whatever the matching steps find.</p>
              </div>
            </div>
            <ul v-if="attachments?.length" class="asset-links">
              <li v-for="attachment in attachments" :key="attachment.id">
                <span>
                  <strong>{{ attachment.targetKind === 'record' ? attachment.recordKey : `${attachment.attributeName} = ${attachment.attributeValue}` }}</strong>
                  <small v-if="attachment.inherited"> · from {{ attachment.path }}</small>
                  <small v-else-if="attachment.createdBy"> · set by {{ attachment.createdBy }}</small>
                </span>
                <Button v-if="!attachment.inherited" type="button" variant="ghost" size="sm" @click="detachFolder(attachment.id)">Detach</Button>
              </li>
            </ul>
            <p v-else class="admin-text-secondary">Nothing linked by hand. Files are matched by the steps of their asset type.</p>
            <div><Button type="button" variant="outline" @click="pickerOpen = true">Link a {{ recordLabel.lower.value }} or a range</Button></div>
          </section>
          <RecordPicker :open="pickerOpen" :title="`Link ${asset.name}`" description="Every file in this folder and its subfolders is linked, and files added later follow." :saving="linking" @update:open="(open) => (pickerOpen = open)" @confirm="attachFolder" />

          <section v-if="childFolders.length" class="asset-browser__section" aria-labelledby="folders-heading">
            <div class="asset-browser__section-heading">
              <div>
                <h2 id="folders-heading">Folders</h2>
                <p>Browse deeper into this cloud source.</p>
              </div>
              <span>{{ childFolders.length }}</span>
            </div>
            <div class="asset-grid asset-grid--folders">
              <router-link v-for="folder in childFolders" :key="folder.id"
                :to="{ name: 'admin-assets', params: { id: folder.id } }" class="asset-card asset-card--folder">
                <span class="asset-card__visual"><Folder /></span>
                <span class="asset-card__copy">
                  <strong>{{ folder.name }}</strong>
                  <small>Folder</small>
                </span>
              </router-link>
            </div>
          </section>

          <section v-if="assetFiles.length" class="asset-browser__section" aria-labelledby="files-heading">
            <div class="asset-browser__section-heading">
              <div>
                <h2 id="files-heading">Files</h2>
                <p>Assets stored in this folder.</p>
              </div>
              <span>{{ assetFiles.length }}</span>
            </div>
            <div class="asset-grid asset-grid--files">
              <article v-for="file in assetFiles" :key="file.id" class="asset-card asset-card--file">
                <div class="asset-card__thumbnail">
                  <img :src="file.thumbnailURL ?? thumbnailPlaceholder" alt="" loading="lazy" decoding="async" />
                  <Badge class="asset-card__extension">{{ getFileExtension(file.name).toUpperCase() }}</Badge>
                </div>
                <span class="asset-card__copy">
                  <strong :title="file.name">{{ file.name }}</strong>
                  <small>File</small>
                </span>
              </article>
            </div>
          </section>

          <section v-if="!childFolders.length && !assetFiles.length" class="asset-browser__empty dv-panel">
            <span><FolderOpen /></span>
            <h2>This folder is empty</h2>
            <p>Files and subfolders added to the connected cloud storage will appear here.</p>
          </section>
        </template>
        <template v-else>
          <AdminPageHeader
            class="asset-browser__page-heading asset-browser__page-heading--root"
            description="Browse the folders and files connected to your cloud storage."
          >
            <template #lead><span class="asset-browser__eyebrow">Asset management</span></template>
            <span class="asset-browser__heading-mark"><HardDrive /></span>
          </AdminPageHeader>
          <Alert v-if="syncPaused" variant="destructive" class="asset-browser__pause">
            <CloudOff />
            <AlertTitle>Synchronisation is paused: the storage plan is full</AlertTitle>
            <AlertDescription>Since {{ formatDate(sourceStatus?.sync.pausedSince) }}, no file is downloaded from any source. Folders and files are still listed, and deletions still free space. Free space or ask for a larger plan, then measure the storage from the dashboard to resume.</AlertDescription>
          </Alert>
          <section class="asset-browser__section asset-browser__section--root" aria-labelledby="sources-heading">
            <div class="asset-browser__section-heading">
              <div>
                <h2 id="sources-heading">Cloud sources</h2>
                <p>Each source is one cloud folder synchronised into the library. Choose one to explore its contents and defaults.</p>
              </div>
              <span>{{ sources.length || rootAssets.length }}</span>
            </div>
            <div v-if="sources.length" class="asset-grid asset-grid--sources">
              <component :is="source.folderId ? 'router-link' : 'div'" v-for="source in sources" :key="source.key"
                :to="source.folderId ? { name: 'admin-assets', params: { id: source.folderId } } : undefined"
                class="asset-source asset-source--status dv-panel" :class="{ 'asset-source--failed': source.state === 'failed' && !syncPaused }">
                <span class="asset-source__icon"><Server /></span>
                <span class="asset-source__copy">
                  <span class="asset-source__title"><strong>{{ source.name }}</strong><Badge :variant="syncPaused ? 'outline' : sourceStateVariant(source.state)">{{ syncPaused ? 'Paused' : sourceStateLabels[source.state] }}</Badge></span>
                  <small>{{ source.provider }} · {{ source.root || 'whole account' }}</small>
                  <small>{{ number(source.folders) }} {{ source.folders === 1 ? 'folder' : 'folders' }} · {{ number(source.files.up_to_date) }} {{ source.files.up_to_date === 1 ? 'file' : 'files' }}<template v-if="source.files.creating"> · {{ number(source.files.creating) }} waiting for download</template><template v-if="source.files.outdated"> · {{ number(source.files.outdated) }} outdated</template><template v-if="source.files.pending_deletion"> · {{ number(source.files.pending_deletion) }} pending deletion</template></small>
                  <small>Last successful sync {{ formatDate(source.lastSuccessAt) }}<template v-if="source.state === 'running'"> · syncing since {{ formatDate(source.lastRunStartedAt) }}</template></small>
                  <small v-if="source.lastError" class="asset-source__error">Last error: {{ source.lastError }}</small>
                </span>
                <span class="asset-source__action">{{ source.folderId ? 'Open' : '' }}</span>
              </component>
            </div>
            <div v-else-if="rootAssets.length" class="asset-grid asset-grid--sources">
              <router-link v-for="folder in rootAssets" :key="folder.id"
                :to="{ name: 'admin-assets', params: { id: folder.id } }" class="asset-source dv-panel">
                <span class="asset-source__icon"><Server /></span>
                <span class="asset-source__copy">
                  <strong>{{ folder.name }}</strong>
                  <small>Cloud folder</small>
                </span>
                <span class="asset-source__action">Open</span>
              </router-link>
            </div>
            <div v-else class="asset-browser__empty dv-panel">
              <span><FolderOpen /></span>
              <h2>No cloud folders yet</h2>
              <p>Connected cloud folders will appear here when synchronisation is configured.</p>
            </div>
          </section>
        </template>
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
</template>

<style scoped>
.asset-links { display:grid; gap:6px; }
.asset-links li { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.asset-links small { color:var(--dv-text-secondary); }
.asset-browser__sidebar { background:var(--dv-surface-panel); }
.asset-browser__sidebar-inner { height:100%; overflow-y:auto; padding:24px 16px; }
.asset-browser__sidebar-heading { display:flex; align-items:center; gap:12px; padding:0 8px 20px; border-bottom:1px solid var(--dv-color-line); }
.asset-browser__sidebar-heading h2 { font-size:var(--dv-size-body); }
.asset-browser__sidebar-heading p { margin-top:2px; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.asset-browser__sidebar-icon, .asset-settings__icon, .asset-browser__heading-mark { display:grid; place-items:center; flex:0 0 auto; background:var(--dv-action-soft); color:var(--dv-action-primary); }
.asset-browser__sidebar-icon { width:34px; height:34px; border-radius:var(--dv-radius-graphic); }
.asset-browser__sidebar-icon :deep(svg) { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }
.asset-browser__tree { padding-top:14px; }
.asset-browser__handle { display:flex; align-items:center; justify-content:center; width:10px; background:var(--dv-surface-canvas); border-left:1px solid var(--dv-color-line); border-right:1px solid var(--dv-color-line); color:var(--dv-text-secondary); transition:background .15s ease,color .15s ease; }
.asset-browser__handle:hover { background:var(--dv-action-soft); color:var(--dv-action-primary); }
.asset-browser__handle :deep(svg) { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }
.asset-browser__main { width:100%; height:100%; overflow-y:auto; padding:30px clamp(24px,3.2vw,52px) 56px; }
.asset-browser__breadcrumb { min-height:24px; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.dv-admin .asset-browser__page-heading { padding:36px 0 30px; margin-bottom:0; }
.asset-browser__page-heading :deep(p) { max-width:62ch; }
.asset-browser__eyebrow { display:block; margin-bottom:8px; color:var(--dv-action-primary); font-size:var(--dv-size-caption); font-weight:650; letter-spacing:.11em; text-transform:uppercase; }
.asset-browser__heading-mark { width:64px; height:64px; border-radius:var(--dv-radius-graphic); }
.asset-browser__heading-mark :deep(svg) { width:25px; height:25px; }
.asset-settings { display:grid; grid-template-columns:minmax(210px,.75fr) minmax(430px,1.5fr); gap:28px; align-items:end; padding:22px; }
.asset-settings__intro { display:flex; align-items:flex-start; gap:12px; align-self:center; }
.asset-settings__icon { width:36px; height:36px; border-radius:var(--dv-radius-graphic); }
.asset-settings__icon :deep(svg) { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }
.asset-settings__intro h2 { font-size:var(--dv-size-body); }
.asset-settings__intro p { margin-top:4px; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.asset-settings__fields { display:grid; grid-template-columns:minmax(150px,1fr) minmax(150px,1fr) auto; gap:12px; align-items:end; }
.asset-settings__field { display:grid; gap:7px; min-width:0; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); font-weight:550; }
.asset-settings__field > span { display:flex; align-items:center; gap:6px; }
.asset-settings__field > span :deep(svg) { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }
.asset-settings__field :deep(button[role=combobox]) { width:100%; min-width:0; }
.asset-settings__fields > .dv-button { min-height:40px; }
.asset-browser__section { padding-top:40px; }
.asset-browser__section--root { padding-top:4px; }
.asset-browser__section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding-bottom:14px; border-bottom:1px solid var(--dv-color-line); }
.asset-browser__section-heading h2 { color:var(--dv-color-midnight); font-size:var(--dv-size-section); }
.asset-browser__section-heading p { margin-top:4px; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.asset-browser__section-heading > span { display:grid; place-items:center; min-width:25px; height:25px; padding:0 7px; border-radius:var(--dv-radius-data); background:var(--dv-surface-panel); color:var(--dv-text-secondary); font-size:var(--dv-size-caption); font-variant-numeric:tabular-nums; }
.asset-grid { display:grid; gap:16px; padding-top:18px; }
.asset-grid--folders { grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); }
.asset-grid--files { grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); }
.asset-grid--sources { grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); max-width:900px; }
.asset-card { min-width:0; overflow:hidden; border:1px solid var(--dv-color-line); border-radius:var(--dv-radius-control); background:var(--dv-surface-panel); color:var(--dv-text-primary); text-decoration:none; transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease; }
.asset-card--folder { display:flex; align-items:center; gap:13px; min-height:76px; padding:15px; }
.asset-card__visual { display:grid; place-items:center; width:42px; height:42px; flex:0 0 auto; border-radius:var(--dv-radius-graphic); background:var(--dv-action-soft); color:var(--dv-action-primary); }
.asset-card__visual :deep(svg) { width:var(--dv-icon-default); height:var(--dv-icon-default); }
.asset-card__copy { display:grid; min-width:0; gap:3px; }
.asset-card__copy strong { overflow:hidden; color:var(--dv-text-primary); font-size:var(--dv-size-body); font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.asset-card__copy small { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.asset-card__thumbnail { position:relative; display:grid; place-items:center; aspect-ratio:4/3; overflow:hidden; background:var(--dv-surface-canvas); border-bottom:1px solid var(--dv-color-line); }
.asset-card__thumbnail img { width:100%; height:100%; object-fit:contain; }
.asset-card--file .asset-card__copy { padding:12px 14px 14px; }
.asset-card__extension { position:absolute; top:10px; right:10px; border-radius:var(--dv-radius-data); background:var(--dv-color-midnight); color:var(--dv-text-on-dark); font-size:var(--dv-size-caption); }
.asset-source { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:14px; min-height:94px; padding:18px; border-radius:var(--dv-radius-control); color:inherit; text-decoration:none; transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease; }
.asset-source__icon { display:grid; place-items:center; width:44px; height:44px; border-radius:var(--dv-radius-graphic); background:var(--dv-action-soft); color:var(--dv-action-primary); }
.asset-source__icon :deep(svg) { width:var(--dv-icon-default); height:var(--dv-icon-default); }
.asset-source__copy { display:grid; min-width:0; gap:4px; }
.asset-source__copy strong { overflow:hidden; color:var(--dv-color-midnight); font-size:var(--dv-size-body); font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.asset-source__copy small { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.asset-source__action { color:var(--dv-action-primary); font-size:var(--dv-size-caption); font-weight:600; }
.asset-source--status { align-items:start; }
.asset-source--failed { border-color:var(--dv-color-danger, #b42318); }
.asset-source__title { display:flex; align-items:center; gap:8px; min-width:0; }
.asset-source__title strong { overflow:hidden; color:var(--dv-color-midnight); font-size:var(--dv-size-body); font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.asset-source__error { color:var(--dv-color-danger, #b42318); white-space:normal; }
.asset-browser__pause { margin-bottom:20px; }
.asset-browser__empty { display:grid; justify-items:center; gap:9px; padding:52px 24px; text-align:center; }
.asset-browser__empty > span { display:grid; place-items:center; width:48px; height:48px; margin-bottom:4px; border-radius:var(--dv-radius-graphic); background:var(--dv-action-soft); color:var(--dv-action-primary); }
.asset-browser__empty h2 { font-size:var(--dv-size-body); }
.asset-browser__empty p { max-width:46ch; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
@media(hover:hover) {
  .asset-card:hover, .asset-source:hover { border-color:#b9c7e2; box-shadow:0 8px 22px rgb(0 5 47 / .07); transform:translateY(-2px); }
}
@media(max-width:1080px) {
  .asset-settings { grid-template-columns:1fr; }
}
@media(max-width:760px) {
  .asset-browser__sidebar, .asset-browser__handle { display:none; }
  .asset-browser__main { padding:24px 20px 44px; }
  .dv-admin .asset-browser__page-heading { padding:28px 0 24px; }
  .asset-browser__heading-mark { display:none; }
  .asset-settings__fields { grid-template-columns:1fr; }
  .asset-grid--folders, .asset-grid--files, .asset-grid--sources { grid-template-columns:1fr; }
  .asset-card--file { display:grid; grid-template-columns:112px minmax(0,1fr); }
  .asset-card__thumbnail { aspect-ratio:4/3; border-right:1px solid var(--dv-color-line); border-bottom:0; }
  .asset-card--file .asset-card__copy { align-content:center; }
}
@media(prefers-reduced-motion:reduce) {
  .asset-card, .asset-source { transition:none; }
}
</style>

<style>
.admin-assets-workspace [data-panel-group-direction=horizontal] > [data-panel-resize-handle-enabled] {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
