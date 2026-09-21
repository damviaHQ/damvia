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
import { formatRecordValue, splitMulti, valueError, type ValueField } from "@/utils/recordValues"
import { ExternalLink } from "@lucide/vue"
import { computed } from "vue"

// How one value reads in the grid: chips for selects, a link for a web
// address, numbers aligned right, and a marked value when it breaks its type.
const props = defineProps<{ field: ValueField, value: string | null | undefined }>()
const error = computed(() => valueError(props.field, props.value))
const chips = computed(() => props.field.valueType === "multi_select" ? splitMulti(props.value) : props.value ? [props.value] : [])
</script>

<template>
  <span v-if="error" class="record-value is-invalid" :title="error" aria-invalid="true">{{ value }}<span class="sr-only"> ({{ error }})</span></span>
  <span v-else-if="field.valueType === 'single_select' || field.valueType === 'multi_select'" class="record-value record-chips">
    <span v-for="chip in chips" :key="chip" class="record-chip">{{ chip }}</span>
  </span>
  <span v-else-if="field.valueType === 'url' && value" class="record-value record-url">
    <span class="truncate">{{ formatRecordValue(field, value) }}</span>
    <a :href="value" target="_blank" rel="noopener noreferrer" tabindex="-1" :aria-label="`Open ${value}`" @click.stop><ExternalLink class="size-3.5" /></a>
  </span>
  <span v-else class="record-value" :class="{ 'is-number': field.valueType === 'number' }">{{ formatRecordValue(field, value) }}</span>
</template>
