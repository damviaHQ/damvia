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
import { RouterOutput } from "@/services/server.ts"
import { sortBy } from "lodash"
import { ChevronDown, ChevronRight } from "lucide-vue-next"
import { computed, ref, watch } from "vue"

type MenuItem = RouterOutput["menuItem"]["list"][number]

const props = defineProps<{ routeName: string; item: MenuItem; openItems: string[] }>()
const open = ref(props.openItems.includes(props.item.collectionId))

const sortedChildren = computed(() => {
  if (!props.item.children) {
    return []
  }
  return sortBy(props.item.children, "position")
})

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
    .some((el) => (el as HTMLDivElement).classList?.contains("h-4 w-4-wrapper"))
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
  <div class="layout-link-tree__wrapper">
    <router-link v-if="item.type === 'collection'" :to="{ name: routeName, params: { id: item.collectionId } }"
      @click.exact="handleLinkClick"
      active-class="layout-menu-tree__item--active border-l-2 ml-[-2px] border-neutral-300 text-neutral-900 font-medium"
      class="layout-menu-tree__item flex py-2.5 items-center text-sm no-underline pl-[1px] text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900">
      <Button type="button" variant="ghost" v-if="item.children?.length > 0" @click.prevent="open = !open"
        class="layout-menu-tree__icon-wrapper flex cursor-pointer border-none w-fit p-1.5 mr-0.5 hover:bg-neutral-200">
        <ChevronDown v-if="open" class="w-4 h-4 min-w-4 min-h-4" />
        <ChevronRight v-else class="w-4 h-4 min-w-4 min-h-4" />
      </Button>
      <div v-else class="w-4 h-4 min-w-4 min-h-4" />
      <div class="flex items-center font-medium">{{ item.collectionName }}</div>
    </router-link>
    <router-link v-if="item.type === 'page'" :to="{ name: 'page', params: { id: item.pageId } }"
      @click.exact="handleLinkClick"
      active-class="layout-menu-tree__item--active border-l-2 ml-[-2px] border-neutral-300 text-neutral-900 font-medium"
      class="layout-menu-tree__item flex items-center text-sm no-underline pl-[1px] py-2.5 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900">
      <div class="h-4 w-4" />
      <div class="flex items-center font-medium">{{ item.pageName }}</div>
    </router-link>
    <a v-if="item.type === 'text'" :href="item.data?.url" :target="item.data?.external ? '_blank' : '_self'"
      class="layout-link-tree__link" :class="!item.data?.url && 'pointer-events-none'">
      <div class="flex items-center font-medium pl-[9px]">{{ item.data?.text }}</div>
    </a>
    <div v-if="item.type === 'divider'"
      :class="['h-px', item.data.border ? 'bg-neutral-400' : 'bg-transparent', 'divider']" :style="{
        marginTop: item.data.spacingTop ? `${item.data.spacingTop}px` : '0px',
        marginBottom: item.data.spacingBottom ? `${item.data.spacingBottom}px` : '0px',
      }" />
    <div v-if="open" class="pl-4">
      <MainMenuTree v-for="child in sortedChildren" :key="child.id" :item="child" :open-items="openItems"
        :route-name="routeName" />
    </div>
  </div>
</template>

<style scoped>
.layout-link-tree__wrapper {
  @apply flex flex-col;
}

.layout-link-tree__link {
  @apply flex items-center no-underline text-sm cursor-pointer rounded-md h-10 px-2 hover:bg-neutral-200;
}

.layout-link-tree__name {
  @apply flex items-center;
}

.layout-link-tree__link--active .layout-link-tree__name {
  @apply font-medium;
}

.divider {
  @apply self-center w-[90%];
}

.divider-color {
  @apply bg-neutral-400;
}
</style>
