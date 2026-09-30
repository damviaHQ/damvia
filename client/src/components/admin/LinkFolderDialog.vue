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
import RecordTargetPicker, { type RecordTarget } from "@/components/admin/RecordTargetPicker.vue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { ChevronDown, ChevronRight, Folder } from "@lucide/vue"
import { refDebounced } from "@vueuse/core"
import { computed, ref, watch } from "vue"

// Links a folder by hand: which folder, what its files are about, and what
// that changes, before anything is written.
const props = defineProps<{ open: boolean; folderId?: string | null; saving?: boolean }>()
const emit = defineEmits<{ "update:open": [boolean]; confirm: [{ folderId: string; target: RecordTarget }] }>()
const label = useRecordLabel()
const LARGE_FOLDER = 500

const folderId = ref<string | null>(null)
const search = ref("")
const debounced = refDebounced(search, 250)
const target = ref<RecordTarget | null>(null)

watch(() => props.open, (open) => {
  if (!open) return
  folderId.value = props.folderId ?? null
  search.value = ""
})

const { data: folders, isFetching: searching } = useQuery({
  queryKey: computed(() => ["entity-resolution", "folder-search", debounced.value]),
  queryFn: () => trpc.entityResolution.folderSearch.query({ query: debounced.value }),
  // The list stays in place while the next search runs, so a click lands.
  placeholderData: (previous) => previous,
  enabled: computed(() => props.open && !folderId.value && debounced.value.trim().length > 1),
})
// Without a search, the folders are browsed as a tree, opened one level at a time.
type TreeFolder = { id: string, name: string, children?: TreeFolder[] }
const { data: tree } = useQuery({
  queryKey: ["asset", "tree"],
  queryFn: () => trpc.asset.tree.query(),
  enabled: computed(() => props.open && !folderId.value),
})
const expanded = ref(new Set<string>())
const browsing = computed(() => debounced.value.trim().length < 2)
const treeRows = computed(() => {
  const rows: { folder: TreeFolder, depth: number }[] = []
  const walk = (folders: TreeFolder[], depth: number) => {
    for (const folder of [...folders].sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push({ folder, depth })
      if (expanded.value.has(folder.id) && folder.children?.length) walk(folder.children, depth + 1)
    }
  }
  walk((tree.value ?? []) as TreeFolder[], 0)
  return rows
})
function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
const { data: preview } = useQuery({
  queryKey: computed(() => ["entity-resolution", "folder-preview", folderId.value]),
  queryFn: () => trpc.entityResolution.folderPreview.query(folderId.value as string),
  enabled: computed(() => props.open && !!folderId.value),
})

const targetName = computed(() => !target.value ? "" : target.value.kind === "record"
  ? `${label.lower.value} ${target.value.key}`
  : `every ${label.lower.value} where ${target.value.name} is ${target.value.value}`)
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function confirm(value: RecordTarget | null) {
  if (folderId.value && value) emit("confirm", { folderId: folderId.value, target: value })
}
</script>

<template>
  <Dialog :open="open" @update:open="(value) => !saving && emit('update:open', value)">
    <DialogScrollContent class="link-folder-dialog">
      <DialogHeader>
        <DialogTitle>Link a folder to a {{ label.lower.value }}</DialogTitle>
        <DialogDescription>
          Every file in the folder and its subfolders, of every asset type, gets the {{ label.lower.value }} you choose: its data shows in lists, filters and the download dialog. Nothing is written to Dropbox, OneDrive or Google Drive.
        </DialogDescription>
      </DialogHeader>

      <div class="link-folder__columns" :class="{ 'is-single': !folderId }">
        <section class="link-folder__step" aria-labelledby="link-folder-folder">
          <h3 id="link-folder-folder">1. Folder</h3>
          <template v-if="!folderId">
            <Label for="link-folder-search" class="sr-only">Search folders</Label>
            <Input id="link-folder-search" v-model="search" type="search" placeholder="Search a folder by name or path, or browse the tree below" autocomplete="off" />
            <ul v-if="browsing" class="link-folder__list link-folder__tree" role="tree" aria-label="Folder tree">
              <li v-for="row in treeRows" :key="row.folder.id" role="treeitem" :aria-level="row.depth + 1" :aria-expanded="row.folder.children?.length ? expanded.has(row.folder.id) : undefined" :aria-selected="false" :style="{ paddingLeft: `${row.depth * 18}px` }">
                <button v-if="row.folder.children?.length" type="button" class="link-folder__toggle" :aria-label="`${expanded.has(row.folder.id) ? 'Close' : 'Open'} ${row.folder.name}`" @click="toggle(row.folder.id)">
                  <ChevronDown v-if="expanded.has(row.folder.id)" :size="16" aria-hidden="true" /><ChevronRight v-else :size="16" aria-hidden="true" />
                </button>
                <span v-else class="link-folder__toggle" aria-hidden="true"></span>
                <button type="button" class="link-folder__node" :aria-label="`Choose ${row.folder.name}`" @click="folderId = row.folder.id">
                  <Folder :size="15" aria-hidden="true" />{{ row.folder.name }}
                </button>
              </li>
            </ul>
            <p v-else-if="searching && !folders?.length" role="status" class="admin-text-secondary">Searching…</p>
            <ul v-else-if="folders?.length" class="link-folder__list" role="listbox" aria-label="Folders">
              <li v-for="folder in folders" :key="folder.id">
                <button type="button" role="option" :aria-selected="false" class="link-folder__option" @click="folderId = folder.id">
                  <code>{{ folder.path }}</code>
                  <span class="admin-text-secondary">{{ plural(folder.files, "file", "files") }}</span>
                </button>
              </li>
            </ul>
            <p v-else class="admin-text-secondary">No folder matches “{{ debounced.trim() }}”.</p>
          </template>
          <div v-else class="link-folder__chosen">
            <div class="flex items-start justify-between gap-3">
              <code>{{ preview?.path ?? "…" }}</code>
              <Button v-if="!props.folderId" type="button" variant="ghost" size="sm" @click="folderId = null">Change</Button>
            </div>
            <template v-if="preview">
              <p><strong>{{ plural(preview.files, "file", "files") }}</strong> in this folder and its subfolders:</p>
              <ul class="link-folder__types">
                <li v-for="row in preview.types" :key="row.type ?? 'none'">
                  {{ row.type ?? "No asset type" }}: {{ plural(row.files, "file", "files") }}<span v-if="row.linked" class="admin-text-secondary">, {{ row.linked }} already linked to a {{ label.lower.value }}</span>
                </li>
              </ul>
              <p v-if="preview.files >= LARGE_FOLDER" class="admin-form-note" role="note">This is a large folder. Every one of its {{ preview.files }} files will show the {{ label.lower.value }} you choose: check it holds one shoot or one pack, not a whole season.</p>
              <p v-if="preview.linkedHere.length" class="admin-form-note">This folder is already linked by hand to {{ preview.linkedHere.join(", ") }}. Linking it again adds a second link.</p>
              <p v-if="preview.linkedAbove" class="admin-form-note">Its parent folder <code>{{ preview.linkedAbove.path }}</code> is linked to {{ preview.linkedAbove.target }}. For the files of this folder, your choice replaces it.</p>
              <p v-if="preview.subfoldersLinked" class="admin-form-note">{{ plural(preview.subfoldersLinked, "subfolder has", "subfolders have") }} a link of their own and {{ preview.subfoldersLinked === 1 ? "keeps it" : "keep them" }}.</p>
            </template>
          </div>
        </section>

        <section v-if="folderId" class="link-folder__step" aria-labelledby="link-folder-target">
          <h3 id="link-folder-target">2. Link to</h3>
          <RecordTargetPicker v-model:target="target" :active="open" :saving="saving" @create="(key) => confirm({ kind: 'record', key, create: true })" />
        </section>
      </div>

      <section v-if="folderId && preview && target" class="link-folder__summary" aria-labelledby="link-folder-summary">
        <h3 id="link-folder-summary">What happens</h3>
        <ul>
          <li>The {{ plural(preview.files, "file", "files") }} of <code>{{ preview.path }}</code> are linked to {{ targetName }}.</li>
          <li>This wins over what the matching rules find. Files added to the folder later are linked too.</li>
          <li v-if="target.kind === 'attribute'">A range does not give the files a {{ label.lower.value }}'s data: they show on the page of each {{ label.lower.value }} of the range, and in search when one of them is found.</li>
          <li>To undo it, use <strong>Detach</strong> in Link to products → Linked by hand.</li>
        </ul>
      </section>

      <DialogFooter class="items-center">
        <DialogClose as-child><Button type="button" variant="outline" :disabled="saving">Cancel</Button></DialogClose>
        <Button type="button" :disabled="!folderId || !target || saving" @click="confirm(target)">
          {{ saving ? "Linking…" : preview && folderId ? `Link ${plural(preview.files, "file", "files")}` : "Link" }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>

<style scoped>
.link-folder__columns { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:32px; align-items:start; }
.link-folder__columns.is-single { grid-template-columns:minmax(0,1fr); }
.link-folder__step { display:grid; gap:10px; min-width:0; align-content:start; }
.link-folder__columns > .link-folder__step + .link-folder__step { padding-left:32px; border-left:1px solid var(--dv-color-line); }
@media (max-width: 767px) {
  .link-folder__columns { grid-template-columns:minmax(0,1fr); gap:24px; }
  .link-folder__columns > .link-folder__step + .link-folder__step { padding-left:0; border-left:0; }
}
.link-folder__step h3, .link-folder__summary h3 { font-size:14px; font-weight:600; }
.link-folder__list { display:grid; gap:4px; max-height:320px; overflow:auto; }
.link-folder__option { display:flex; width:100%; justify-content:space-between; align-items:center; gap:12px; padding:8px 10px; text-align:left; border:1px solid var(--dv-color-line); border-radius:var(--dv-radius-data); }
.link-folder__option:hover, .link-folder__option:focus-visible { border-color:var(--dv-color-primary, currentColor); }
.link-folder__option code, .link-folder__chosen code { overflow-wrap:anywhere; font-size:12px; }
.link-folder__tree li { display:flex; align-items:center; gap:2px; }
.link-folder__toggle { display:grid; place-items:center; width:24px; height:28px; flex:none; color:var(--dv-text-secondary); }
.link-folder__node { display:flex; align-items:center; gap:6px; min-width:0; flex:1; padding:4px 8px; text-align:left; font-size:13px; border-radius:var(--dv-radius-data); }
.link-folder__node:hover, .link-folder__node:focus-visible { background:var(--dv-surface-canvas); }
.link-folder__node svg { flex:none; color:var(--dv-text-secondary); }
.link-folder__chosen { display:grid; gap:8px; padding:12px; border:1px solid var(--dv-color-line); border-radius:var(--dv-radius-data); }
.link-folder__types { display:grid; gap:2px; padding-left:18px; list-style:disc; }
.link-folder__summary { display:grid; gap:8px; padding:12px; background:var(--dv-surface-canvas); border-radius:var(--dv-radius-data); }
.link-folder__summary ul { display:grid; gap:4px; padding-left:18px; list-style:disc; }
</style>
