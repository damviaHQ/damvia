<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { AlertDialogTitle, type AlertDialogTitleProps } from 'reka-ui'
import { cn } from '@/lib/utils'
import { dialogTitleClasses } from '@/components/ui/dialog/styles'

const props = defineProps<AlertDialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})
</script>

<template>
  <AlertDialogTitle
    v-bind="delegatedProps"
    :class="cn(dialogTitleClasses, props.class)"
  >
    <slot />
  </AlertDialogTitle>
</template>
