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
import CollectionDialogShare from "@/components/collection/CollectionDialogShare.vue"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCollectionFavorites } from "@/composables/useCollectionFavorites"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Ellipsis, FolderOpen, Link, Settings, Star } from "lucide-vue-next"
import { computed, ref } from "vue"
import { useRouter } from "vue-router"

defineEmits<{ "update:open": [boolean] }>()
const props = defineProps<{ collection: RouterOutput["collection"]["findById"] }>()
const router = useRouter()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const { canFavorite, isFavorite, toggle, isSaving, isSuccess } = useCollectionFavorites()
const editModalOpen = ref(false)
const shareModalOpen = ref(false)
const isLoadingAction = ref(false)
const queryKey = computed(() => ["collection", props.collection.id])
const { data: details } = useQuery({
  queryKey,
  queryFn: () => trpc.collection.findById.query(props.collection.id),
  enabled: computed(() => editModalOpen.value || shareModalOpen.value),
})

async function openDialog(action: 'edit' | 'share') {
  isLoadingAction.value = true
  try {
    await queryClient.fetchQuery({ queryKey: queryKey.value, queryFn: () => trpc.collection.findById.query(props.collection.id) })
    if (action === 'edit') editModalOpen.value = true
    else shareModalOpen.value = true
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    isLoadingAction.value = false
  }
}
</script>

<template>
  <DropdownMenu @update:open="$emit('update:open', $event)">
    <DropdownMenuTrigger :disabled="isLoadingAction" class="flex size-6 shrink-0 items-center justify-center text-neutral-600 cursor-pointer bg-transparent border-none hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600" :aria-label="`Actions for ${collection.name}`">
      <Ellipsis aria-hidden="true" class="size-6" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" side="bottom" :side-offset="4" :collision-padding="12" class="min-w-52">
      <DropdownMenuItem class="gap-2" @select="router.push({ name: 'collection', params: { id: collection.id } })">
        <FolderOpen aria-hidden="true" class="size-4 shrink-0" /> Open collection
      </DropdownMenuItem>
      <DropdownMenuItem v-if="canFavorite" class="gap-2" :disabled="isSaving || !isSuccess" @select="toggle(collection.id)">
        <Star aria-hidden="true" class="size-4 shrink-0" :class="isFavorite(collection.id) && 'fill-current'" />
        {{ isFavorite(collection.id) ? 'Remove from favorites' : 'Add to favorites' }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="collection.canEdit" class="gap-2" @select="openDialog('share')">
        <Link aria-hidden="true" class="size-4 shrink-0" /> Share collection
      </DropdownMenuItem>
      <DropdownMenuItem v-if="collection.canEdit" class="gap-2" @select="openDialog('edit')">
        <Settings aria-hidden="true" class="size-4 shrink-0" /> Edit collection
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <CollectionDialogEdit v-if="details && collection.canEdit && editModalOpen" v-model="editModalOpen" :collection="details" />
  <CollectionDialogShare v-if="details && collection.canEdit && shareModalOpen" v-model="shareModalOpen" :collection="details" />
</template>
