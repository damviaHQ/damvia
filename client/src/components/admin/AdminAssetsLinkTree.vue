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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Asset } from "@/layouts/LayoutAdmin.vue"
import { ChevronDown, ChevronRight } from "lucide-vue-next"
import { ref, watch } from "vue"

const props = defineProps<{ asset: Asset; openItems: string[] }>()
const open = ref(props.openItems.includes(props.asset.id))

watch(
  () => props.openItems,
  (next, prev) => {
    open.value =
      (next.includes(props.asset.id) && prev.includes(props.asset.id)) ||
        (!next.includes(props.asset.id) && !prev.includes(props.asset.id))
        ? open.value
        : next.includes(props.asset.id)
  }
)

function handleLinkClick(event: MouseEvent) {
  const isClickRelatedToArrow = event
    .composedPath()
    .some((el) =>
      (el as HTMLDivElement).classList?.contains("layout-link-tree__icon-wrapper")
    )
  if (
    props.openItems[props.openItems.length - 1] === props.asset.collectionId &&
    !isClickRelatedToArrow
  ) {
    event.preventDefault()
    open.value = !open.value
  }
}
</script>

<template>
  <div class="layout-link-tree__wrapper">
    <router-link :to="{ name: 'admin-assets', params: { id: asset.id } }" @click.exact="handleLinkClick"
      active-class="layout-link-tree__link--active" class="layout-link-tree__link">
      <button v-if="asset.children?.length > 0" @click.prevent="open = !open" class="layout-link-tree__icon-wrapper">
        <ChevronDown v-if="open" class="w-4 h-4" />
        <ChevronRight v-else class="w-4 h-4" />
      </button>
      <div v-else class="w-4 h-4" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div class="layout-link-tree__name">{{ asset.name }}</div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ asset.name }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </router-link>
    <div v-if="open" class="layout-link-tree__children">
      <AdminAssetsLinkTree v-for="child in asset.children" :key="child.id" :asset="child" :open-items="openItems" />
    </div>
  </div>
</template>

<style scoped>
.layout-link-tree__wrapper {
  display: flex;
  flex-direction: column;
}

.layout-link-tree__link {
  @apply flex items-center text-neutral-600 py-2 text-sm cursor-pointer no-underline hover:text-neutral-800 hover:bg-neutral-200;
  width: 100%;
}

.layout-link-tree__link--disabled {
  pointer-events: none;
}

.layout-link-tree__icon-wrapper {
  cursor: pointer;
  border: none;
  background: initial;
  display: flex;
  width: fit-content;
  margin-right: 0.5rem;
}

.layout-link-tree__icon {
  width: 1rem;
  height: 1rem;
  min-width: 1rem;
  min-height: 1rem;
}

.layout-link-tree__children {
  padding-left: 1rem;
}

.layout-link-tree__name {
  @apply overflow-hidden whitespace-nowrap text-ellipsis;
  max-width: calc(100% - 2.5rem);
  display: block;
}

.layout-link-tree__link--active .layout-link-tree__name {
  @apply font-bold text-neutral-800;
}
</style>
