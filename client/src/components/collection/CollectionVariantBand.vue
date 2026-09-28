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
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import CollectionCheckbox from "@/components/collection/CollectionCheckbox.vue"
import CollectionModalGallery from "@/components/collection/CollectionModalDownloadUnique.vue"
import CollectionModalDownloadMulti from "@/components/collection/CollectionModalDownloadMulti.vue"
import CollectionVariantGroupPanel from "@/components/collection/CollectionVariantGroupPanel.vue"
import { Button } from "@/components/ui/button"
import type { VariantGroup, VariantMember } from "@/composables/useVariantGroups"
import type { RouterOutput } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { getFileExtension } from "@/utils/fileExtention"
import { X } from "@lucide/vue"
import { computed, onMounted, ref } from "vue"

type File = RouterOutput["collection"]["findById"]["files"][number]
const props = defineProps<{ group: VariantGroup; members: (File | VariantMember)[] }>()
const emit = defineEmits<{ close: [] }>()
const store = useGlobalStore()
const isAdmin = computed(() => store.user?.role === "admin")
const band = ref<HTMLElement>()
const previewId = ref<string | null>(null)
const editGroupId = ref<string | null>(null)
const downloadOpen = ref(false)

const isSelected = (id: string) => store.selection.some(item => item.type === "file" && item.id === id)
const selectedCount = computed(() => props.members.filter(member => isSelected(member.id)).length)
const allSelected = computed(() => selectedCount.value === props.members.length)

// What sets a variant apart, in the order of the group's axes.
function differences(member: File | VariantMember) {
  const values = props.group.members.find(entry => entry.assetFileId === member.assetFileId)?.axisValues ?? []
  return props.group.axes.map((axis, index) => ({ label: axis.label, value: values[index] })).filter(entry => entry.value)
}

function toggle(id: string) {
  if (isSelected(id)) store.removeFromSelection({ type: "file", id })
  else store.addToSelection({ type: "file", id })
}
function toggleAll() {
  if (allSelected.value) props.members.forEach(member => store.removeFromSelection({ type: "file", id: member.id }))
  else props.members.filter(member => !isSelected(member.id)).forEach(member => store.addToSelection({ type: "file", id: member.id }))
}
// As in the group dialog: the download dialog takes the group as the selection.
function downloadAll() {
  store.clearSelection()
  props.members.forEach(member => store.addToSelection({ type: "file", id: member.id }))
  downloadOpen.value = true
}

onMounted(() => band.value?.focus({ preventScroll: true }))
</script>

<template>
  <section ref="band" tabindex="-1" class="w-full rounded-2xl bg-neutral-50 p-4 outline-none sm:p-5" :aria-label="`${group.displayName}, ${members.length} variants`" @keydown.escape="emit('close')">
    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-medium text-neutral-900">{{ group.displayName }}</h3>
        <p class="text-xs text-neutral-500">{{ members.length }} variants<template v-if="group.axes.length"> · differ by {{ group.axes.map(axis => axis.label.toLowerCase()).join(", ") }}</template><template v-if="selectedCount"> · {{ selectedCount }} selected</template></p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" @click="toggleAll">{{ allSelected ? "Clear selection" : `Select all ${members.length}` }}</Button>
        <Button type="button" variant="outline" size="sm" @click="downloadAll">Download all</Button>
        <Button v-if="isAdmin" type="button" variant="ghost" size="sm" @click="editGroupId = group.id">Edit group</Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close variants" @click="emit('close')"><X aria-hidden="true" /></Button>
      </div>
    </div>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      <li v-for="member in members" :key="member.id" class="group min-w-0">
        <div class="relative aspect-[4/3] overflow-hidden bg-white" :class="isSelected(member.id) && 'outline-2 outline-neutral-500'">
          <button type="button" class="absolute inset-0 flex size-full items-center justify-center p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-800" :aria-label="`Preview ${member.name}`" @click="previewId = member.id">
            <img v-if="member.thumbnailURL" :src="member.thumbnailURL" :alt="member.name" loading="lazy" decoding="async" class="size-full object-contain" />
            <thumbnailPlaceholder v-else class="h-12 w-auto! fill-neutral-400" aria-hidden="true" />
          </button>
          <CollectionCheckbox :label="`Select ${member.name}`" class="absolute left-2 top-2 z-10 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" :class="isSelected(member.id) ? 'opacity-100' : 'opacity-0'" :state="isSelected(member.id) ? 'check' : false" @click="toggle(member.id)" />
          <span v-if="member.assetFileId === group.coverFileId" class="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-neutral-600">Cover</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span v-for="difference in differences(member)" :key="difference.label" class="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] uppercase leading-4 text-neutral-700" :title="difference.label">{{ difference.value }}</span>
          <span v-if="!differences(member).length" class="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] uppercase leading-4 text-neutral-700">{{ getFileExtension(member.name) }}</span>
        </div>
        <button type="button" class="mt-1 block w-full truncate text-left text-xs text-neutral-600 hover:text-neutral-950" :title="member.name" @click="previewId = member.id">{{ member.name }}</button>
      </li>
    </ul>
  </section>
  <CollectionModalGallery v-model="previewId" :files="(members as File[])" />
  <CollectionModalDownloadMulti v-model="downloadOpen" />
  <CollectionVariantGroupPanel v-model="editGroupId" />
</template>

