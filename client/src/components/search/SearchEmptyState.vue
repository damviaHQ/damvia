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
import { Button } from "@/components/ui/button"
import { SearchX } from "lucide-vue-next"

defineProps<{
  terms: string[]
  notFound: string[]
  scoped: boolean
  scopeLabel: string
  hasFilters: boolean
  exactMatch: boolean
}>()
const emit = defineEmits<{ searchEverywhere: [], clearFilters: [], useAnyWord: [], editTerms: [] }>()
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
    <SearchX class="size-10 text-neutral-400" aria-hidden="true" />
    <div class="grid gap-1">
      <h2 class="text-section font-semibold text-neutral-950">No results</h2>
      <p class="text-body text-[color:var(--dv-text-secondary)]">
        <template v-if="terms.length && scoped">Nothing in {{ scopeLabel }} matches <strong class="text-neutral-800">{{ terms.join(", ") }}</strong>.</template>
        <template v-else-if="terms.length">Nothing matches <strong class="text-neutral-800">{{ terms.join(", ") }}</strong>.</template>
        <template v-else-if="hasFilters">No file matches the selected filters.</template>
        <template v-else>Type a word, a file name or a product reference to start.</template>
      </p>
      <p v-if="notFound.length" class="text-body text-[color:var(--dv-color-warning)]">Not found: {{ notFound.join(", ") }}</p>
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      <Button v-if="scoped" type="button" @click="emit('searchEverywhere')">Search everywhere</Button>
      <Button v-if="hasFilters" type="button" :variant="scoped ? 'outline' : 'default'" @click="emit('clearFilters')">Remove all filters</Button>
      <Button v-if="exactMatch && terms.length" type="button" variant="outline" @click="emit('useAnyWord')">Match any word instead</Button>
      <Button v-if="terms.length" type="button" variant="ghost" @click="emit('editTerms')">Edit the search terms</Button>
    </div>
  </div>
</template>
