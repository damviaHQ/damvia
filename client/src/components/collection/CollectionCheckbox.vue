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
import { computed } from "vue"

const props = defineProps<{
  state?: "check" | "undetermined" | null | false
}>()

const checkboxClass = computed(() => {
  if (props.state === "check") return "checkbox--checked"
  if (props.state === "undetermined") return "checkbox--undetermined"
  return ""
})
</script>

<template>
  <button :class="['checkbox', checkboxClass]" type="button">
    <svg class="checkbox__icon checkbox__icon--check" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
    <svg class="checkbox__icon checkbox__icon--uncheck" viewBox="0 0 24 24">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
    <svg class="checkbox__icon checkbox__icon--undetermined" viewBox="0 0 24 24">
      <path d="M5 12h14" />
    </svg>
    <svg class="checkbox__icon checkbox__icon--hover" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  </button>
</template>

<style scoped>
.checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: white;
  color: #6b7280;
  transition: all 0.2s;
  padding: 0;
}

.checkbox:hover {
  border-color: #1f2937;
  background-color: #f9fafb;
  color: #1f2937;
}

.checkbox__icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  display: none;
}

.checkbox__icon--check {
  display: none;
}

.checkbox__icon--uncheck {
  display: none;
}

.checkbox__icon--undetermined {
  display: none;
}

.checkbox__icon--hover {
  display: none;
}

.checkbox--checked .checkbox__icon--check {
  display: block;
}

.checkbox--checked:hover .checkbox__icon--check {
  display: none;
}

.checkbox--checked:hover .checkbox__icon--uncheck {
  display: block;
}

.checkbox--undetermined .checkbox__icon--undetermined {
  display: block;
}

.checkbox:hover .checkbox__icon--hover {
  display: block;
}

.checkbox--checked:hover .checkbox__icon--hover,
.checkbox--undetermined:hover .checkbox__icon--hover {
  display: none;
}
</style>
