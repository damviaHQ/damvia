<script setup lang="ts">
import { labelClasses } from '@/components/ui/field/styles'
import { type HTMLAttributes, computed } from 'vue'
import { Label, type LabelProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})
</script>

<template>
  <Label
    v-bind="delegatedProps"
    :class="
      cn(
        labelClasses,
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>
