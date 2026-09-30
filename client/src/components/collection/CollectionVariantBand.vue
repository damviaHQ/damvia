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
import { Button } from "@/components/ui/button"
import type { VariantGroup, VariantMember } from "@/composables/useVariantGroups"
import type { RouterOutput } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { getFileExtension } from "@/utils/fileExtention"
import { formatFileSize } from "@/utils/fileSize"
import { gridCardClasses, gridPreviewClasses } from "./gridStyles"
import { Download, X } from "@lucide/vue"
import { computed, onMounted, ref } from "vue"

type File = RouterOutput["collection"]["findById"]["files"][number]
const props = defineProps<{ group: VariantGroup; members: (File | VariantMember)[] }>()
const emit = defineEmits<{ close: [] }>()
const store = useGlobalStore()
const band = ref<HTMLElement>()
const previewId = ref<string | null>(null)
const downloadOpen = ref(false)

const isSelected = (id: string) => store.selection.some(item => item.type === "file" && item.id === id)
const selectedCount = computed(() => props.members.filter(member => isSelected(member.id)).length)
const allSelected = computed(() => selectedCount.value === props.members.length)

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
  <!-- The variants keep the size of ordinary cards and line up with their
       columns; the band only bleeds its background into the gaps around. -->
  <section ref="band" tabindex="-1" class="-m-3 flex flex-wrap items-start gap-x-6 gap-y-4 rounded-2xl bg-neutral-50 p-3 outline-none" :aria-label="`${group.displayName}, ${members.length} variants`" @keydown.escape="emit('close')">
    <div class="flex basis-full items-center gap-3">
      <CollectionCheckbox :label="`Select all ${members.length} variants`" :state="allSelected ? 'check' : selectedCount ? 'undetermined' : false" @click="toggleAll" />
      <h3 class="min-w-0 truncate text-sm font-medium text-neutral-900" :title="group.displayName">{{ group.displayName }}</h3>
      <span class="shrink-0 text-xs text-neutral-500">{{ selectedCount ? `${selectedCount} of ${members.length} selected` : `${members.length} variants` }}</span>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" :aria-label="`Download all ${members.length} variants`" :title="`Download all ${members.length} variants`" @click="downloadAll"><Download aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close variants" title="Close" @click="emit('close')"><X aria-hidden="true" /></Button>
      </div>
    </div>
    <article v-for="member in members" :key="member.id" :class="gridCardClasses">
      <div :class="[gridPreviewClasses, isSelected(member.id) && 'outline-2 outline-neutral-500']">
        <button type="button" class="absolute inset-0 flex size-full items-center justify-center p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-800" :aria-label="`Preview ${member.name}`" @click="previewId = member.id">
          <img v-if="member.thumbnailURL" :src="member.thumbnailURL" :alt="member.name" loading="lazy" decoding="async" class="size-full object-contain" />
          <thumbnailPlaceholder v-else class="h-20 w-auto! fill-neutral-400" aria-hidden="true" />
        </button>
        <CollectionCheckbox :label="`Select ${member.name}`" class="absolute left-3 top-3 z-10 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" :class="isSelected(member.id) ? 'opacity-100' : 'opacity-0'" :state="isSelected(member.id) ? 'check' : false" @click="toggle(member.id)" />
        <span v-if="member.assetFileId === group.coverFileId" class="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-neutral-600">Cover</span>
      </div>
      <button type="button" class="mt-2.5 block w-full truncate text-left text-sm font-normal text-neutral-800 hover:text-neutral-950" :title="member.name" @click="previewId = member.id">{{ member.name }}</button>
      <p class="mt-1 text-xs text-neutral-500"><span class="uppercase">{{ getFileExtension(member.name) }}</span><span class="mx-1.5 text-neutral-300">·</span>{{ formatFileSize(member.size) }}</p>
    </article>
  </section>
  <CollectionModalGallery v-model="previewId" :files="(members as File[])" />
  <CollectionModalDownloadMulti v-model="downloadOpen" />
</template>

