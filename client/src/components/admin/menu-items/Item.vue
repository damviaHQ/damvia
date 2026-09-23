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
import ItemDialog from "@/components/admin/menu-items/ItemDialog.vue"
import MoveDialog from "@/components/admin/menu-items/MoveDialog.vue"
import ItemsTree from "@/components/admin/menu-items/ItemsTree.vue"
import IconCloudSync from "@/components/icons/IconCloudSync.vue"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import {
  ArrowDown,
  ArrowUp,
  BetweenHorizontalStart,
  ChevronDown,
  Ellipsis,
  FilePenLine,
  Folder,
  GripVertical,
  Heading,
  Home,
  LetterText,
  Plus,
  Settings,
  Trash,
} from "@lucide/vue"
import { computed, nextTick, ref } from "vue"

type MenuItem = RouterOutput["menuItem"]["list"]

const props = defineProps<{ parent?: MenuItem; item: MenuItem; index: number; count: number; move: (delta: number) => Promise<void> }>()
const actionsTrigger = ref<{ $el: HTMLElement }>()
const isOpen = ref(false)
const dropdownOpen = ref(false)
const activeDialog = ref<"add" | "edit" | "move" | null>(null)
const queryClient = useQueryClient()

const isAddDialogOpen = computed({
  get: () => activeDialog.value === "add",
  set: (value) => {
    if (!value) activeDialog.value = null
  },
})
const isEditDialogOpen = computed({
  get: () => activeDialog.value === "edit",
  set: (value) => {
    if (!value) activeDialog.value = null
  },
})
const isMoveDialogOpen = computed({
  get: () => activeDialog.value === "move",
  set: (value) => { if (!value) activeDialog.value = null },
})
const editedItem = computed(() => {
  if (props.item.type === "divider") {
    return {
      ...props.item,
      data: props.item.data || {},
    }
  }
  return props.item
})

async function handleRemove(item: MenuItem) {
  await trpc.menuItem.remove.mutate({ id: item.id })
  await queryClient.invalidateQueries({ queryKey: ["menu-items"] })
}

async function setHome(item: MenuItem) {
  await trpc.menuItem.setHome.mutate({ id: item.id })
  await queryClient.invalidateQueries({ queryKey: ["menu-items"] })
}

function closeDropdown() {
  dropdownOpen.value = false
}

async function moveItem(delta: number) {
  await props.move(delta)
  await nextTick()
  actionsTrigger.value?.$el.focus()
}

function openDialog(type: "add" | "edit" | "move") {
  activeDialog.value = type
  closeDropdown()
}
</script>

<template>
  <div v-if="props.item">
    <div class="items-tree__item flex w-full items-center border border-gray-200 p-2 mb-2 justify-between">
      <div class="items-tree__grab" aria-hidden="true">
        <GripVertical class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)] cursor-grab" />
      </div>
      <div class="items-tree__icon-group">

        <div class="items-tree__type-icon w-full">
          <BetweenHorizontalStart v-if="item.type === 'divider'" class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
          <FilePenLine v-if="item.type === 'page'" class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
          <Heading v-if="item.type === 'section'" class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
          <LetterText v-if="item.type === 'text'" class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
          <Folder v-if="item.type === 'collection' && !item.synchronized" class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] admin-text-secondary" />
          <IconCloudSync v-if="item.type === 'collection' && item.synchronized" class="!w-8 !h-8 text-[var(--dv-action-primary)]" />
        </div>
      </div>
      <component :is="item.children ? 'button' : 'div'" :type="item.children ? 'button' : undefined"
        :aria-expanded="item.children ? isOpen : undefined" @click="isOpen = !isOpen"
        class="flex w-full min-w-[20rem] items-center text-left">
        <ChevronDown v-if="item.children" :class="['w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]', !isOpen && '-rotate-90']" class="mx-2" />
        <div v-else class="w-4 h-4" />
        <template v-if="props.item?.type === 'collection'">
          {{ props.item.collectionName }}
        </template>
        <template v-if="props.item?.type === 'page'">
          {{ props.item.pageName }}
        </template>
        <template v-else-if="props.item?.type === 'section'">
          {{ props.item.data?.label }}
        </template>
        <template v-else-if="props.item?.type === 'text'">
          {{ props.item.data.text }}
        </template>
        <template v-else-if="props.item?.type === 'divider'">
          <div :key="item" :style="{
            content: ' ',
            background: item.data.border && 'var(--dv-color-line)',
            height: `1px`,
            width: `100px`,
            marginTop: item.data.spacingTop && `${item.data.spacingTop}px`,
            marginBottom: item.data.spacingBottom && `${item.data.spacingBottom}px`,
          }" />
        </template>
      </component>
      <div v-if="['collection', 'page'].includes(item.type) && item.home" class="items-tree__home-icon">
        <Home class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" />
      </div>
      <DropdownMenu v-model:open="dropdownOpen">
        <DropdownMenuTrigger asChild>
          <Button ref="actionsTrigger" variant="ghost" size="icon" aria-label="Menu item actions">
            <Ellipsis class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem v-if="['collection', 'section'].includes(item.type)" @select="openDialog('add')">
            <Plus />
            <span>{{ item.type === 'section' ? 'Add item to section' : 'Add Item to Collection' }}</span>
          </DropdownMenuItem>
          <DropdownMenuItem @select="openDialog('edit')">
            <Settings />
            <span>Edit Item</span>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="item.type !== 'section'" @select="openDialog('move')">
            <Folder />
            <span>{{ item.followsCollectionParent ? 'About automatic placement' : 'Move to…' }}</span>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="index > 0" @select="moveItem(-1)">
            <ArrowUp />
            <span>Move up</span>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="index < count - 1" @select="moveItem(1)">
            <ArrowDown />
            <span>Move down</span>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="['collection', 'page'].includes(item.type)" @click="setHome(item)">
            <Home />
            <span>Set as Home</span>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" @click="handleRemove(item)">
            <Trash />
            <span>Remove from menu</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ItemDialog v-if="['collection', 'section'].includes(item.type)" :parent="item" v-model:open="isAddDialogOpen" />
      <MoveDialog :item="item" v-model:open="isMoveDialogOpen" />
      <ItemDialog :item="editedItem" :parent="parent" v-model:open="isEditDialogOpen" />
    </div>
    <div v-if="item.children && isOpen" class="items-tree__children">
      <ItemsTree :items="item.children" :parent="item" />
    </div>
  </div>
</template>

<style scoped>
@reference "../../../style.css";

.items-tree__grab {
  @apply mr-2 cursor-grab;
}

.items-tree__icon-group {
  @apply flex items-center w-12 justify-end;
}

.items-tree__home-icon {
  @apply mr-2;
}

.items-tree__type-icon {
  @apply flex items-center justify-center w-5;
}

.items-tree__item--button {
  display: none;
  background: none;
  border: none;
  padding: 0;
  margin-left: 4px;
}

.items-tree__item:hover .items-tree__item--button,
.items-tree__item--button.items-tree__item--button--active {
  display: flex;
}

.items-tree__children {
  padding-left: 24px;
  margin-top: -8px;
}
</style>
