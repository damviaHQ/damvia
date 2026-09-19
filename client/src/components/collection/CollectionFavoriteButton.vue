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
import { useCollectionFavorites } from '@/composables/useCollectionFavorites'
import { Star } from '@lucide/vue'

defineProps<{ collection: { id: string; name: string } }>()
const { canFavorite, isFavorite, toggle, isSaving, isSuccess } = useCollectionFavorites()
</script>

<template>
  <button v-if="canFavorite" type="button" :aria-label="`${isFavorite(collection.id) ? 'Remove from' : 'Add to'} favorites: ${collection.name}`"
    :title="isFavorite(collection.id) ? 'Remove from favorites' : 'Add to favorites'"
    :aria-pressed="isFavorite(collection.id)" :disabled="isSaving || !isSuccess"
    class="grid size-6 shrink-0 place-items-center bg-transparent text-[var(--dv-selection-color)] hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600"
    @click="toggle(collection.id)">
    <Star aria-hidden="true" class="size-6" :class="isFavorite(collection.id) && 'fill-current'" />
  </button>
</template>
