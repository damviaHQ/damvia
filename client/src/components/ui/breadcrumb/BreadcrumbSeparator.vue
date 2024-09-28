<script lang="ts" setup>
import type { HTMLAttributes } from "vue";
import { ChevronRight } from "lucide-vue-next";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <li role="presentation" aria-hidden="true" :class="cn(props.class)">
    <slot>
      <ChevronRight class="h-4 w-4 text-neutral-500" />
    </slot>
  </li>
</template>
