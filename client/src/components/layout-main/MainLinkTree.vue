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
import { ChevronDown, ChevronRight } from "lucide-vue-next"
import { computed, ref, watch } from "vue"

type Item = { id: string; name: string; children: Item[] }
const props = defineProps<{ routeName: string; item: Item; openItems: string[] }>()
const open = ref(props.openItems.includes(props.item.id))

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
    <router-link :to="{ name: routeName, params: { id: item.id } }" @click.exact="handleLinkClick"
      active-class="layout-link-tree__item--active border-l-2 ml-[-2px] border-neutral-300 text-neutral-900 font-medium"
      class="layout-link-tree__item flex items-center text-sm no-underline pl-[1px] py-2.5 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900">
      <Button v-if="item.children?.length > 0" @click.prevent="open = !open" variant="ghost" type="button"
        class="layout-link-tree__icon-wrapper flex cursor-pointer border-none w-fit p-1.5 mr-0.5 hover:bg-neutral-200">
        <ChevronDown v-if="open" class="w-4 h-4 min-w-4 min-h-4" />
        <ChevronRight v-else class="w-4 h-4 min-w-4 min-h-4" />
      </Button>
      <div v-else class="w-4 h-4 min-w-4 min-h-4" />
      <div class="flex items-center font-medium">{{ item.name }}</div>
    </router-link>
    <div v-if="open" class="pl-4">
      <MainLinkTree v-for="child in sortedChildren" :key="child.id" :item="child" :open-items="openItems"
        :route-name="routeName" />
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
</style>
