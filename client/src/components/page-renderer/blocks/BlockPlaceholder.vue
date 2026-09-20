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
// A listing block is empty until the library fills it. Authors see what the
// block is for and why it looks empty, instead of a bare "nothing found".
defineProps<{ icon: any; title: string; explanation: string; reason: string }>()
</script>

<template>
  <div class="flex items-start gap-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50/60 p-4">
    <component :is="icon" class="mt-0.5 size-5 shrink-0 text-neutral-400" aria-hidden="true" />
    <div class="min-w-0">
      <p class="text-sm font-medium text-neutral-700">{{ title }}</p>
      <p class="mt-0.5 text-sm text-neutral-500">{{ explanation }}</p>
      <p class="mt-1 text-xs text-neutral-400">{{ reason }}</p>
    </div>
  </div>
</template>
