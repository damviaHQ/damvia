<script lang="ts" setup>
import { Toaster as Sonner, type ToasterProps } from 'vue-sonner'
import '../../../../../packages/design-system/src/components.css'
import '../../../../../packages/design-system/src/fonts.css'
import '../../../../../packages/design-system/src/tokens.css'

const props = defineProps<ToasterProps>()
</script>

<template>
  <Sonner
    v-bind="props"
    class="dv-theme dv-toaster"
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
        success: 'dv-toast--success',
        error: 'dv-toast--danger',
        info: 'dv-toast--info',
        warning: 'dv-toast--warning',
      },
    }"
  />
</template>

<style>
[data-sonner-toaster].dv-toaster {
  --width: 380px;
  --border-radius: var(--dv-radius-button);
  font-family: var(--dv-font-body);
}
[data-sonner-toaster].dv-toaster [data-sonner-toast].dv-toast[data-styled=true] {
  gap: 12px;
  min-height: 58px;
  padding: 13px 16px;
  overflow: visible;
  border: 1px solid rgb(255 255 255 / .14);
  border-radius: var(--dv-radius-button);
  background: var(--dv-color-midnight);
  color: var(--dv-text-on-dark);
  box-shadow: 0 16px 42px rgb(0 5 47 / .22);
}
[data-sonner-toaster].dv-toaster [data-sonner-toast] [data-icon] {
  display:grid;
  place-items:center;
  flex-shrink:0;
  width:18px;
  height:18px;
  padding:0;
  margin: 0;
  color:var(--dv-action-primary);
}
[data-sonner-toaster].dv-toaster [data-sonner-toast][data-type=success] [data-icon] { color:var(--dv-color-success); }
[data-sonner-toaster].dv-toaster [data-sonner-toast][data-type=error] [data-icon] { color:var(--dv-color-danger); }
[data-sonner-toaster].dv-toaster [data-sonner-toast][data-type=warning] [data-icon] { color:var(--dv-color-warning); }
[data-sonner-toaster].dv-toaster [data-sonner-toast] [data-icon] svg { width: 18px; height: 18px; stroke-width: 1.8; }
[data-sonner-toaster].dv-toaster [data-content] { gap: 3px; }
[data-sonner-toaster].dv-toaster .dv-toast__title { color: white; font-size: 13px; font-weight: 600; line-height: 1.4; letter-spacing: -.01em; }
[data-sonner-toaster].dv-toaster .dv-toast__description { color: var(--dv-text-on-dark-secondary); font-size: 11px; line-height: 1.5; }
[data-sonner-toaster].dv-toaster .dv-toast__action,
[data-sonner-toaster].dv-toaster .dv-toast__cancel {
  height: 32px;
  border: 1px solid rgb(255 255 255 / .24);
  border-radius: var(--dv-radius-button);
  padding: 0 11px;
  font: 550 11px/1 var(--dv-font-body);
}
[data-sonner-toaster].dv-toaster .dv-toast__action { background:var(--dv-action-primary); color:var(--dv-text-on-dark); border-color:var(--dv-action-primary); font:550 12px/1.5 var(--dv-font-body); padding:5px 10px; }
[data-sonner-toaster].dv-toaster .dv-toast__action:hover { background:var(--dv-action-hover); border-color:var(--dv-action-hover); }
[data-sonner-toaster].dv-toaster .dv-toast__cancel { background: transparent; color: var(--dv-text-on-dark-secondary); }
[data-sonner-toaster].dv-toaster .dv-toast__close {
  top: 9px;
  right: 9px;
  left: auto;
  width: 24px;
  height: 24px;
  transform: none;
  border: 0;
  border-radius: var(--dv-radius-button);
  background: transparent;
  color: var(--dv-text-on-dark-secondary);
}
[data-sonner-toaster].dv-toaster [data-sonner-toast]:has(.dv-toast__close) { padding-right: 47px; }
[data-sonner-toaster].dv-toaster [data-sonner-toast]:focus-visible { outline: 2px solid var(--dv-action-primary); outline-offset: 3px; }
@media (max-width: 600px) {
  [data-sonner-toaster].dv-toaster { --width: calc(100vw - 32px); }
}

</style>
