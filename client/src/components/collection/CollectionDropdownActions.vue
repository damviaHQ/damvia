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
import CollectionDialogDelete from "@/components/collection/CollectionDialogDelete.vue"
import CollectionDialogEdit from "@/components/collection/CollectionDialogEdit.vue"
import CollectionDialogRename from "@/components/collection/CollectionDialogRename.vue"
import CollectionDialogShare from "@/components/collection/CollectionDialogShare.vue"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Ellipsis, Link, Settings, Pencil, Trash } from "@lucide/vue"
import { computed, ref } from "vue"

const emit = defineEmits<{ "update:open": [boolean] }>()
const props = defineProps<{ collection: RouterOutput["collection"]["findById"] }>()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const canRename = computed(() => props.collection.canEdit && !props.collection.synchronized)
const menuOpen = ref(false)
const dismissedByOutsidePointer = ref(false)
const deleteModalOpen = ref(false)
const renameModalOpen = ref(false)
const editModalOpen = ref(false)
const shareModalOpen = ref(false)
const isLoadingAction = ref(false)
const queryKey = computed(() => ["collection", props.collection.id])
const { data: details } = useQuery({
  queryKey,
  queryFn: () => trpc.collection.findById.query(props.collection.id),
  enabled: computed(() => editModalOpen.value || shareModalOpen.value || (menuOpen.value && !!props.collection.parentId && !props.collection.parent)),
})

const canDelete = computed(() => {
  const collection = details.value ?? props.collection
  return collection.canEdit && (!collection.parentId || (!!collection.parent && !collection.parent.synchronized))
})

function updateMenuOpen(open: boolean) {
  if (open) dismissedByOutsidePointer.value = false
  menuOpen.value = open
  emit('update:open', open)
}

function handleCloseAutoFocus(event: Event) {
  // An outside click should not refocus the card and keep its hover actions visible.
  // Leave the default focus return in place for keyboard dismissal.
  if (dismissedByOutsidePointer.value) event.preventDefault()
}

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
  <DropdownMenu v-if="collection.canEdit" @update:open="updateMenuOpen">
    <DropdownMenuTrigger :disabled="isLoadingAction" class="flex size-6 shrink-0 items-center justify-center text-neutral-600 cursor-pointer bg-transparent border-none hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600" :aria-label="`Actions for ${collection.name}`">
      <Ellipsis aria-hidden="true" class="size-6" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" side="bottom" :side-offset="4" :collision-padding="12" class="min-w-52"
      @pointer-down-outside="dismissedByOutsidePointer = true" @close-auto-focus="handleCloseAutoFocus">
      <DropdownMenuItem v-if="canRename" @select="renameModalOpen = true">
        <Pencil aria-hidden="true" />Rename collection
      </DropdownMenuItem>
      <DropdownMenuItem v-if="collection.canEdit" @select="openDialog('share')">
        <Link aria-hidden="true" />Share collection
      </DropdownMenuItem>
      <DropdownMenuItem v-if="collection.canEdit" @select="openDialog('edit')">
        <Settings aria-hidden="true" />Edit collection
      </DropdownMenuItem>
      <DropdownMenuSeparator v-if="canDelete" />
      <DropdownMenuItem v-if="canDelete" variant="destructive" @select="deleteModalOpen = true">
        <Trash aria-hidden="true" />Delete collection
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <CollectionDialogDelete v-if="canDelete && deleteModalOpen" v-model="deleteModalOpen" :collection="details ?? collection" />
  <CollectionDialogRename v-if="canRename && renameModalOpen" v-model="renameModalOpen" :collection="collection" />
  <CollectionDialogEdit v-if="details && collection.canEdit && editModalOpen" v-model="editModalOpen" :collection="details" />
  <CollectionDialogShare v-if="details && collection.canEdit && shareModalOpen" v-model="shareModalOpen" :collection="details" />
</template>
