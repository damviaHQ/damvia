<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template><div aria-hidden="true" :class="cn('animate-pulse bg-muted', $props.class)" /></template>
