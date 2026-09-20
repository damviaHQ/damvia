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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { DEFAULT_MASONRY_SIZE, MASONRY_SIZES } from "@/utils/displayPreferences"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { RotateCcw } from "@lucide/vue"
import { computed, useId } from "vue"
import { useRoute } from "vue-router"
import Treeselect from "vue3-treeselect-ts"

// The three listing blocks share every option they have.
const props = defineProps<{ data: any; type: "collections" | "files" | "last_files" }>()
const emit = defineEmits<{ (e: "update", data: any): void }>()

const fieldId = useId()
const route = useRoute()
// A collection cannot be a card on its own page, so it stays in the tree, for
// its children's sake, but cannot be chosen.
const currentCollectionId = computed(() => (route.name === "collection-edit" ? (route.params.id as string) : null))
const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
  enabled: computed(() => props.type !== "last_files"),
})

const collectionOptions = computed(() => {
  function format(items: any[]): any[] {
    return items.map((item) => ({
      id: item.id,
      label: item.name,
      isDisabled: item.id === currentCollectionId.value,
      children: item.children ? format(item.children) : undefined,
    }))
  }
  return collections.value ? format(collections.value) : []
})

const masonrySize = computed(() => props.data?.masonrySize ?? DEFAULT_MASONRY_SIZE)
const masonrySizeLabel = computed(() => MASONRY_SIZES.find((size) => size.id === masonrySize.value)?.label ?? "")

function patch(values: Record<string, unknown>) {
  emit("update", { ...props.data, ...values })
}
</script>

<template>
  <div class="grid gap-3">
    <FieldGroup>
      <Label :for="`${fieldId}-title`">Title (optional)</Label>
      <Input :id="`${fieldId}-title`" type="text" :model-value="data.title ?? ''"
        @update:model-value="patch({ title: $event || null })" />
    </FieldGroup>
    <FieldGroup>
      <Label :for="`${fieldId}-layout`">Display</Label>
      <Select :model-value="data.layout ?? 'user_preferences'"
        @update:model-value="patch({ layout: $event === 'user_preferences' ? null : $event })">
        <SelectTrigger :id="`${fieldId}-layout`"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="user_preferences">As the reader prefers</SelectItem>
          <SelectItem value="grid">Grid</SelectItem>
          <SelectItem value="list">List</SelectItem>
          <!-- Collection cards are all the same shape, so only files tile. -->
          <SelectItem v-if="type !== 'collections'" value="masonry">Masonry</SelectItem>
        </SelectContent>
      </Select>
    </FieldGroup>
    <FieldGroup v-if="data.layout === 'masonry'">
      <div class="flex items-center justify-between gap-3">
        <Label :id="`${fieldId}-masonry-size`">Picture size</Label>
        <span class="text-xs text-neutral-500">{{ masonrySizeLabel }}</span>
      </div>
      <Slider :model-value="[masonrySize]" :min="1" :max="4" :step="1"
        :thumb-labelledby="`${fieldId}-masonry-size`"
        @update:model-value="patch({ masonrySize: $event?.[0] ?? DEFAULT_MASONRY_SIZE })" />
      <p class="text-xs text-neutral-500">
        Pictures keep their own proportions and fill the width. A layout chosen here is the one every reader sees.
      </p>
    </FieldGroup>
    <FieldGroup v-if="type === 'collections'">
      <Label :id="`${fieldId}-selection`">Collections to show (optional)</Label>
      <Treeselect :model-value="data.collectionsId ?? []" :options="collectionOptions" :clearable="true"
        :multiple="true" :flat="true" placeholder="The sub-collections of this collection"
        @update:model-value="patch({ collectionsId: $event?.length ? $event : null })" />
      <!-- Going back to the default is otherwise a matter of noticing the
           small cross that clears the field. -->
      <Button v-if="data.collectionsId?.length" type="button" variant="ghost" size="sm" class="w-max px-0"
        @click="patch({ collectionsId: null })">
        <RotateCcw class="size-4" />Show the sub-collections instead
      </Button>
    </FieldGroup>
    <FieldGroup v-else-if="type === 'files'">
      <Label :id="`${fieldId}-collection`">Collection (optional)</Label>
      <Treeselect :model-value="data.collectionId ?? null" :options="collectionOptions" :clearable="true" :flat="true"
        placeholder="This collection" @update:model-value="patch({ collectionId: $event || null })" />
    </FieldGroup>
  </div>
</template>
