<script setup lang="ts">
import { inject, type HTMLAttributes, computed } from 'vue'
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { X } from '@lucide/vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const adminTheme = inject('damvia-admin-theme', false)
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
    <DialogOverlay class="fixed inset-0 z-40 bg-black/30" />
    <DialogContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="cn('fixed inset-y-0 right-0 z-40 flex h-full w-full flex-col border-l bg-background shadow-lg', adminTheme ? 'dv-theme dv-admin admin-sheet' : '', props.class)"
    >
      <slot />
      <DialogClose data-dialog-close
        class="absolute right-4 top-4 grid size-8 place-items-center rounded-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X class="size-5" stroke-width="1.7" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
