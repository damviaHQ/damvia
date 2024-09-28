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
const emit = defineEmits<{ close: [] }>()

function handleClick(event: Event) {
  if ((event.target as HTMLDivElement).classList.contains('modal__container')) {
    emit('close')
  }
}
</script>

<template>
  <div class="modal__container" @click="handleClick">
    <div class="modal__content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.modal__container {
  position: fixed;
  z-index: 999;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.modal__content {
  background: #fff;
  padding: 1rem;
}
</style>
