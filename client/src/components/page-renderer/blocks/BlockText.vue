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
defineProps<{ data: { html?: string }; editing?: boolean }>()
</script>

<template>
  <div v-if="data.html" class="page-text" v-html="data.html" />
  <p v-else-if="editing" class="text-sm text-neutral-500 italic">Empty text block. Click to write something.</p>
</template>

<style scoped>
.page-text :deep(h2) { font-size: 1.5rem; font-weight: 600; padding-bottom: .5rem; }
.page-text :deep(h3) { font-size: 1.25rem; font-weight: 600; padding-bottom: .5rem; }
.page-text :deep(h4) { font-size: 1.125rem; font-weight: 600; padding-bottom: .5rem; }
.page-text :deep(p) { padding-bottom: .5rem; }
.page-text :deep(ul) { list-style: disc; padding-left: 1.5rem; padding-bottom: .5rem; }
.page-text :deep(ol) { list-style: decimal; padding-left: 1.5rem; padding-bottom: .5rem; }
.page-text :deep(blockquote) { border-left: 4px solid var(--dv-color-line, #e2e8f0); padding: .25rem 0 .25rem 1rem; }
.page-text :deep(a) { color: #2563eb; text-decoration: underline; }
.page-text :deep(hr) { border: 0; border-top: 1px solid var(--dv-color-line, #e2e8f0); margin: 1rem 0; }
</style>
