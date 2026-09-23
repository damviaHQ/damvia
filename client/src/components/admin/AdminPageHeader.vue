<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2026 Arnaud DE SAINT JEAN
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
<script lang="ts">
import type { InjectionKey } from 'vue'

export type AdminPageHeading = { owner?: symbol, title?: string, description?: string }
export const adminPageHeadingKey: InjectionKey<AdminPageHeading> = Symbol('admin-page-heading')
</script>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, useSlots, watchEffect } from 'vue'

const props = defineProps<{
  title?: string | null
  description?: string | null
}>()

const slots = useSlots()
// LayoutAdmin shows the title, description and actions in its top bar. A null title,
// from a section shown as a tab of another page, keeps its description and actions in place.
const heading = inject(adminPageHeadingKey, null)
const inTopbar = computed(() => !!heading && props.title !== null)
const owner = Symbol('admin-page-header')
watchEffect(() => {
  if (!heading || !inTopbar.value) return
  Object.assign(heading, { owner, title: props.title ?? undefined, description: props.description ?? undefined })
})
onBeforeUnmount(() => {
  if (heading?.owner === owner) Object.assign(heading, { owner: undefined, title: undefined, description: undefined })
})
</script>

<template>
  <Teleport v-if="inTopbar" defer to="#admin-topbar-actions">
    <slot />
  </Teleport>
  <header v-else class="admin-heading">
    <p v-if="description">{{ description }}</p>
    <div v-if="slots.default" class="admin-actions">
      <slot />
    </div>
  </header>
</template>
