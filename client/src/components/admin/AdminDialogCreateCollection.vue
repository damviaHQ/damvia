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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Check, FolderPen, FolderSync } from "lucide-vue-next"
import { computed, ref, watch } from "vue"
import Treeselect from "vue3-treeselect-ts"

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: "update:modelValue", isOpen: boolean): void;
  (e: "created", collection: RouterOutput["collection"]["create"]): void
}>()
const toast = useGlobalToast()
const globalStore = useGlobalStore()
const queryClient = useQueryClient()
const form = ref<{
  name?: string
  collectionId?: string
  synchronized?: boolean
  assetFolderId?: string
  draft?: boolean
}>({})
const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})
const { data: assetFolders } = useQuery({
  queryKey: ["asset", "tree"],
  queryFn() {
    if (!["admin", "manager"].includes(globalStore.user?.role!)) {
      return []
    }
    return trpc.asset.tree.query()
  },
})

watch(
  () => props.modelValue,
  () => {
    form.value = {}
  }
)

const collectionOptions = computed(() => {
  if (!collections.value) {
    return []
  }

  function formatCollectionArray(collections: RouterOutput["collection"]["tree"]): any {
    if (!collections.some((c: RouterOutput["collection"]["tree"][number]) => !c.synchronized)) {
      return undefined
    }

    return collections
      .filter((c: RouterOutput["collection"]["tree"][number]) => !c.synchronized)
      .map((c: RouterOutput["collection"]["tree"][number]) => ({
        id: c.id,
        label: c.name,
        children: c.children ? formatCollectionArray(c.children) : undefined,
      }))
  }
  return formatCollectionArray(collections.value)
})

async function onSubmit() {
  try {
    const collection = await (form.value.assetFolderId
      ? trpc.collection.createFromAsset.mutate({
        assetFolderId: form.value.assetFolderId!,
        parentId: form.value.collectionId,
        public: true,
        draft: form.value.collectionId ? undefined : form.value.draft ?? false,
      })
      : trpc.collection.create.mutate({
        name: form.value.name!,
        parentId: form.value.collectionId,
        public: true,
        draft: form.value.collectionId ? undefined : form.value.draft ?? false,
      }))

    queryClient.invalidateQueries({ queryKey: ['collection'] })
    queryClient.invalidateQueries({ queryKey: ["asset", "tree"] })
    toast.success("Your collection is created and added to the menu.")
    emit("update:modelValue", false)
    emit("created", collection)
  } catch (error) {
    toast.error((error as Error).message)
  }
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <form @submit.prevent="onSubmit">
        <DialogHeader>
          <DialogTitle>Create new collection</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new collection.
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-6 py-4">
          <div v-if="globalStore.user?.role === 'admin'" class="create-collection-modal__type-container mb-075">
            <div @click="form.synchronized = false" :class="[
              'create-collection-modal__type',
              { 'create-collection-modal__type--active': !form.synchronized },
            ]">
              <FolderPen class="w-4 h-4" />
              <div class="font-medium">Custom</div>
              <Check v-if="!form.synchronized" class="w-4 h-4 text-primary ml-auto" />
            </div>
            <div @click="form.synchronized = true" :class="[
              'create-collection-modal__type',
              { 'create-collection-modal__type--active': form.synchronized },
            ]">
              <FolderSync class="w-4 h-4" />
              <div class="font-medium">Synchronized</div>
              <Check v-if="form.synchronized" class="w-4 h-4 text-primary ml-auto" />
            </div>
          </div>
          <div v-if="form.synchronized" class="flex flex-col gap-2">
            <Label>Select a folder from your cloud storage *</Label>
            <treeselect v-model="form.assetFolderId" placeholder="Asset folder" :options="assetFolders"
              :normalizer="(node) => ({ id: node.id, label: node.name })" />
          </div>
          <div v-if="!form.synchronized" class="flex flex-col gap-2">
            <Label for="name">Name *</Label>
            <Input type="text" v-model="form.name" placeholder="Name" class="form-input mb-075" />
          </div>
          <div v-if="collectionOptions?.length" class="flex flex-col gap-2">
            <Label for="collectionId">Select a parent collection</Label>
            <treeselect v-model="form.collectionId" class="mb-075" placeholder="Parent collection"
              :options="collectionOptions" :clearable="true" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <Checkbox v-model:checked="form.draft" id="draft" />
              <Label for="draft">Draft</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="link" @click="emit('update:modelValue', false)">
            Cancel
          </Button>
          <Button v-if="!form.synchronized" type="submit" :disabled="!form.name">Create Custom collection</Button>
          <Button v-else type="submit" :disabled="!form.assetFolderId">Create Synchronized collection</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.create-collection-modal__type-container {
  display: flex;
  align-items: stretch;
  gap: 1rem;
}

.create-collection-modal__type {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 1rem;
  cursor: pointer;
  padding: 0.75rem;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  transition: all 0.2s ease-in-out;
}

.create-collection-modal__type--active {
  border-color: var(--primary-color);
  background-color: var(--primary-color-light);
}

.create-collection-modal__type:hover {
  background-color: var(--hover-color);
}

.create-collection-modal__type svg {
  width: 1.5rem;
  height: 1.5rem;
}
</style>
