<script setup lang="ts">
import { inject } from 'vue'
const adminTheme = inject('damvia-admin-theme', false)
import { type HTMLAttributes, computed } from 'vue'
import {
  DropdownMenuSubContent,
  type DropdownMenuSubContentEmits,
  type DropdownMenuSubContentProps,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuSubContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<DropdownMenuSubContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuSubContent
    v-bind="forwarded"
    :class="cn('z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg          ', adminTheme ? 'dv-theme dv-admin admin-popover' : 'dv-theme dv-neutral dv-client client-popover rounded-none border-border bg-popover text-popover-foreground shadow-lg', props.class)"
  >
    <slot />
  </DropdownMenuSubContent>
</template>
