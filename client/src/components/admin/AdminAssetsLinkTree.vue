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
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "@lucide/vue"
import { ref, watch } from "vue"
import { useRouter } from "vue-router"

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

// The chevron and the name do the same thing: open the folder and toggle
// its children, so the tree never reacts differently to where the click lands.
const router = useRouter()
function toggle() {
  open.value = !open.value
}
function handleChevronClick() {
  toggle()
  router.push({ name: 'admin-assets', params: { id: props.asset.id } })
}
</script>

<template>
  <div class="layout-link-tree__wrapper">
    <div class="layout-link-tree__row">
    <button v-if="asset.children?.length > 0" type="button" @click="handleChevronClick" class="layout-link-tree__icon-wrapper"
      :aria-expanded="open" :aria-label="`${open ? 'Collapse' : 'Expand'} ${asset.name}`">
      <ChevronDown v-if="open" class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
      <ChevronRight v-else class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
    </button>
    <div v-else class="w-4 h-4" />
    <router-link :to="{ name: 'admin-assets', params: { id: asset.id } }" @click="toggle"
      active-class="layout-link-tree__link--active" class="layout-link-tree__link">
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
    </div>
    <div v-if="open" class="layout-link-tree__children">
      <AdminAssetsLinkTree v-for="child in asset.children" :key="child.id" :asset="child" :open-items="openItems" />
    </div>
  </div>
</template>

<style scoped>
@reference "../../style.css";

.layout-link-tree__wrapper {
  display: flex;
  flex-direction: column;
}

.layout-link-tree__row {
  display: flex;
  align-items: center;
  padding-left: 8px;
  transition: background .15s ease;
}

.layout-link-tree__row:hover { background:var(--dv-surface-canvas); }
.layout-link-tree__row:has(> .layout-link-tree__link--active) { background:var(--dv-action-soft); }

.layout-link-tree__link {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  min-height: 38px;
  padding: 6px 8px 6px 0;
  color: var(--dv-text-secondary);
  font-size:var(--dv-size-caption);
  cursor: pointer;
  text-decoration: none;
  background: transparent;
  transition: color .15s ease;
}

.layout-link-tree__link:hover { color:var(--dv-text-primary); }

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
.layout-link-tree__icon-wrapper svg { width:var(--dv-icon-compact); height:var(--dv-icon-compact); }

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

.layout-link-tree__link--active { color:var(--dv-action-primary); }
.layout-link-tree__link--active .layout-link-tree__folder { color:var(--dv-action-primary); }
</style>
