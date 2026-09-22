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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { sidebarSectionTitleClasses } from "@/components/layout-main/navigationStyles"
import { RouterOutput } from "@/services/server.ts"
import { computed } from "vue"

type Facet = RouterOutput["catalogue"]["facets"][number]

// Values chosen inside one field widen the list; fields narrow each other.
const props = defineProps<{ facets: Facet[] }>()
const chosen = defineModel<Record<string, string[]>>({ required: true })

const count = computed(() => Object.values(chosen.value).reduce((total, values) => total + values.length, 0))

function toggle(field: string, value: string, checked: boolean) {
  const values = chosen.value[field] ?? []
  const next = checked ? [...values, value] : values.filter((current) => current !== value)
  const { [field]: _removed, ...rest } = chosen.value
  chosen.value = next.length ? { ...rest, [field]: next } : rest
}
</script>

<template>
  <aside class="w-[220px] shrink-0" aria-label="Filters">
    <div class="mb-3 flex items-center justify-between">
      <span :class="sidebarSectionTitleClasses">Filters</span>
      <Button v-if="count" type="button" variant="ghost" size="sm" @click="chosen = {}">Clear</Button>
    </div>
    <p v-if="!facets.length" class="px-3 text-caption text-neutral-500">No filter is available yet.</p>
    <section v-for="facet in facets" :key="facet.name" class="mb-5">
      <h3 class="mb-2 px-3 text-body font-semibold text-neutral-900">{{ facet.displayName }}</h3>
      <ul class="grid gap-1">
        <li v-for="option in facet.values" :key="option.value" class="flex items-center gap-2 px-3">
          <Checkbox :id="`${facet.name}-${option.value}`" :model-value="(chosen[facet.name] ?? []).includes(option.value)"
            @update:model-value="toggle(facet.name, option.value, !!$event)" />
          <label :for="`${facet.name}-${option.value}`" class="min-w-0 flex-1 truncate text-body text-neutral-700">{{ option.value }}</label>
          <span class="text-caption text-neutral-500">{{ option.count }}</span>
        </li>
      </ul>
    </section>
  </aside>
</template>
