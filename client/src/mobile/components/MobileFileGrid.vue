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
import { Check, FileText, Film } from "@lucide/vue"
import { formatFileSize } from "@/utils/fileSize"
import type { MobileFile } from "../composables"
import { useMobileSelection } from "../composables"

defineProps<{ files: MobileFile[], selecting?: boolean }>()
const emit = defineEmits<{ open: [file: MobileFile] }>()
const selection = useMobileSelection()

function extension(name: string) {
  return name.includes(".") ? name.split(".").pop()!.toUpperCase() : ""
}
function tap(file: MobileFile, selecting: boolean) {
  if (selecting) selection.toggle({ type: "file", id: file.id })
  else emit("open", file)
}
</script>

<template>
  <ul class="mobile-grid" role="list">
    <li v-for="file in files" :key="file.id">
      <button type="button" class="mobile-card" :aria-pressed="selecting ? selection.has({ type: 'file', id: file.id }) : undefined" @click="tap(file, !!selecting)">
        <span class="mobile-card__thumb">
          <img v-if="file.thumbnailURL" :src="file.thumbnailURL" alt="" loading="lazy" />
          <Film v-else-if="file.mimeType.startsWith('video/')" :size="28" aria-hidden="true" />
          <FileText v-else :size="28" aria-hidden="true" />
          <span v-if="selecting" class="mobile-card__check" :class="{ 'mobile-card__check--on': selection.has({ type: 'file', id: file.id }) }">
            <Check v-if="selection.has({ type: 'file', id: file.id })" :size="16" aria-hidden="true" />
          </span>
        </span>
        <span class="mobile-card__name">{{ file.name }}</span>
        <span class="mobile-card__meta">{{ [extension(file.name), formatFileSize(file.size)].filter(Boolean).join(" · ") }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.mobile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 0 16px;
  margin: 0;
  list-style: none;
}
.mobile-card {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 0;
  text-align: left;
  background: none;
  border: 0;
  color: inherit;
}
.mobile-card__thumb {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--dv-surface-subtle);
  border-radius: var(--dv-radius-md);
  color: var(--dv-text-secondary);
}
.mobile-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.mobile-card__check {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 2px solid var(--dv-color-white);
  border-radius: 50%;
  background: rgb(0 0 0 / 0.25);
  color: var(--dv-color-white);
}
.mobile-card__check--on {
  background: var(--dv-action-primary);
  border-color: var(--dv-action-primary);
}
.mobile-card__name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mobile-card__meta {
  font-size: 12px;
  color: var(--dv-text-secondary);
}
</style>
