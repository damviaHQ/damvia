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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
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
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="flex flex-col p-8">
    <div class="menu-items__top flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage> Menu </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div class="flex items-center gap-4 mb-4">
        <ItemDialog>
          <Button type="button" variant="link" class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
            <CirclePlus class="w-4 h-4 max-w-4 max-h-4" />
            Add a new item
          </Button>
        </ItemDialog>
        <AdminDialogCreateCollection :modelValue="isAdminDialogCreateCollectionOpen"
          @update:modelValue="isAdminDialogCreateCollectionOpen = $event" />
      </div>
      <div class="flex items-center gap-4 mb-4">
        <items-tree :items="menuItems" />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
