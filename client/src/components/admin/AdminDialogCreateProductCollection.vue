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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
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
import { useRecordLabel } from "@/composables/useRecordLabel"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import Treeselect from "vue3-treeselect-ts"

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: "update:modelValue", isOpen: boolean): void }>()
const toast = useGlobalToast()
const router = useRouter()
const queryClient = useQueryClient()
const { lowerPlural } = useRecordLabel()

const form = ref<{ name?: string; collectionId?: string; draft?: boolean }>({})
const { data: collections } = useQuery({
  queryKey: ["collection", "tree"],
  queryFn: () => trpc.collection.tree.query(),
})

watch(() => props.modelValue, () => { form.value = {} })

const collectionOptions = computed(() => {
  if (!collections.value) return []

  function formatCollectionArray(collections: RouterOutput["collection"]["tree"]): any {
    const options = collections.map((c: RouterOutput["collection"]["tree"][number]) => ({
      id: c.id,
      label: c.name,
      children: c.children ? formatCollectionArray(c.children) : undefined,
    }))
    return options.length ? options : undefined
  }
  return formatCollectionArray(collections.value) ?? []
})

async function onSubmit() {
  try {
    const collection = await trpc.collection.create.mutate({
      name: form.value.name!,
      parentId: form.value.collectionId,
      public: true,
      draft: form.value.collectionId ? undefined : form.value.draft ?? false,
      catalogueMode: "products",
    })

    queryClient.invalidateQueries({ queryKey: ['collection'] })
    emit("update:modelValue", false)
    router.push({ name: "admin-collection-products", params: { id: collection.id } })
  } catch (error) {
    toast.error((error as Error).message)
  }
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="admin-dialog--compact">
      <form @submit.prevent="onSubmit">
        <DialogHeader>
          <DialogTitle>New {{ lowerPlural }} collection</DialogTitle>
          <DialogDescription>
            Share {{ lowerPlural }} and their linked pictures in one place. Add references or automatic rules after creating it.
            Readers with access can view and download the pictures, subject to licence dates and regional restrictions.
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-6 py-4">
          <FieldGroup>
            <Label for="name">Name *</Label>
            <Input id="name" type="text" v-model="form.name" placeholder="Name" class="form-input mb-075" />
          </FieldGroup>
          <FieldGroup v-if="collectionOptions?.length" role="group" aria-labelledby="collectionId">
            <Label id="collectionId">Parent collection (optional)</Label>
            <treeselect v-model="form.collectionId" class="mb-075" placeholder="Top level (no parent)"
              :options="collectionOptions" :clearable="true" />
            <p class="admin-form-note">Leave empty for an independent collection. Choosing a parent places it inside that collection and inherits its visibility and access rules. To organize only its menu link, use Menu.</p>
          </FieldGroup>
          <div>
            <div class="flex items-center gap-2">
              <Checkbox v-model="form.draft" id="draft" />
              <Label for="draft">Draft</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:modelValue', false)">
            Cancel
          </Button>
          <Button type="submit" :disabled="!form.name">Create and build it</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
