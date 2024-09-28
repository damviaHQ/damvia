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
  BetweenHorizontalStart,
  ChevronDown,
  Ellipsis,
  FilePenLine,
  Folder,
  GripVertical,
  Home,
  LetterText,
  Plus,
  Settings,
  Trash,
} from "lucide-vue-next"
import { computed, ref } from "vue"

type MenuItem = RouterOutput["menuItem"]["list"]

const props = defineProps<{ parent?: MenuItem; item: MenuItem }>()
const isOpen = ref(false)
const dropdownOpen = ref(false)
const activeDialog = ref<"add" | "edit" | null>(null)
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

function openDialog(type: "add" | "edit") {
  activeDialog.value = type
  closeDropdown()
}
</script>

<template>
  <div v-if="props.item">
    <div class="items-tree__item flex w-full items-center border border-gray-200 rounded-md p-2 mb-2 justify-between">
      <div class="items-tree__grab">
        <GripVertical class="h-4 w-4 cursor-grab" />
      </div>
      <div class="items-tree__icon-group">

        <div class="items-tree__type-icon w-full">
          <BetweenHorizontalStart v-if="item.type === 'divider'" class="w-4 h-4" />
          <FilePenLine v-if="item.type === 'page'" class="w-4 h-4" />
          <LetterText v-if="item.type === 'text'" class="w-4 h-4" />
          <Folder v-if="item.type === 'collection' && !item.synchronized" class="w-4 h-4 text-neutral-600" />
          <IconCloudSync v-if="item.type === 'collection' && item.synchronized" class="!w-8 !h-8 text-sky-600" />
        </div>
      </div>
      <div @click="isOpen = !isOpen" class="flex w-full min-w-[20rem] items-center">
        <ChevronDown v-if="item.children" :class="['w-4 h-4', !isOpen && '-rotate-90']" class="mx-2" />
        <div v-else class="w-4 h-4" />
        <template v-if="props.item?.type === 'collection'">
          {{ props.item.collectionName }}
        </template>
        <template v-if="props.item?.type === 'page'">
          {{ props.item.pageName }}
        </template>
        <template v-else-if="props.item?.type === 'text'">
          {{ props.item.data.text }}
        </template>
        <template v-else-if="props.item?.type === 'divider'">
          <div :key="item" :style="{
            content: ' ',
            background: item.data.border && '#ccc',
            height: `1px`,
            width: `100px`,
            marginTop: item.data.spacingTop && `${item.data.spacingTop}px`,
            marginBottom: item.data.spacingBottom && `${item.data.spacingBottom}px`,
          }" />
        </template>
      </div>
      <div v-if="['collection', 'page'].includes(item.type) && item.home" class="items-tree__home-icon">
        <Home class="h-4 w-4" />
      </div>
      <DropdownMenu v-model:open="dropdownOpen">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <Ellipsis class="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem v-if="item.type === 'collection'" @select="openDialog('add')">
            <div class="flex items-center">
              <Plus class="h-4 w-4 mr-2" />
              <span>Add Item to Collection</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem @select="openDialog('edit')">
            <div class="flex items-center">
              <Settings class="h-4 w-4 mr-2" />
              <span>Edit Item</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="['collection', 'page'].includes(item.type)" @click="setHome(item)">
            <Home class="h-4 w-4 mr-2" />
            <span>Set as Home</span>
          </DropdownMenuItem>
          <DropdownMenuItem @click="handleRemove(item)">
            <Trash class="h-4 w-4 mr-2" />
            <span>Remove from menu</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ItemDialog v-if="item.type === 'collection'" :parent="item" v-model:open="isAddDialogOpen">
        <template #default="{ open }">
          <div @click="open()" class="hidden">Add Item</div>
        </template>
      </ItemDialog>
      <ItemDialog :item="editedItem" :parent="parent" v-model:open="isEditDialogOpen">
        <template #default="{ open }">
          <div @click="open()" class="hidden">Edit</div>
        </template>
      </ItemDialog>
    </div>
    <div v-if="item.children && isOpen" class="items-tree__children">
      <ItemsTree :items="item.children" :parent="item" />
    </div>
  </div>
</template>

<style scoped>
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
