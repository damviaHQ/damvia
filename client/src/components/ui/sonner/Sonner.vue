<script lang="ts" setup>
import { Toaster as Sonner, type ToasterProps } from 'vue-sonner'
import 'vue-sonner/style.css'
import { computed } from 'vue'

const props = withDefaults(defineProps<ToasterProps & { neutral?: boolean }>(), { neutral: false })
const forwarded = computed(() => { const { neutral: _, ...rest } = props; return rest })
</script>

<template>
  <Sonner
    v-bind="forwarded"
    class="[--width:380px] [--border-radius:0px] max-sm:[--width:calc(100vw-32px)]"
    :class="neutral ? 'dv-theme dv-neutral dv-toaster' : 'dv-theme dv-toaster'"
    position="bottom-right"
    :close-button="true"
    :gap="10"
    :visible-toasts="4"
    :toast-options="{
      unstyled: true,
      classes: {
        toast: 'dv-toast flex items-center gap-3 min-h-[58px] w-full overflow-visible border rounded-none px-4 py-[13px] pr-12 focus-visible:outline-2 focus-visible:outline-primary [&_[data-content]]:gap-[3px] [&_[data-icon]]:grid [&_[data-icon]]:place-items-center [&_[data-icon]]:size-[18px] [&_[data-icon]]:shrink-0 [&_[data-icon]_svg]:size-[18px] ' + (neutral ? 'border-[var(--dv-color-line)] bg-[var(--dv-surface-panel)] text-[var(--dv-text-primary)] shadow-md' : 'border-white/15 bg-[var(--dv-color-midnight)] text-white shadow-xl'),
        title: 'dv-toast__title text-[13px] font-semibold leading-snug ' + (neutral ? 'text-[var(--dv-text-primary)]' : 'text-white'),
        description: 'dv-toast__description text-caption leading-relaxed ' + (neutral ? 'text-[var(--dv-text-secondary)]' : 'text-white/70'),
        closeButton: 'dv-toast__close top-[9px]! right-[9px]! left-auto! size-6! translate-none! rounded-none! border-0! bg-transparent! ' + (neutral ? 'text-[var(--dv-text-secondary)]! hover:bg-neutral-100!' : 'text-white/70!'),
        actionButton: 'dv-toast__action h-8 px-3 text-[12px] bg-primary text-primary-foreground hover:bg-primary/90',
        cancelButton: 'dv-toast__cancel h-8 px-3 border text-caption ' + (neutral ? 'border-[var(--dv-color-line)] text-[var(--dv-text-secondary)]' : 'border-white/25 text-white/70'),
        success: 'dv-toast--success [&_[data-icon]]:text-[var(--dv-color-success)]',
        error: 'dv-toast--danger [&_[data-icon]]:text-[var(--dv-color-danger)]',
        info: 'dv-toast--info [&_[data-icon]]:text-[var(--dv-color-info)]',
        warning: 'dv-toast--warning [&_[data-icon]]:text-[var(--dv-color-warning)]',
      },
    }"
  />
</template>
