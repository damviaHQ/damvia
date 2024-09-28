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
import Loader from "@/components/Loader.vue"
import Block from "@/components/page-editor/PageEditorBlock.vue"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { groupBy, sortBy, sumBy } from "lodash"
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const { status, data: page, error } = useQuery({
  queryKey: computed(() => ["pages", route.params.id]),
  queryFn: () => trpc.page.findById.query(route.params.id as string),
})

const rows = computed(() => {
  return sortBy(
    Object.entries(groupBy(page.value?.blocks ?? [], (block: any) => block.row)),
    ([value]: [string]) => parseInt(value, 10)
  ).map(([value, blocks]: any) => ({
    value: parseInt(value, 10),
    columns: sortBy(blocks, "column"),
  }))
})

function getBlockStyle(blocks: any[], block: any) {
  return { width: `${(block.width / sumBy(blocks, "width")) * 100}%` }
}
</script>

<template>
  <div v-if="page" class="page__container p-4">
    <div class="page__block-row">
      <div v-for="row in rows" :key="row.value" class="page__block-col">
        <block v-for="block in row.columns" :key="block.id" :block="block" :page="page"
          :style="getBlockStyle(row.columns, block)"
          :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
      </div>
    </div>
  </div>
  <div v-else-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
</template>

<style scoped>
.page__name {
  font-size: 1rem;
  color: var(--primary-color50);
  font-weight: 600;
}

.page__block-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page__block-col {
  display: flex;
  flex-direction: row;
  gap: 16px;
}
</style>
