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
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref, watch } from "vue"
import Treeselect from "vue3-treeselect-ts"
import {Loader2Icon} from "lucide-vue-next";
import {Checkbox} from "@/components/ui/checkbox";

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: "update:modelValue", isOpen: boolean): void;
  (e: "created", collection: RouterOutput["collection"]["createUserCollection"]): void
}>()
const toast = useGlobalToast()
const queryClient = useQueryClient()

const form = ref<{ name: string; collectionId?: string; draft: boolean }>({
  name: '',
  draft: false,
})

const { isPending, error, mutate } = useMutation({
  mutationFn() {
    return trpc.collection.create.mutate({
      name: form.value.name!,
      parentId: form.value.collectionId,
      public: true,
      draft: form.value.collectionId ? undefined : form.value.draft ?? false,
    })
  },
  async onSuccess(collection) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["collection", "tree"] }),
      queryClient.invalidateQueries({ queryKey: ["menu-items"] }),
      queryClient.invalidateQueries({ queryKey: ["collection", "ListPrivateCollections"] }),
      queryClient.invalidateQueries({ queryKey: ['collection', 'treeAdmin', 'public'] }),
    ])
    toast.success("Your collection is created. You can now add files to it.")
    emit("update:modelValue", false)
    emit("created", collection)
  },
  onError(error: Error) {
    toast.error(error.message)
  }
})

const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})

watch(
  () => props.modelValue,
  () => {
    form.value = { name: '', draft: false }
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
  if (!form.value.name || form.value.name.trim() === '') {
    toast.error("Collection name is required")
    return
  }

  return mutate()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    onSubmit()
  }
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <form @submit.prevent="onSubmit" @keydown="handleKeyDown">
        <DialogHeader>
          <DialogTitle>Create a public collection</DialogTitle>
          <DialogDescription>
            Give your collection a name <span v-if="collectionOptions.length > 0" class="text-muted-foreground">and
              optionally place it inside a
              parent
              collection.</span>
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-4 py-4">
          <div>
            <Label>Collection Name</Label>
            <Input v-model="form.name" type="text" placeholder="Name" class="form-input mb-075" required />
          </div>
          <div v-if="collectionOptions.length > 0">
            <Label>Parent collection</Label>
            <Treeselect v-model="form.collectionId" class="mb-075" placeholder="Parent collection"
              :options="collectionOptions" :clearable="true" :flat="true" />
          </div>
          <div class="flex items-center gap-2">
            <Checkbox v-model:checked="form.draft" id="draft" />
            <Label for="draft">Draft</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="link" @click="emit('update:modelValue', false)" :disabled="isPending">
            Cancel
          </Button>
          <Button type="submit" :disabled="isPending">
            Create
            <Loader2Icon v-if="isPending" class="h-4 w-4 animate-spin ml-2" />
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
