<script setup lang="ts">
import { cn } from '@/lib/utils'
import { Check } from 'lucide-vue-next'
import {
  SelectItem,
  SelectItemIndicator,
  type SelectItemProps,
  SelectItemText,
  useForwardProps,
} from 'reka-ui'
import { type HTMLAttributes, computed } from 'vue'

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectItem v-bind="forwardedProps" class="select-item [&[data-highlighted]]:bg-neutral-100 [&[data-highlighted]]:text-neutral-900 [&[data-highlighted]]:cursor-pointer [&[data-state=checked]]:bg-none" :class="cn(
    'relative flex w-full cursor-pointer select-none items-center py-1.5 pl-8 pr-2 text-[13px] outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground data-[disabled]:opacity-100',
    props.class
  )
    ">
    <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectItemIndicator>
        <Check class="h-4 w-4" />
      </SelectItemIndicator>
    </span>

    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
