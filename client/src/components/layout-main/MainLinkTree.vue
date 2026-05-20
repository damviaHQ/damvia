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
    <Tooltip :open="tooltipOpen">
      <TooltipTrigger as-child>
        <router-link :to="{ name: routeName, params: { id: item.id } }" @click.exact="handleLinkClick"
          @mouseenter="onRowEnter" @mouseleave="onRowLeave"
          active-class="layout-link-tree__item--active border-l-2 ml-[-2px] border-transparent text-neutral-900 font-medium"
          class="layout-link-tree__item flex h-9 items-center text-sm no-underline font-medium pl-[1px] pr-2 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 min-w-0">
          <Button v-if="item.children?.length > 0" @click.prevent="open = !open" variant="ghost" type="button"
            class="layout-link-tree__icon-wrapper flex cursor-pointer border-none w-fit p-0.5 hover:bg-neutral-200 relative shrink-0">
            <ChevronDown v-if="open" class="w-4 h-4 min-w-4 min-h-4 ml-[0.5px]" />
            <ChevronRight v-else class="w-4 h-4 min-w-4 min-h-4" />
            <!-- Vertical line starts from chevron button -->
            <span v-if="hasActiveChild" class="active-line-start"></span>
          </Button>
          <div v-else class="w-4 h-4 min-w-4 min-h-4 mr-[2px] shrink-0" />
          <div ref="labelRef" class="truncate min-w-0 flex-1">{{ item.name }}</div>
        </router-link>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" :side-offset="6" :align-offset="-2"
        class="bg-white text-neutral-900 text-sm font-medium border-neutral-200 shadow-md px-2 py-1.5 rounded-md max-w-[480px]">
        {{ item.name }}
      </TooltipContent>
    </Tooltip>
    <div v-if="open" :class="[
      'pl-4',
      'children-container',
      hasActiveChild && 'has-active-child'
    ]" :style="{ '--active-index': activeChildIndex }">
      <MainLinkTree v-for="(child, index) in sortedChildren" :key="child.id" :item="child" :open-items="openItems"
        :route-name="routeName" :class="index === activeChildIndex && 'is-active-child'" />
    </div>
  </div>
</template>

<style scoped>
.layout-link-tree__name {
  display: flex;
  align-items: center;
}

.layout-link-tree__root--active .layout-link-tree__name {
  font-weight: 900;
}

.children-container {
  position: relative;
}

.active-line-start {
  position: absolute;
  left: 10px;
  bottom: -18px; 
  width: 1px;
  height: 13px;
  background-color: rgb(212, 212, 212);
  z-index: 1;
}

.children-container.has-active-child::before {
  content: "";
  position: absolute;
  left: 11px; 
  top: 0;
  width: 1px;
  background-color: rgb(212, 212, 212);
  height: calc(var(--active-index, 0) * 36px + 18px);
  z-index: 0;
}

.is-active-child {
  position: relative;
}

.is-active-child::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 18px;
  width: 6px;
  height: 1px;
  background-color: rgb(212, 212, 212);
  z-index: 1;
}
</style>
