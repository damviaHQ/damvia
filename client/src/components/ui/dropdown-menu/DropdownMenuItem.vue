<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { DropdownMenuItem, type DropdownMenuItemProps, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuItemProps & { class?: HTMLAttributes['class'], inset?: boolean, variant?: 'default' | 'destructive' }>()

const delegatedProps = computed(() => {
  const { class: _, variant: __, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuItem
    v-bind="forwardedProps"
    class="dropdown-item [&[data-highlighted]]:hover:bg-neutral-100"
    :class="
      cn(
        'relative flex cursor-pointer select-none items-center gap-2 px-2 py-1.5 text-[13px] outline-hidden transition-colors focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground data-[disabled]:opacity-100 [&_svg]:pointer-events-none [&_svg]:size-[var(--dv-icon-compact)] [&_svg]:shrink-0',
        variant === 'destructive'
          ? 'text-destructive focus:text-destructive [&[data-highlighted]]:text-destructive'
          : 'text-foreground focus:text-accent-foreground [&[data-highlighted]]:text-neutral-800',
        inset && 'pl-8',
        props.class
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
