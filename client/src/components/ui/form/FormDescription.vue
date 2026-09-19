<script lang="ts" setup>
import { helpClasses } from '@/components/ui/field/styles'
import type { HTMLAttributes } from 'vue'
import { useFormField } from './useFormField'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { formDescriptionId } = useFormField()
</script>

<template>
  <p
    :id="formDescriptionId"
    :class="cn(helpClasses, props.class)"
  >
    <slot />
  </p>
</template>
