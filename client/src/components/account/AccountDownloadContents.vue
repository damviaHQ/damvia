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
import Loader from "@/components/Loader.vue"
import { trpc } from "@/services/server"
import { formatFileSize } from "@/utils/fileSize"
import { useQuery } from "@tanstack/vue-query"
import { File, FileImage, FileSpreadsheet, FileVideo } from "@lucide/vue"
import { computed } from "vue"

const props = defineProps<{ id: string }>()

// Thumbnails are signed URLs, so the list is kept only while it is shown.
const { data, status, refetch } = useQuery({
  queryKey: ["downloadContents", props.id],
  queryFn: () => trpc.download.contents.query({ id: props.id }),
  staleTime: 60_000,
  gcTime: 0,
})

const more = computed(() => data.value ? data.value.total - data.value.unavailable - data.value.entries.length : 0)
const iconFor = (mimeType: string) => mimeType.startsWith("image/") ? FileImage : mimeType.startsWith("video/") ? FileVideo : File
</script>

<template>
  <div class="border-l-2 border-neutral-200 pl-4" data-download-contents>
    <Loader v-if="status === 'pending'" :text="true" />
    <p v-else-if="status === 'error'" role="alert" class="py-2 text-caption text-destructive">
      The contents could not be loaded. <button type="button" class="underline underline-offset-4" @click="refetch()">Try again</button>
    </p>
    <template v-else-if="data">
      <ul class="grid gap-px" aria-label="Files in this download">
        <li v-if="data.recordList" class="flex items-center gap-3 py-1.5">
          <span class="grid size-8 shrink-0 place-items-center bg-neutral-100 text-neutral-500" aria-hidden="true"><FileSpreadsheet class="size-4" /></span>
          <span class="min-w-0 flex-1 truncate text-caption font-medium text-neutral-900">{{ data.recordList.name }}</span>
          <span class="shrink-0 text-caption tabular-nums text-neutral-500">{{ data.recordList.rows }} {{ data.recordList.rows === 1 ? 'row' : 'rows' }}</span>
        </li>
        <li v-for="entry in data.entries" :key="entry.id" class="flex items-center gap-3 py-1.5">
          <img v-if="entry.thumbnailURL" :src="entry.thumbnailURL" alt="" loading="lazy" class="size-8 shrink-0 bg-neutral-100 object-cover" />
          <span v-else class="grid size-8 shrink-0 place-items-center bg-neutral-100 text-neutral-500" aria-hidden="true"><component :is="iconFor(entry.mimeType)" class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-caption font-medium text-neutral-900" :title="entry.name">{{ entry.name }}</span>
            <span v-if="entry.folder" class="block truncate text-caption text-neutral-500" :title="entry.folder">{{ entry.folder }}</span>
          </span>
          <span class="shrink-0 text-caption tabular-nums text-neutral-500">{{ formatFileSize(entry.size) }}</span>
        </li>
      </ul>
      <p v-if="more > 0" class="py-2 text-caption text-neutral-500">and {{ more.toLocaleString() }} more {{ more === 1 ? 'file' : 'files' }}</p>
      <p v-if="data.unavailable" class="py-2 text-caption text-neutral-500">
        {{ data.unavailable }} {{ data.unavailable === 1 ? 'file is' : 'files are' }} no longer available to you.
      </p>
    </template>
  </div>
</template>
