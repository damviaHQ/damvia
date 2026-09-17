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
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-vue-next"
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
      <FolderOpen v-if="open" class="layout-link-tree__folder" />
      <Folder v-else class="layout-link-tree__folder" />
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
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 38px;
  padding: 6px 8px;
  color: var(--dv-text-secondary);
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
  transition: background .15s ease, color .15s ease;
}

.layout-link-tree__link:hover { background:var(--dv-surface-canvas); color:var(--dv-text-primary); }

.layout-link-tree__link--disabled {
  pointer-events: none;
}

.layout-link-tree__icon-wrapper {
  cursor: pointer;
  border: none;
  background: transparent;
  display: flex;
  align-items:center;
  justify-content:center;
  width: 24px;
  height: 24px;
  padding:0;
  margin-right: 2px;
  color:var(--dv-text-secondary);
}

.layout-link-tree__icon-wrapper:hover { color:var(--dv-action-primary); }
.layout-link-tree__icon-wrapper svg { width:14px; height:14px; }

.layout-link-tree__icon {
  width: 1rem;
  height: 1rem;
  min-width: 1rem;
  min-height: 1rem;
}

.layout-link-tree__children {
  margin-left: 19px;
  padding-left: 7px;
  border-left:1px solid var(--dv-color-line);
}

.layout-link-tree__folder { width:15px; height:15px; margin-right:8px; color:var(--dv-text-secondary); }

.layout-link-tree__name {
  @apply overflow-hidden whitespace-nowrap text-ellipsis;
  max-width: calc(100% - 2.5rem);
  display: block;
}

.layout-link-tree__link--active .layout-link-tree__name {
  color:var(--dv-color-midnight);
  font-weight:650;
}

.layout-link-tree__link--active { background:var(--dv-action-soft); color:var(--dv-action-primary); }
.layout-link-tree__link--active .layout-link-tree__folder { color:var(--dv-action-primary); }
</style>
