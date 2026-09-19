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
import { Download } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
defineProps<{
  title: string
  description?: string
  rows: Record<string, unknown>[]
  columns: { key: string; label: string; numeric?: boolean }[]
  empty?: string
}>()
defineEmits<{ export: [] }>()
const display = (value: unknown) =>
  typeof value === 'number' ? value.toLocaleString() : value == null ? '—' : String(value)
</script>
<template>
  <section class="insight-report">
    <header class="report-heading">
      <div>
        <h3>{{ title }}</h3>
        <p v-if="description">{{ description }}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        :disabled="!rows.length"
        :aria-label="`Export ${title} as CSV`"
        @click="$emit('export')"
        ><Download :size="14" /> CSV</Button
      >
    </header>
    <div v-if="rows.length" class="report-table-scroll">
      <table>
        <caption class="sr-only">{{ title }}</caption>
        <thead>
          <tr>
            <th v-for="column in columns" :key="column.key" :class="{ numeric: column.numeric }" scope="col">
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="String(row.id ?? row.name ?? index)">
            <td v-for="column in columns" :key="column.key" :class="{ numeric: column.numeric }">
              {{ display(row[column.key]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="report-empty">
      <p>{{ empty ?? 'No activity recorded for this period.' }}</p>
      <span>Try another period as your library activity grows.</span>
    </div>
  </section>
</template>
