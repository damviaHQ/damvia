<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2026 Arnaud DE SAINT JEAN
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
withDefaults(defineProps<{ variant?: 'primary' | 'quiet' | 'secondary'; small?: boolean; type?: 'button' | 'submit' | 'reset' }>(), { variant: 'secondary', type: 'button' })
</script>
<template>
  <button :type="type" class="dv-button" :class="[{ 'dv-button--small': small }, `dv-button--${variant}`]"><slot /></button>
</template>
