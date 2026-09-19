<script setup lang="ts">
import { DropdownMenuTrigger, type DropdownMenuTriggerProps, useForwardProps } from 'reka-ui'

const props = defineProps<DropdownMenuTriggerProps>()

const forwardedProps = useForwardProps(props)
</script>

<template>
  <DropdownMenuTrigger class="outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" v-bind="forwardedProps">
    <slot />
  </DropdownMenuTrigger>
</template>
