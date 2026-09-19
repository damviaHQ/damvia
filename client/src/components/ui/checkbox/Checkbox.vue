<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import type { CheckboxRootEmits, CheckboxRootProps } from 'reka-ui'
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from 'reka-ui'
import { Check, Minus } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = defineProps<CheckboxRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<CheckboxRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <CheckboxRoot
    v-bind="forwarded"
    v-slot="{ state }"
    data-ui-checkbox
    :class="
      cn('peer checkbox-surface hover:border-[var(--dv-text-secondary)] ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--dv-selection-color)] data-[state=checked]:bg-[var(--dv-selection-color)] data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-[var(--dv-selection-color)] data-[state=indeterminate]:bg-[var(--dv-selection-color)] data-[state=indeterminate]:text-primary-foreground',
         props.class)"
  >
    <CheckboxIndicator class="flex h-full w-full items-center justify-center text-current">
      <slot :state="state">
        <Minus v-if="state === 'indeterminate'" data-checkbox-indicator="mixed" class="size-3.5 [stroke-width:3]" />
        <Check v-else class="size-3.5 [stroke-width:3]" />
      </slot>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
