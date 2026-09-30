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
import AccountDisplayExample from "@/components/account/AccountDisplayExample.vue"
import { accountGroupTitleClasses, accountListClasses } from "@/components/account/accountStyles"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useRecordLabel } from "@/composables/useRecordLabel"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { DEFAULT_MASONRY_SIZE, MASONRY_SIZES, type DisplayView, type MasonrySize } from "@/utils/displayPreferences"
import { useQuery } from "@tanstack/vue-query"
import { LayoutDashboard, LayoutGrid, Rows3, SlidersHorizontal } from "@lucide/vue"
import { RadioGroupItem, RadioGroupRoot } from "reka-ui"
import { computed } from "vue"

const store = useGlobalStore()
const { plural } = useRecordLabel()

const { data: assetTypes, status, error } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})

type Row = { id: string, name: string, description?: string, libraryDefault: "grid" | "list", views: DisplayView[] }
// The same keys the display button of a page writes: one per asset type,
// `asset_file` for untyped files, `asset_folder` for collections, `record` for products.
const rows = computed<Row[]>(() => [
  { id: "asset_folder", name: "Collections", libraryDefault: "grid", views: ["grid", "list"] },
  ...(assetTypes.value ?? []).map(type => ({
    id: type.id, name: type.name, description: type.description ?? undefined,
    libraryDefault: type.defaultDisplay === "list" ? "list" as const : "grid" as const, views: ["grid", "list", "masonry"] as DisplayView[],
  })),
  { id: "asset_file", name: "Other files", description: "Files without an asset type, and mixed folders.", libraryDefault: "grid", views: ["grid", "list", "masonry"] },
  { id: "record", name: `${plural.value.charAt(0).toUpperCase()}${plural.value.slice(1)} in the catalogue`, libraryDefault: "grid", views: ["grid", "list"] },
])

const views = {
  grid: { label: "Grid", icon: LayoutGrid },
  list: { label: "List", icon: Rows3 },
  masonry: { label: "Masonry", icon: LayoutDashboard },
}
const current = (row: Row) => store.displayPreferences[row.id] ?? row.libraryDefault
const customised = (row: Row) => row.id in store.displayPreferences || row.id in store.displayDetails
const masonrySize = (row: Row) => store.displayDetails[row.id]?.masonrySize ?? DEFAULT_MASONRY_SIZE
const anyCustomised = computed(() => rows.value.some(customised) || !store.groupVariants)
</script>

<template>
  <Loader v-if="status === 'pending'" :text="true" />
  <p v-else-if="status === 'error'" role="alert" class="text-body text-destructive">{{ error?.message }}</p>
  <div v-else class="grid gap-10">
    <p class="max-w-2xl text-body text-neutral-600">
      The display button (<SlidersHorizontal class="inline size-4 align-[-3px]" aria-hidden="true" />) on a collection,
      a page or search changes these same settings. The columns of a list are chosen from the list itself.
    </p>

    <section aria-labelledby="display-layouts" class="grid">
      <h2 id="display-layouts" :class="accountGroupTitleClasses">Layout</h2>
      <ul :class="accountListClasses">
        <li v-for="row in rows" :key="row.id" data-display-row class="grid items-center gap-x-6 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div class="min-w-0">
            <p :id="`display-label-${row.id}`" class="text-body font-medium text-neutral-900">{{ row.name }}</p>
            <p class="mt-0.5 text-caption text-neutral-500">
              <template v-if="customised(row)">
                Your choice · library default is {{ views[row.libraryDefault].label.toLowerCase() }} ·
                <button type="button" class="underline underline-offset-4 hover:text-neutral-900" @click="store.resetDisplayPreference(row.id)">
                  Use default<span class="sr-only"> for {{ row.name }}</span>
                </button>
              </template>
              <template v-else>Library default</template>
              <template v-if="row.description"> · {{ row.description }}</template>
            </p>
          </div>
          <AccountDisplayExample :view="current(row)" :masonry-size="masonrySize(row)" />
          <div class="grid justify-items-start gap-2 md:w-[340px] md:justify-items-end">
            <RadioGroupRoot :model-value="current(row)" :aria-labelledby="`display-label-${row.id}`" orientation="horizontal"
              class="inline-flex gap-1 bg-neutral-100 p-1" @update:model-value="value => store.setDisplayPreferences(row.id, value as DisplayView)">
              <RadioGroupItem v-for="view in row.views" :key="view" :value="view"
                class="flex h-8 items-center gap-2 px-3 text-body text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:bg-white data-[state=checked]:text-neutral-900 data-[state=checked]:shadow-sm">
                <component :is="views[view].icon" class="size-4" aria-hidden="true" />{{ views[view].label }}
              </RadioGroupItem>
            </RadioGroupRoot>
            <RadioGroupRoot v-if="current(row) === 'masonry'" :model-value="masonrySize(row)" orientation="horizontal"
              :aria-label="`Picture size for ${row.name}`" class="inline-flex items-center gap-1 whitespace-nowrap text-caption"
              @update:model-value="value => store.setDisplayDetails(row.id, { masonrySize: Number(value) as MasonrySize })">
              <span class="pr-1 text-neutral-500" aria-hidden="true">Picture size</span>
              <RadioGroupItem v-for="size in MASONRY_SIZES" :key="size.id" :value="size.id"
                class="h-7 px-2 text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:bg-neutral-100 data-[state=checked]:font-medium data-[state=checked]:text-neutral-900">
                {{ size.label }}
              </RadioGroupItem>
            </RadioGroupRoot>
          </div>
        </li>
      </ul>
    </section>

    <section aria-labelledby="display-variants" class="grid">
      <h2 id="display-variants" :class="accountGroupTitleClasses">Variants</h2>
      <div class="grid items-center gap-x-6 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto]" data-variants-row>
        <div class="min-w-0">
          <p id="display-group-variants" class="text-body font-medium text-neutral-900">Group variants</p>
          <p class="mt-0.5 text-caption text-neutral-500">
            {{ store.groupVariants ? 'On' : 'Off' }} · one card for the formats, languages and durations of the same file, on types that group their variants.
          </p>
        </div>
        <AccountDisplayExample :view="store.groupVariants ? 'variants-grouped' : 'variants-apart'" />
        <div class="flex md:w-[340px] md:justify-end">
          <Switch aria-labelledby="display-group-variants" :model-value="store.groupVariants" @update:model-value="store.setGroupVariants($event as boolean)" />
        </div>
      </div>
    </section>

    <div class="flex flex-wrap items-center gap-4">
      <Button type="button" variant="outline" :disabled="!anyCustomised" @click="store.clearDisplayPreferences()">Use library defaults everywhere</Button>
      <span class="text-caption text-neutral-500">Saved in this browser only.</span>
    </div>
  </div>
</template>
