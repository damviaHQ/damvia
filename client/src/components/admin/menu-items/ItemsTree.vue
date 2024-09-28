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
import Item from "@/components/admin/menu-items/Item.vue"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import { sortBy } from "lodash"
import { computed } from "vue"
import Draggable from "vuedraggable"

type MenuItem = RouterOutput["menuItem"]["list"]

const props = defineProps<{ parent?: MenuItem; items: MenuItem[] }>()
const queryClient = useQueryClient()

const sortedItems = computed(() => sortBy(props.items, "position"))

async function handleSort(items: MenuItem[]) {
  await trpc.menuItem.updatePositions.mutate({
    itemsPosition: Object.fromEntries(items.map((item, index) => [item.id, index])),
  })
  await queryClient.invalidateQueries({ queryKey: ["menu-items"] })
}
</script>

<template>
  <draggable :model-value="sortedItems" item-key="id" @update:model-value="handleSort($event)">
    <template #item="{ element: item }">
      <Item :item="item" :parent="parent" />
    </template>
  </draggable>
</template>
