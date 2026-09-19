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
import AdminDialogCreateCollection from "@/components/admin/AdminDialogCreateCollection.vue"
import ItemDialog from "@/components/admin/menu-items/ItemDialog.vue"
import ItemsTree from "@/components/admin/menu-items/ItemsTree.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { CirclePlus } from "lucide-vue-next"
import { ref } from "vue"

const isAdminDialogCreateCollectionOpen = ref(false)
const { data: menuItems, status, error } = useQuery({
  queryKey: ["menu-items"],
  queryFn: () => trpc.menuItem.list.query(),
})
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="admin-error" role="alert">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="admin-page admin-resource-page">
    <div class="admin-menu-content">
      <div class="admin-heading"><h1>Menu</h1>
      <div class="admin-actions">
        <ItemDialog>
          <Button type="button" variant="default" class="dv-button dv-button--primary">
            <CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] max-w-[var(--dv-icon-compact)] max-h-[var(--dv-icon-compact)]" />
            Add menu item
          </Button>
        </ItemDialog>
        <AdminDialogCreateCollection :modelValue="isAdminDialogCreateCollectionOpen"
          @update:modelValue="isAdminDialogCreateCollectionOpen = $event" />
      </div>
      </div>
      <div class="dv-panel admin-menu-tree">
        <p class="admin-form-note">Drag items to change their order, or use Move up and Move down in an item’s menu. Open an item’s menu to edit it or set the home page.</p>
        <div v-if="!menuItems?.length" class="admin-empty"><h2>No menu items yet</h2><p>Add a collection, page or link to your navigation.</p></div>
        <items-tree :items="menuItems" />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
