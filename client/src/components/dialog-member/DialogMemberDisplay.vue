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
import DisplaySelector from "@/components/DisplaySelector.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { computed, defineAsyncComponent, ref } from "vue"

const globalStore = useGlobalStore()
const displayPreferences = ref({ ...globalStore.displayPreferences })
const skeletonGrid = defineAsyncComponent(() => import(`@/assets/skeleton-grid.svg`))
const skeletonList = defineAsyncComponent(() => import(`@/assets/skeleton-list.svg`))

const { data: assetTypes, status, error } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})

const items = computed(() => {
  const result: Record<string, { name: string; description: string | undefined }> = {
    asset_folder: { name: "Collections", description: undefined }
  };
  (assetTypes.value ?? []).forEach((assetType) => {
    result[assetType.id] = {
      name: assetType.name,
      description: assetType.description ?? undefined
    }
  })
  result.asset_file = { name: "Other files", description: "Files without an asset type." }
  return result
})

const defaultValues = computed(() =>
  (assetTypes.value ?? []).reduce(
    (items, assetType) => {
      items[assetType.id] = assetType.defaultDisplay as "grid" | "list"
      return items
    },
    { asset_folder: "grid" as const, asset_file: "grid" as const } as Record<string, "grid" | "list">
  )
)

function setDisplayPreference(id: string, value: "grid" | "list") {
  displayPreferences.value[id] = value
  globalStore.setDisplayPreferences(id, value)
}

function getDisplayPreference(id: string) {
  return displayPreferences.value[id] ?? defaultValues.value[id]
}

function resetDisplayPreferences() {
  displayPreferences.value = { ...defaultValues.value }
  globalStore.clearDisplayPreferences()
}
</script>

<template>
  <Loader v-if="status === 'pending'" :text="true" />
  <p v-else-if="status === 'error'" role="alert" class="text-sm text-destructive">{{ error?.message }}</p>
  <div v-else class="grid gap-5">
    <div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto_120px] items-center gap-5 pb-3 text-xs text-neutral-500">
        <span>Content</span><span class="w-[154px]">Display</span><span>Preview</span>
      </div>
      <div v-for="(item, id) in items" :key="id" data-display-row
        class="grid grid-cols-[minmax(0,1fr)_auto_120px] items-center gap-5 py-4">
        <div class="min-w-0">
          <p :id="`display-label-${id}`" class="text-[13px] font-medium leading-5 break-words">{{ item.name }}</p>
          <p v-if="item.description" class="mt-1 text-xs leading-5 text-neutral-500">{{ item.description }}</p>
        </div>
        <DisplaySelector :aria-labelledby="`display-label-${id}`" :model-value="getDisplayPreference(id)" @update:model-value="value => setDisplayPreference(id, value)" />
        <component :is="getDisplayPreference(id) === 'grid' ? skeletonGrid : skeletonList" class="h-auto w-[120px]" aria-hidden="true" />
      </div>
    </div>
    <div class="flex justify-start"><Button type="button" variant="outline" @click="resetDisplayPreferences">Reset to defaults</Button></div>
  </div>
</template>
