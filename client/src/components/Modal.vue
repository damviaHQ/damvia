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
