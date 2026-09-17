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
<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
const props = defineProps<{ items?: T[]; fields: string[]; label: string }>()
const search = ref('')
const page = ref(1)
const filtered = computed(() => (props.items ?? []).filter(item => props.fields.some(field => String(item[field] ?? '').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 20)))
watch(search, () => { page.value = 1 })
watch(pages, value => { page.value = Math.min(page.value, value) })
const visible = computed(() => filtered.value.slice((page.value - 1) * 20, page.value * 20))
</script>
<template>
  <section class="admin-list dv-panel" :aria-label="label">
    <div class="admin-list-toolbar">
      <input v-model="search" type="search" class="dv-input" :aria-label="`Search ${label.toLowerCase()}`" :placeholder="`Search ${label.toLowerCase()}…`" />
      <span role="status">{{ filtered.length }} {{ filtered.length === 1 ? 'result' : 'results' }}</span>
    </div>
    <slot v-if="visible.length" :items="visible" />
    <div v-else class="admin-empty"><h2>{{ search ? 'No matching results' : `No ${label.toLowerCase()} yet` }}</h2><Button v-if="search" variant="outline" @click="search = ''">Clear search</Button></div>
    <footer v-if="pages > 1" class="admin-list-footer">
      <span>Page {{ page }} of {{ pages }}</span>
      <div class="admin-actions"><Button variant="outline" :disabled="page === 1" @click="page--">Previous</Button><Button variant="outline" :disabled="page === pages" @click="page++">Next</Button></div>
    </footer>
  </section>
</template>
