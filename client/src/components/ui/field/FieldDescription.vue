<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { helpClasses } from './styles'
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template>
  <p :class="cn(helpClasses, $props.class)"><slot /></p>
</template>
