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
import { thumbnailFavoriteButtonClasses } from './gridStyles'
import { Button } from '@/components/ui/button'
import { useCollectionFavorites } from '@/composables/useCollectionFavorites'
import type { RouterOutput } from '@/services/server'
import { Star, StarOff } from '@lucide/vue'

defineProps<{ collection: RouterOutput["collection"]["findById"]; overlay?: boolean; toolbar?: boolean }>()
const { canFavorite, isFavorite, toggle, isSaving, isSuccess } = useCollectionFavorites()
</script>

<template>
  <component :is="toolbar ? Button : 'button'" v-if="canFavorite" type="button"
    :variant="toolbar ? 'ghost' : undefined" :size="toolbar ? 'icon-sm' : undefined" :aria-label="`${isFavorite(collection.id) ? 'Remove from' : 'Add to'} favorites: ${collection.name}`"
    :title="isFavorite(collection.id) ? 'Remove from favorites' : 'Add to favorites'"
    :aria-pressed="isFavorite(collection.id)" :disabled="isSaving(collection.id) || !isSuccess"
    class="group/favorite"
    :class="[
      !toolbar && !overlay && 'grid size-6 shrink-0 place-items-center bg-transparent text-[var(--dv-selection-color)] hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600',
      overlay && [
        thumbnailFavoriteButtonClasses,
        'absolute right-[0.9rem] top-4 z-10 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
        isFavorite(collection.id) ? 'opacity-100' : 'opacity-0',
      ],
    ]"
    @click="toggle(collection)">
    <span v-if="overlay" class="relative block size-6">
      <Star aria-hidden="true" class="size-6 stroke-[2]" :class="isFavorite(collection.id) ? 'text-neutral-600 fill-neutral-50' : 'text-neutral-500 fill-neutral-100 group-hover/favorite:fill-neutral-50 group-hover/favorite:text-neutral-800'" />
      <StarOff v-if="isFavorite(collection.id)" aria-hidden="true" class="absolute inset-0 size-6 stroke-[2] fill-none text-neutral-500 opacity-0 group-hover/favorite:opacity-100 group-focus-visible/favorite:opacity-100" />
    </span>
    <span v-else aria-hidden="true" class="relative block" :class="toolbar ? 'size-5 text-neutral-500 group-hover/favorite:text-neutral-800' : 'size-6'">
      <Star class="size-6" :class="isFavorite(collection.id) && 'fill-current group-hover/favorite:opacity-0 group-focus-visible/favorite:opacity-0'" />
      <StarOff v-if="isFavorite(collection.id)" class="absolute inset-0 size-6 fill-none opacity-0 group-hover/favorite:opacity-100 group-focus-visible/favorite:opacity-100" />
    </span>
  </component>
</template>
