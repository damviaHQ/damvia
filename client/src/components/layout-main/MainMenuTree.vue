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
import { menuIconClasses, menuIconSlotClasses, treeRowClasses, treeActiveRowClasses, treeConnectorStartClasses } from "./navigationStyles"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsTruncated } from "@/composables/useIsTruncated"
import { RouterOutput } from "@/services/server.ts"
import sortBy from "lodash/sortBy"
import { ChevronDown, ChevronRight } from "@lucide/vue"
import { computed, ref, watch } from "vue"

type MenuItem = RouterOutput["menuItem"]["list"][number]

const props = defineProps<{ routeName: string; item: MenuItem; openItems: string[] }>()
const open = ref(props.openItems.includes(props.item.collectionId))

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

const sortedChildren = computed(() => {
  if (!props.item.children) {
    return []
  }
  return sortBy(props.item.children, "position")
})

const isActiveItem = computed(() => {
  const itemId = props.item.collectionId || props.item.pageId
  return itemId && props.openItems[props.openItems.length - 1] === itemId
})

const activeChildIndex = computed(() => {
  if (!sortedChildren.value.length || !open.value) return -1
  
  return sortedChildren.value.findIndex(child => {
    const childId = child.collectionId || child.pageId
    return childId && props.openItems.includes(childId)
  })
})

const hasActiveChild = computed(() => activeChildIndex.value >= 0)

watch(
  () => props.openItems,
  (next, prev) => {
    open.value =
      (next.includes(props.item.collectionId) &&
        prev.includes(props.item.collectionId)) ||
        (!next.includes(props.item.collectionId) && !prev.includes(props.item.collectionId))
        ? open.value
        : next.includes(props.item.collectionId)
  }
)

function handleLinkClick(event: MouseEvent) {
  const isClickRelatedToArrow = event
    .composedPath()
    .some((el) =>
      (el as HTMLDivElement).classList?.contains("layout-menu-tree__icon-wrapper")
    )
  if (
    props.openItems[props.openItems.length - 1] === props.item.collectionId &&
    !isClickRelatedToArrow
  ) {
    event.preventDefault()
    open.value = !open.value
  }
}
</script>

<template>
  <div class="layout-link-tree__wrapper flex flex-col relative">
    <Button type="button" variant="ghost" v-if="item.type === 'collection' && item.hasAccess && item.children?.length > 0" @click="open = !open"
      :aria-expanded="open" :aria-label="`${open ? 'Collapse' : 'Expand'} ${item.collectionName}`"
      class="layout-menu-tree__icon-wrapper peer absolute left-px top-2 z-10 flex cursor-pointer border-none size-5 min-h-0 p-0.5 hover:bg-neutral-200 shrink-0">
      <ChevronDown v-if="open" :class="menuIconClasses" />
      <ChevronRight v-else :class="menuIconClasses" />
    </Button>
    <Tooltip v-if="(item.type === 'collection' && item.hasAccess) || item.type === 'page' || item.type === 'text'"
      :open="tooltipOpen">
      <TooltipTrigger as-child>
        <router-link v-if="item.type === 'collection' && item.hasAccess" :to="{ name: routeName, params: { id: item.collectionId } }"
          @click.exact="handleLinkClick" @mouseenter="onRowEnter" @mouseleave="onRowLeave" @focus="onRowEnter" @blur="onRowLeave"
          :class="[
            'layout-menu-tree__item peer-hover:bg-neutral-200 peer-hover:text-neutral-900', treeRowClasses,
            isActiveItem && ['layout-menu-tree__item--active', treeActiveRowClasses]
          ]">
          <div :class="menuIconSlotClasses" />
          <div ref="labelRef" class="truncate min-w-0 flex-1">{{ item.collectionName }}</div>
        </router-link>
        <router-link v-else-if="item.type === 'page'" :to="{ name: 'page', params: { id: item.pageId } }"
          @click.exact="handleLinkClick" @mouseenter="onRowEnter" @mouseleave="onRowLeave" @focus="onRowEnter" @blur="onRowLeave"
          :class="[
            'layout-menu-tree__item', treeRowClasses,
            isActiveItem ? ['layout-menu-tree__item--active', treeActiveRowClasses] : ''
          ]">
          <div :class="menuIconSlotClasses" />
          <div ref="labelRef" class="truncate min-w-0 flex-1">{{ item.pageName }}</div>
        </router-link>
        <a v-else-if="item.type === 'text'" :href="item.data?.url" :target="item.data?.external ? '_blank' : '_self'"
          @mouseenter="onRowEnter" @mouseleave="onRowLeave" @focus="onRowEnter" @blur="onRowLeave"
          class="layout-link-tree__link" :class="[treeRowClasses, !item.data?.url && 'pointer-events-none']">
          <span :class="menuIconSlotClasses" /><div ref="labelRef" class="truncate min-w-0 flex-1">{{ item.data?.text }}</div>
        </a>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" :side-offset="6" :align-offset="-2"
        class="bg-white text-neutral-900 text-body font-medium border-neutral-200 shadow-md px-2 py-1.5 rounded-md max-w-[480px]">
        {{ item.type === 'collection' ? item.collectionName : item.type === 'page' ? item.pageName : item.data?.text }}
      </TooltipContent>
    </Tooltip>
    <div v-if="item.type === 'divider'"
      :class="['h-px', item.data.border ? 'bg-neutral-400' : 'bg-transparent', 'divider self-center w-[90%]']" :style="{
        marginTop: item.data.spacingTop ? `${item.data.spacingTop}px` : '0px',
        marginBottom: item.data.spacingBottom ? `${item.data.spacingBottom}px` : '0px',
      }" />
    <div v-if="open || !item.hasAccess" class="children-container relative" :class="item.hasAccess && 'pl-4'">
      <span v-if="hasActiveChild" aria-hidden="true" data-tree-connector :class="treeConnectorStartClasses" />
      <div v-for="(child, index) in sortedChildren" :key="child.id" class="relative">
        <span v-if="hasActiveChild && index <= activeChildIndex" aria-hidden="true" data-tree-connector
          class="pointer-events-none absolute -left-[5px] top-0 w-px bg-[#d4d4d4]"
          :class="index === activeChildIndex ? 'h-[18px]' : 'h-full'" />
        <span v-if="index === activeChildIndex" aria-hidden="true" data-tree-connector
          class="pointer-events-none absolute -left-[5px] top-[18px] h-px w-[6px] bg-[#d4d4d4]" />
        <MainMenuTree :item="child" :open-items="openItems" :route-name="routeName" />
      </div>
    </div>
  </div>
</template>
