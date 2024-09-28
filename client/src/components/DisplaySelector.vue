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
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from "radix-vue"
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
  <RadioGroupRoot v-model="selectedView" class="flex gap-2">
    <div class="flex items-center">
      <RadioGroupItem value="grid" @click="updateView('grid')" class="hover:bg-neutral-100">
        <RadioGroupIndicator />
        <label for="list-view"
          class="flex items-center gap-2 px-3 py-2 cursor-pointer text-neutral-500 border-2 border-transparent"
          :class="{ 'text-neutral-800 border-2 !border-neutral-800': selectedView === 'grid' }">
          <LayoutGrid :class="selectedView === 'grid' ? 'text-neutral-900' : 'text-neutral-400'" />
          Grid
        </label>
      </RadioGroupItem>
    </div>
    <div class="flex items-center">
      <RadioGroupItem value="list" @click="updateView('list')" class="hover:bg-neutral-100">
        <RadioGroupIndicator />
        <label for="list-view"
          class="flex items-center gap-2 px-3 py-2 cursor-pointer text-neutral-500 border-2 border-transparent"
          :class="{ 'text-neutral-800 border-2 !border-neutral-800': selectedView === 'list' }">
          <Rows3 :class="selectedView === 'list' ? 'text-neutral-900' : 'text-neutral-400'" />
          List
        </label>
      </RadioGroupItem>
    </div>
  </RadioGroupRoot>
</template>
