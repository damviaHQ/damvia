<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <Dialog :open="true" @update:open="(open) => { if (!open) emit('close') }">
    <DialogContent class="client-search-dialog max-w-[960px]" :aria-describedby="undefined">
      <DialogTitle class="pr-8">Search assets</DialogTitle>
      <slot />
    </DialogContent>
  </Dialog>
</template>
