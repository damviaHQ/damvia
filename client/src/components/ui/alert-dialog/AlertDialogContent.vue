<script setup lang="ts">
import { inject } from 'vue'
const adminTheme = inject('damvia-admin-theme', false)
import { type HTMLAttributes, computed } from 'vue'
import {
  AlertDialogContent,
  type AlertDialogContentEmits,
  type AlertDialogContentProps,
  AlertDialogOverlay,
  AlertDialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'
import { dialogSurfaceClasses, clientDialogClasses } from '@/components/ui/dialog/styles'

const props = defineProps<AlertDialogContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<AlertDialogContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay
      :data-admin-overlay="adminTheme || undefined" :data-client-overlay="!adminTheme || undefined"      class="fixed inset-0 z-50 bg-black/45      "
    />
    <AlertDialogContent
      v-bind="forwarded"
      :class="
        cn(
          dialogSurfaceClasses,
          adminTheme ? 'dv-theme dv-admin admin-dialog' : clientDialogClasses, props.class,
        )
      "
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
