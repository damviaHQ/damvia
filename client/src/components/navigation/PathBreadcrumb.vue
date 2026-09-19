<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2026 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. -->
<script setup lang="ts">
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { collapseBreadcrumb, type BreadcrumbEllipsisNode, type BreadcrumbNode } from '@/utils/breadcrumb'
import { computed, nextTick, onBeforeUnmount, ref, type ComponentPublicInstance } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export type PathBreadcrumbItem = BreadcrumbNode & {
  to?: RouteLocationRaw
}

const props = withDefaults(defineProps<{
  items: PathBreadcrumbItem[]
  headItems?: number
  tailItems?: number
  tone?: 'light' | 'dark'
}>(), {
  headItems: 1,
  tailItems: 2,
  tone: 'light',
})

const emit = defineEmits<{
  navigate: [item: PathBreadcrumbItem]
}>()

const collapsed = computed(() => collapseBreadcrumb(props.items, props.headItems, props.tailItems))
const isEllipsis = (item: PathBreadcrumbItem | BreadcrumbEllipsisNode): item is BreadcrumbEllipsisNode => 'isEllipsis' in item
const itemTo = (item: PathBreadcrumbItem | BreadcrumbEllipsisNode) => 'to' in item ? item.to : undefined
const navigate = (item: PathBreadcrumbItem | BreadcrumbEllipsisNode) => {
  if (!isEllipsis(item)) emit('navigate', item)
}

const labelElements = new Map<string, HTMLElement>()
const truncatedLabels = ref(new Set<string>())
let labelResizeObserver: ResizeObserver | undefined

const measureLabel = (id: string, element: HTMLElement) => {
  const isTruncated = element.scrollWidth > element.clientWidth + 1
  if (truncatedLabels.value.has(id) === isTruncated) return

  const next = new Set(truncatedLabels.value)
  if (isTruncated) next.add(id)
  else next.delete(id)
  truncatedLabels.value = next
}

const setLabelElement = (id: string, value: Element | ComponentPublicInstance | null) => {
  const previous = labelElements.get(id)
  if (previous) labelResizeObserver?.unobserve(previous)

  if (!(value instanceof HTMLElement)) {
    labelElements.delete(id)
    return
  }

  labelElements.set(id, value)
  if (typeof ResizeObserver !== 'undefined') {
    labelResizeObserver ??= new ResizeObserver(entries => {
      for (const entry of entries) {
        const labelId = entry.target.getAttribute('data-breadcrumb-label-id')
        if (labelId) measureLabel(labelId, entry.target as HTMLElement)
      }
    })
    labelResizeObserver.observe(value)
  }
  nextTick(() => measureLabel(id, value))
}

const isLabelTruncated = (id: string) => truncatedLabels.value.has(id)

onBeforeUnmount(() => labelResizeObserver?.disconnect())
</script>

<template>
  <Breadcrumb class="dv-breadcrumb min-w-0" :data-tone="tone">
    <BreadcrumbList class="dv-breadcrumb__list m-0 flex-nowrap gap-2 p-0 text-sm leading-5 sm:gap-2">
      <template v-for="(item, index) in collapsed.visibleItems" :key="item.id">
        <BreadcrumbItem class="dv-breadcrumb__item min-w-0 gap-0">
          <template v-if="isEllipsis(item)">
            <DropdownMenu>
              <DropdownMenuTrigger class="dv-breadcrumb__ellipsis" :aria-label="`Show ${collapsed.hiddenItems.length} hidden path items`">
                <BreadcrumbEllipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" :class="tone === 'dark' && 'dv-breadcrumb__menu--dark'">
                <DropdownMenuItem v-for="hiddenItem in collapsed.hiddenItems" :key="hiddenItem.id" as-child>
                  <router-link v-if="hiddenItem.to" :to="hiddenItem.to" class="dv-breadcrumb__menu-link" @click="emit('navigate', hiddenItem)">
                    {{ hiddenItem.label }}
                  </router-link>
                  <span v-else class="dv-breadcrumb__menu-link">{{ hiddenItem.label }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>
          <TooltipProvider v-else :delay-duration="250">
            <Tooltip>
              <TooltipTrigger as-child>
                <router-link
                  v-if="itemTo(item) && index < collapsed.visibleItems.length - 1"
                  :to="itemTo(item)!"
                  class="dv-breadcrumb__link"
                  @click="navigate(item)"
                >
                  <span
                    :ref="element => setLabelElement(item.id, element)"
                    class="dv-breadcrumb__label"
                    :data-breadcrumb-label-id="item.id"
                  >{{ item.label }}</span>
                </router-link>
                <BreadcrumbPage v-else class="dv-breadcrumb__current font-semibold" :tabindex="isLabelTruncated(item.id) ? 0 : undefined">
                  <span
                    :ref="element => setLabelElement(item.id, element)"
                    class="dv-breadcrumb__label"
                    :data-breadcrumb-label-id="item.id"
                  >{{ item.label }}</span>
                </BreadcrumbPage>
              </TooltipTrigger>
              <TooltipContent v-if="isLabelTruncated(item.id)" class="dv-theme dv-breadcrumb__tooltip">{{ item.label }}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="index < collapsed.visibleItems.length - 1" class="dv-breadcrumb__separator shrink-0 [&_svg]:size-4" />
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
