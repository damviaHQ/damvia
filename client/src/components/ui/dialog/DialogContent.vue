<script setup lang="ts">
import { inject } from 'vue'
const adminTheme = inject('damvia-admin-theme', false)
import { type HTMLAttributes, computed } from 'vue'
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { dialogSurfaceClasses, clientDialogClasses } from '@/components/ui/dialog/styles'

defineOptions({ inheritAttrs: false })

const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      :data-admin-overlay="adminTheme || undefined" :data-client-overlay="!adminTheme || undefined"      class="fixed inset-0 z-50 bg-black/45     "
    />
    <DialogContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          dialogSurfaceClasses,
          adminTheme ? 'dv-theme dv-admin admin-dialog' : clientDialogClasses, props.class
        )
      "
    >
      <slot />

      <DialogClose data-dialog-close
        class="absolute right-5 top-5 grid size-8 place-items-center rounded-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X class="size-6" stroke-width="1.7" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
