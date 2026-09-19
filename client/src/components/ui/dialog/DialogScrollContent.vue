<script setup lang="ts">
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
import { X } from '@lucide/vue'
import { inject } from 'vue'
const adminTheme = inject('damvia-admin-theme', false)
import { cn } from '@/lib/utils'

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
      :data-admin-overlay="adminTheme || undefined" :data-client-overlay="!adminTheme || undefined"
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45      "
    >
      <DialogContent
        :class="
          cn(
            'relative z-50 grid w-full max-w-lg my-8 gap-4 border border-border bg-background p-6 shadow-lg  sm:rounded-lg md:w-full',
            adminTheme ? 'dv-theme dv-admin admin-dialog' : 'dv-theme dv-neutral dv-client client-dialog client-dialog--scroll w-[calc(100%-32px)] rounded-xl border-border bg-white p-7', props.class,
          )
        "
        v-bind="forwarded"
        @pointer-down-outside="(event) => {
          const originalEvent = event.detail.originalEvent;
          const target = originalEvent.target as HTMLElement;
          if (originalEvent.offsetX > target.clientWidth || originalEvent.offsetY > target.clientHeight) {
            event.preventDefault();
          }
        }"
      >
        <slot />

        <DialogClose
          class="absolute top-3 right-3 p-0.5 transition-colors rounded-md hover:bg-secondary"
        >
          <X class="w-6 h-6" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
