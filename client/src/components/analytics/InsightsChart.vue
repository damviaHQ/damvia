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
import { Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'
defineProps<{ title: string; description: string; empty?: boolean }>()
defineEmits<{ export: [] }>()
</script>
<template>
  <section class="insight-report">
    <header class="report-heading">
      <div>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        :disabled="empty"
        :aria-label="`Export ${title} as CSV`"
        @click="$emit('export')"
        ><Download :size="14" /> CSV</Button
      >
    </header>
    <div v-if="empty" class="report-empty chart-empty">
      <p>No activity recorded for this period.</p>
      <span>Charts will appear when people use your library.</span>
    </div>
    <div v-else class="report-chart"><slot /></div>
  </section>
</template>
