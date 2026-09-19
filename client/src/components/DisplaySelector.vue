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
import { LayoutGrid, Rows3 } from "lucide-vue-next"
import { RadioGroupItem, RadioGroupRoot } from "reka-ui"
import { ref, watch } from "vue"

interface Props {
  modelValue: "grid" | "list"
}

const props = defineProps<Props>()
const selectedView = ref(props.modelValue)
const emit = defineEmits<{
  (e: "update:modelValue", value: "grid" | "list"): void
}>()


watch(() => props.modelValue, (newValue) => {
  selectedView.value = newValue
})

function updateView(value: "grid" | "list") {
  selectedView.value = value
  emit("update:modelValue", value)
}
</script>

<template>
  <RadioGroupRoot v-model="selectedView" class="inline-flex w-fit gap-1 bg-neutral-100 p-1">
    <RadioGroupItem v-for="view in (['grid', 'list'] as const)" :key="view" :value="view" @click="updateView(view)"
      class="flex h-8 items-center gap-2 px-3 text-[13px] text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:bg-white data-[state=checked]:text-neutral-900 data-[state=checked]:shadow-sm">
      <component :is="view === 'grid' ? LayoutGrid : Rows3" class="size-4" />
      {{ view === 'grid' ? 'Grid' : 'List' }}
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
