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
import { emptyBlockData } from "server/src/page-blocks/schema"
import draggable from "vuedraggable"
import { BLOCK_LIBRARY, type LibraryItem } from "./blockLibrary"
import type { EditorBlock } from "@/components/page-renderer/types"

const emit = defineEmits<{ (e: "add", block: EditorBlock): void }>()

// Dragging clones the item; the canvas turns the clone into a real block.
function cloneItem(item: LibraryItem): EditorBlock {
  return { type: item.type, size: "full", data: emptyBlockData(item.type) }
}
</script>

<template>
  <div class="flex h-full flex-col gap-3 overflow-y-auto">
    <div>
      <h2 class="text-sm font-semibold text-neutral-900">Add content</h2>
      <p class="mt-1 text-xs text-neutral-500">Drag onto the page, or click to add it at the end.</p>
    </div>
    <draggable :model-value="BLOCK_LIBRARY" :group="{ name: 'page-blocks', pull: 'clone', put: false }" :sort="false"
      :clone="cloneItem" item-key="type" class="grid gap-2">
      <template #item="{ element }">
        <button type="button"
          class="flex w-full cursor-grab items-start gap-3 rounded-md border border-neutral-200 bg-white p-3 text-left hover:border-neutral-400 hover:bg-neutral-50"
          @click="emit('add', cloneItem(element))">
          <component :is="element.icon" class="mt-0.5 size-5 shrink-0 text-neutral-600" aria-hidden="true" />
          <span class="min-w-0">
            <span class="block text-sm font-medium text-neutral-900">{{ element.name }}</span>
            <span class="block text-xs text-neutral-500">{{ element.description }}</span>
          </span>
        </button>
      </template>
    </draggable>
  </div>
</template>
