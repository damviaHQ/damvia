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
    :class="neutral ? 'dv-theme dv-neutral dv-toaster' : 'dv-theme dv-toaster'"
    position="bottom-right"
    :close-button="true"
    :gap="10"
    :visible-toasts="4"
    :toast-options="{
      classes: {
        toast: 'dv-toast',
        title: 'dv-toast__title',
        description: 'dv-toast__description',
        closeButton: 'dv-toast__close',
        actionButton: 'dv-toast__action',
        cancelButton: 'dv-toast__cancel',
      },
    }"
  />
</template>

<style>
/* Unlayered so it wins over vue-sonner's own stylesheet. */
.dv-toaster[data-sonner-toaster] {
  --border-radius: var(--dv-radius-surface);
  --normal-bg: var(--dv-surface-panel);
  --normal-border: var(--dv-color-line);
  --normal-text: var(--dv-text-primary);
  font-family: var(--dv-font-body);
}
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] {
  align-items: flex-start;
  gap: 10px;
  padding: 14px 44px 14px 16px;
  box-shadow: 0 1px 2px rgb(15 23 42 / .04), 0 10px 28px -8px rgb(15 23 42 / .16);
}
/* vue-sonner measures a toast with getBoundingClientRect, so a scaled stacked toast is measured short and clipped once expanded. */
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-expanded='false'][data-front='false'] { --y: translateY(calc(var(--lift-amount) * var(--toasts-before))); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-icon] { width: 18px; height: 20px; margin: 0; color: var(--dv-text-secondary); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-icon] svg { width: 18px; height: 18px; margin: 0; }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-type='success'] [data-icon] { color: var(--dv-color-success); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-type='error'] [data-icon] { color: var(--dv-color-danger); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-type='warning'] [data-icon] { color: var(--dv-color-warning); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-type='info'] [data-icon] { color: var(--dv-action-primary); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-content] { flex: 1; min-width: 0; gap: 2px; }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-title] { font-size: var(--dv-size-body); font-weight: 600; line-height: 20px; color: var(--dv-text-primary); overflow-wrap: anywhere; }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-description] { font-size: 13px; line-height: 18px; color: var(--dv-text-secondary); overflow-wrap: anywhere; }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-close-button] {
  top: 12px; right: 12px; bottom: auto; left: auto; transform: none;
  width: 22px; height: 22px; border: 0; border-radius: var(--dv-radius-sm);
  background: transparent; color: var(--dv-text-secondary);
}
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-close-button]:hover { background: var(--dv-surface-canvas); color: var(--dv-text-primary); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-close-button]:focus-visible { box-shadow: none; outline: 2px solid var(--dv-action-primary); outline-offset: 1px; }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-button] {
  align-self: center; height: 30px; margin: 0; padding: 0 12px;
  border-radius: var(--dv-radius-button); font-size: var(--dv-size-caption); font-weight: 550;
}
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-button]:not([data-cancel]) { background: var(--dv-action-primary); color: var(--dv-text-on-dark); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-button]:not([data-cancel]):hover { background: var(--dv-action-hover); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-cancel] { background: transparent; color: var(--dv-text-secondary); border: 1px solid var(--dv-color-line); }
.dv-toaster[data-sonner-toaster] [data-sonner-toast][data-styled='true'] [data-button]:focus-visible { box-shadow: none; outline: 2px solid var(--dv-action-primary); outline-offset: 2px; }
</style>
