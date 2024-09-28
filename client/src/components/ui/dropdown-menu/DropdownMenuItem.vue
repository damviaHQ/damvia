<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { DropdownMenuItem, type DropdownMenuItemProps, useForwardProps } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuItemProps & { class?: HTMLAttributes['class'], inset?: boolean }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuItem
    v-bind="forwardedProps"
    class="dropdown-item"
    :class="
      cn(
        'relative flex cursor-default select-none text-neutral-600 items-center px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        props.class
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>

<style lang="scss">
.dropdown-item {
  &[data-highlighted] {
    @apply hover:bg-neutral-100 text-neutral-800;
  }
}
</style>
