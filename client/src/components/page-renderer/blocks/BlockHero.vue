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
import { Button } from "@/components/ui/button"
import { computed } from "vue"
import { resolveMedia } from "../media"
import type { PageAssets } from "../types"
import BlockLink from "./BlockLink.vue"

// While editing, the title and subtitle are typed into fields laid over the
// banner, so the rendered copies would double up behind them.
const props = defineProps<{ data: any; assets?: PageAssets; editing?: boolean; textHidden?: boolean }>()
const media = computed(() => resolveMedia(props.data?.media, props.assets))
const isEmpty = computed(() => !media.value && !props.data?.title && !props.data?.subtitle)
const focus = computed(() => {
  const point = props.data?.focus ?? {}
  return `object-position:${point.x ?? 50}% ${point.y ?? 50}%`
})
</script>

<template>
  <section v-if="!isEmpty || editing"
    class="page-hero relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-md bg-neutral-100 p-6 md:min-h-[320px] md:p-10">
    <img v-if="media" :src="media.displayURL" alt="" class="absolute inset-0 h-full w-full object-cover"
      :style="focus" />
    <div v-if="media" aria-hidden="true" class="absolute inset-0 bg-linear-to-t from-black/70 to-black/10" />
    <div class="relative" :class="media ? 'text-white' : 'text-neutral-900'">
      <template v-if="!textHidden">
        <h2 v-if="data.title" class="text-3xl font-semibold text-balance md:text-4xl">{{ data.title }}</h2>
        <p v-if="data.subtitle" class="mt-2 max-w-2xl text-base md:text-lg">{{ data.subtitle }}</p>
        <p v-if="editing && !data.title && !data.subtitle" class="text-sm italic opacity-80">
          Add a picture and a title to this banner.
        </p>
      </template>
      <BlockLink v-if="data.button?.label" :link="data.button.link" :assets="assets" :disabled="editing"
        class="mt-4 inline-block w-max">
        <Button type="button" tabindex="-1">{{ data.button.label }}</Button>
      </BlockLink>
    </div>
  </section>
</template>
