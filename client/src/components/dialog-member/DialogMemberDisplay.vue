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
import { X } from "lucide-vue-next"
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
  result.asset_file = { name: "Other Files without a type", description: undefined }
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
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="download__container flex flex-col gap-4">
    <p class="text-sm text-neutral-500 mb-8 max-w-[80%]">
      When browsing collections, assets are organized by "Types," which define their specific usage (e.g., product vs.
      marketing pictures). You
      can choose how to display these types. Note that these settings are stored in your browser and will need to be
      reconfigured if you switch
      browsers.
    </p>
    <div class="flex gap-[10%]">
      <div class="">
        <div class="flex flex-col gap-8 max-w-[80%]">
          <div v-for="(item, id) in items" :key="id" class="space-y-2">
            <div class="flex flex-col gap-1">
              <span class="font-medium text-sm">{{ item.name }}</span>
              <div class="flex flex-col gap-4">
                <span v-if="!item.description && item.name === 'Other Files without a type'"
                  class="text-sm text-neutral-500">Some files don't fall
                  into
                  any type.</span>
                <span v-else-if="!item.description && item.name === 'Collections'" class="text-sm text-neutral-500">How
                  do you want to display your
                  collections.</span>
                <span v-else-if="item.description" class="text-sm text-neutral-500">{{ item.description }}</span>
                <DisplaySelector :model-value="getDisplayPreference(id)"
                  @update:model-value="(value) => setDisplayPreference(id, value)" />
              </div>
            </div>
          </div>
          <Button @click="resetDisplayPreferences" variant="link" class="self-start p-0 mt-8">
            <X class="w-4 h-4 mr-1" /> Reset all to default
          </Button>
        </div>
      </div>
      <div>
        <h3 class="text-lg font-semibold mb-4">Preview</h3>
        <div class="space-y-8">
          <div v-for="(item, id) in items" :key="id" class="space-y-2">
            <div class="text-xs text-neutral-500">{{ item.name }}</div>
            <div v-if="getDisplayPreference(id) === 'grid'">
              <component :is="skeletonGrid" />
            </div>
            <div v-else>
              <component :is="skeletonList" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>