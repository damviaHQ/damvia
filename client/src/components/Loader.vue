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
defineProps<{ text?: boolean }>()
</script>

<template>
  <div class="loader__container">
    <span class="loader-animation"></span>
    <div v-if="text" class="loader-text">Loading</div>
  </div>
</template>

<style scoped>
.loader-animation {
  @apply w-10 h-10 border-4 border-dashed rounded-[50%] border-neutral-300 inline-block relative box-border animate-spin;
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.loader__container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  position: absolute;
  top: 50%;
  left: 50%;
  color: var(--primary-color35);
}
</style>
