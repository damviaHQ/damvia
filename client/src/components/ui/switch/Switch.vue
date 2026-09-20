<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { cn } from "@/lib/utils"
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from "reka-ui"
import type { SwitchRootEmits, SwitchRootProps } from "reka-ui"
import { computed, type HTMLAttributes } from "vue"

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<SwitchRootEmits>()

const delegated = computed(() => {
  const { class: _, ...rest } = props
  return rest
})
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <SwitchRoot
    v-bind="forwarded"
    :class="cn('peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-neutral-300 bg-neutral-200 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--dv-selection-color)] data-[state=checked]:bg-[var(--dv-selection-color)]', props.class)"
  >
    <SwitchThumb class="pointer-events-none block size-3 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[13px]" />
  </SwitchRoot>
</template>
