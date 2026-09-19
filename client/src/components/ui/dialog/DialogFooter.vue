<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { dialogFooterClasses } from '@/components/ui/dialog/styles'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div data-dialog-footer
    :class="
      cn(
        dialogFooterClasses,
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
