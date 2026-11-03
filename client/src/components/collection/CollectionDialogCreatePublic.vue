<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
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
import CollectionPublishSchedule from "@/components/collection/CollectionPublishSchedule.vue"
import { publishTimeProblem } from "@/utils/publishSchedule"
import { useGlobalStore } from "@/stores/globalStore"
import {Loader2Icon} from "@lucide/vue";
import {Checkbox} from "@/components/ui/checkbox";

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: "update:modelValue", isOpen: boolean): void;
  (e: "created", collection: RouterOutput["collection"]["createUserCollection"]): void
}>()
const toast = useGlobalToast()
const queryClient = useQueryClient()

const globalStore = useGlobalStore()
const form = ref<{ name: string; collectionId?: string; draft: boolean; publishLater: boolean; publishAt: string }>({
  name: '',
  draft: false,
  publishLater: false,
  publishAt: '',
})
const schedulesPublish = computed(() => globalStore.user?.role === "admin" && form.value.draft && !form.value.collectionId && form.value.publishLater)

const { isPending, mutate } = useMutation({
  mutationFn() {
    return trpc.collection.create.mutate({
      name: form.value.name!,
      parentId: form.value.collectionId,
      public: true,
      draft: form.value.collectionId ? undefined : form.value.draft ?? false,
      publishAt: schedulesPublish.value ? new Date(form.value.publishAt) : undefined,
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
    form.value = { name: '', draft: false, publishLater: false, publishAt: '' }
  }
)

const collectionOptions = computed(() => {
  if (!collections.value) {
    return []
  }

  function formatCollectionArray(collections: RouterOutput["collection"]["tree"]): any {
    const options = collections
        .map((c: RouterOutput["collection"]["tree"][number]) => ({
          id: c.id,
          label: c.name,
          children: c.children ? formatCollectionArray(c.children) : undefined,
        }))
    return options.length ? options : undefined
  }
  return formatCollectionArray(collections.value) ?? []
})

async function onSubmit() {
  if (!form.value.name || form.value.name.trim() === '') {
    toast.error("Collection name is required")
    return
  }
  // Only a top-level draft is sent as one; a child follows its parent.
  const problem = schedulesPublish.value ? publishTimeProblem(form.value.publishAt) : null
  if (problem) {
    toast.error(problem)
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
    <DialogContent class="sm:max-w-[480px]">
      <form @submit.prevent="onSubmit" @keydown="handleKeyDown" class="grid gap-6">
        <DialogHeader>
          <DialogTitle>Create a public collection</DialogTitle>
          <DialogDescription>
            Give your collection a name <span v-if="collectionOptions.length > 0" class="text-muted-foreground">and
              optionally place it inside a
              parent
              collection.</span>
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-4">
          <FieldGroup>
            <Label for="create-collection-name">Collection name</Label>
            <Input id="create-collection-name" v-model="form.name" type="text" placeholder="Name"  required />
          </FieldGroup>
          <FieldGroup v-if="collectionOptions.length > 0" class="grid gap-2">
            <Label for="parent-collection">Parent collection</Label>
            <Treeselect v-model="form.collectionId" input-id="parent-collection" placeholder="Parent collection"
              :options="collectionOptions" :clearable="true" :flat="true" />
          </FieldGroup>
          <div>
            <div class="flex items-center gap-2">
              <Checkbox v-model="form.draft" id="draft" />
              <Label for="draft">Draft</Label>
            </div>
            <CollectionPublishSchedule v-if="globalStore.user?.role === 'admin' && form.draft && !form.collectionId" id="create-public-collection" class="mt-3"
              v-model:enabled="form.publishLater" v-model:at="form.publishAt" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:modelValue', false)" :disabled="isPending">
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
