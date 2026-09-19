<script setup lang="ts">
import { controlClasses } from '@/components/ui/field/styles'
import { cn } from '@/lib/utils'
import { ChevronDown } from '@lucide/vue'
import { SelectIcon, SelectTrigger, type SelectTriggerProps, useForwardProps } from 'reka-ui'
import { type HTMLAttributes, computed } from 'vue'

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectTrigger v-bind="forwardedProps" :class="cn(
    controlClasses, 'items-center justify-between gap-2 data-placeholder:text-muted-foreground [&>span]:line-clamp-1',
    props.class
  )
    ">
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="w-4 h-4 opacity-50" />
    </SelectIcon>
  </SelectTrigger>
</template>
