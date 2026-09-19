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
import { menuIconClasses, menuIconSlotClasses, treeRowClasses } from "./navigationStyles"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsTruncated } from "@/composables/useIsTruncated"
import { ChevronDown, ChevronRight } from "lucide-vue-next"
import { computed, ref, watch } from "vue"

type Item = { id: string; name: string; children: Item[] }
const props = defineProps<{ routeName: string; item: Item; openItems: string[] }>()
const open = ref(props.openItems.includes(props.item.id))

const labelRef = ref<HTMLElement | null>(null)
const { isTruncated, check } = useIsTruncated()
const tooltipOpen = ref(false)
function onRowEnter() {
  check(labelRef.value)
  if (isTruncated.value) tooltipOpen.value = true
}
function onRowLeave() {
  tooltipOpen.value = false
}

const activeChildIndex = computed(() => {
  if (!sortedChildren.value.length || !open.value) return -1
  
  return sortedChildren.value.findIndex(child => {
    const hasActiveChild = (item: Item): boolean => {
      if (props.openItems.includes(item.id)) return true
      if (item.children) {
        return item.children.some(child => hasActiveChild(child))
      }
      return false
    }
    return hasActiveChild(child)
  })
})

const hasActiveChild = computed(() => activeChildIndex.value >= 0)

const sortedChildren = computed(() => {
  if (!props.item.children) {
    return []
  }
  return props.item.children.slice().sort((a, b) => a.name.localeCompare(b.name))
})

watch(
  () => props.openItems,
  (next, prev) => {
    open.value =
      (next.includes(props.item.id) && prev.includes(props.item.id)) ||
        (!next.includes(props.item.id) && !prev.includes(props.item.id))
        ? open.value
        : next.includes(props.item.id)
  }
)

function handleLinkClick(event: MouseEvent) {
  const isClickRelatedToArrow = event
    .composedPath()
    .some((el) =>
      (el as HTMLDivElement).classList?.contains("layout-link-tree__icon-wrapper")
    )
  if (
    props.openItems[props.openItems.length - 1] === props.item.id &&
    !isClickRelatedToArrow
  ) {
    event.preventDefault()
    open.value = !open.value
  }
}
</script>

<template>
  <div>
    <div class="relative">
      <Button v-if="item.children?.length > 0" @click="open = !open" variant="ghost" type="button"
        :aria-expanded="open" :aria-label="`${open ? 'Collapse' : 'Expand'} ${item.name}`"
        class="layout-link-tree__icon-wrapper peer absolute left-px top-2 z-10 flex cursor-pointer border-none size-5 min-h-0 p-0.5 hover:bg-neutral-200 shrink-0">
        <ChevronDown v-if="open" :class="menuIconClasses" />
        <ChevronRight v-else :class="menuIconClasses" />
      </Button>
      <Tooltip :open="tooltipOpen">
        <TooltipTrigger as-child>
          <router-link :to="{ name: routeName, params: { id: item.id } }" @click.exact="handleLinkClick"
            @mouseenter="onRowEnter" @mouseleave="onRowLeave" @focus="onRowEnter" @blur="onRowLeave"
            active-class="layout-link-tree__item--active border-l-2 ml-[-2px] border-transparent text-neutral-900! font-medium"
            class="layout-link-tree__item peer-hover:bg-neutral-200 peer-hover:text-neutral-900" :class="treeRowClasses">
            <div :class="menuIconSlotClasses" />
            <div ref="labelRef" class="truncate min-w-0 flex-1">{{ item.name }}</div>
          </router-link>
        </TooltipTrigger>
        <TooltipContent side="right" align="start" :side-offset="6" :align-offset="-2"
          class="bg-white text-neutral-900 text-body font-medium border-neutral-200 shadow-md px-2 py-1.5 rounded-md max-w-[480px]">
          {{ item.name }}
        </TooltipContent>
      </Tooltip>
    </div>
    <div v-if="open" class="children-container relative pl-4">
      <span v-if="hasActiveChild" aria-hidden="true" data-tree-connector class="pointer-events-none absolute left-[11px] -top-[18px] h-[18px] w-px bg-[#d4d4d4]" />
      <div v-for="(child, index) in sortedChildren" :key="child.id" class="relative">
        <span v-if="hasActiveChild && index <= activeChildIndex" aria-hidden="true" data-tree-connector
          class="pointer-events-none absolute -left-[5px] top-0 w-px bg-[#d4d4d4]"
          :class="index === activeChildIndex ? 'h-[18px]' : 'h-full'" />
        <span v-if="index === activeChildIndex" aria-hidden="true" data-tree-connector
          class="pointer-events-none absolute -left-[5px] top-[18px] h-px w-[6px] bg-[#d4d4d4]" />
        <MainLinkTree :item="child" :open-items="openItems" :route-name="routeName" />
      </div>
    </div>
  </div>
</template>
