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
import CollectionDialogEdit from "@/components/collection/CollectionDialogEdit.vue"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RouterOutput } from "@/services/server.ts"
import { Ellipsis, Settings } from "lucide-vue-next"
import { ref } from "vue"

defineEmits<{ "update:open": [boolean] }>()
defineProps<{ collection: RouterOutput["collection"]["findById"] }>()
const editModalOpen = ref(false)
</script>

<template>
  <DropdownMenu v-if="collection.canEdit" @update:open="$emit('update:open', $event)">
    <DropdownMenuTrigger class="flex size-6 items-center justify-center text-neutral-600 cursor-pointer bg-transparent border-none hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600" :aria-label="`Actions for ${collection.name}`">
      <Ellipsis aria-hidden="true" class="size-6" />
    </DropdownMenuTrigger>
    <DropdownMenuContent :collision-padding="24" class="w-auto">
      <DropdownMenuItem @click="editModalOpen = true">
        <Settings class="w-4 h-4 mr-2" />
        Edit collection
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <CollectionDialogEdit v-model="editModalOpen" :collection="collection" />
</template>
