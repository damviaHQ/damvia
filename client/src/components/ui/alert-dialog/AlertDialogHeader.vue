<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { dialogHeaderClasses } from '@/components/ui/dialog/styles'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div data-dialog-header
    :class="cn(dialogHeaderClasses, props.class)"
  >
    <slot />
  </div>
</template>
