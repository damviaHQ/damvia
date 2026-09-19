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
import FieldDescription from "@/components/ui/field/FieldDescription.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogFooter, DialogHeader, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import { ImageMinus, ImageUp, Trash } from "lucide-vue-next"
import { ref, toRefs, watch } from "vue"
import { useRouter } from "vue-router"
import SelectGroupInput from "@/components/SelectGroupInput.vue";

const props = defineProps<{
  collection: RouterOutput["collection"]["findById"] | RouterOutput["collection"]["treeAdmin"][number];
  modelValue: boolean;
}>()
const emit = defineEmits<{
  (e: "update:modelValue", isOpen: boolean): void;
  (e: "updated", collection: RouterOutput["collection"]["update"]): void;
}>()
const { collection, modelValue } = toRefs(props)
const toast = useGlobalToast()
const router = useRouter()
const queryClient = useQueryClient()
const upload = ref<HTMLInputElement | null>(null)
const form = ref<{
  name?: string;
  description?: string;
  draft?: boolean;
  thumbnailFile?: File;
  thumbnailURL?: string | null;
  limitedToGroupIds?: string[];
}>({})
function updateForm() {
  form.value = {
    name: collection.value.name,
    description: collection.value.description,
    draft: collection.value.draft,
    thumbnailURL: collection.value.thumbnailURL,
    limitedToGroupIds: collection.value.limitedToGroupIds,
  }
}

watch(collection, () => {
  updateForm()
}, { immediate: true })

watch(modelValue, (newValue) => {
  if (newValue) {
    updateForm()
  }
})

function handleFileUploaded(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    form.value.thumbnailFile = target.files[0]
    form.value.thumbnailURL = URL.createObjectURL(target.files[0])
  }
}

async function deleteCollection() {
  await trpc.collection.remove.mutate(props.collection.id)
  emit("update:modelValue", false)
  queryClient.invalidateQueries({ queryKey: ["collection", "tree"] })
  queryClient.invalidateQueries({ queryKey: ["collection", "ListPrivateCollections"] })
  queryClient.invalidateQueries({ queryKey: ["menu-items"] })
  if (props.collection.parentId) {
    const currentRoute = router.currentRoute.value
    if (currentRoute.name === 'collection' && currentRoute.params.id === props.collection.id) {
      router.push({ name: "collection", params: { id: props.collection.parentId } }
      )
    }
  } else {
    router.push({ name: "home" })
  }
}

async function onSubmit() {
  try {
    if (form.value.thumbnailURL && form.value.thumbnailFile) {
      const uploadUrl = await trpc.collection.presignedThumbnailUploadUrl.query({
        id: props.collection.id,
      })

      await fetch(uploadUrl, {
        method: "PUT",
        body: form.value.thumbnailFile,
        headers: {
          "Content-Type": form.value.thumbnailFile.type,
        },
      })
    }

    const updateData: any = {
      name: props.collection.name,
      id: props.collection.id,
      description: form.value.description,
      draft: form.value.draft,
      hasThumbnail: !!form.value.thumbnailURL,
      limitedToGroupIds: form.value.limitedToGroupIds,
    }

    if (!props.collection.synchronized) {
      updateData.name = form.value.name
    }
    const collection = await trpc.collection.update.mutate(updateData)

    queryClient.invalidateQueries({ queryKey: ["collection"] })
    queryClient.invalidateQueries({ queryKey: ["menu-items"] })
    emit("update:modelValue", false)
    emit("updated", collection)
    toast.success("Collection updated")
  } catch (error) {
    console.error("Error updating collection:", error)
    toast.error((error as Error).message)
  }
}

async function setupCustomLayout() {
  if (!props.collection.page) {
    await trpc.page.createForCollection.mutate({
      collectionId: props.collection.id,
    })
    queryClient.invalidateQueries({ queryKey: ["collection"] })

    emit("updated", { ...props.collection, page: { id: "temp" } } as any)
    toast.success("Page created, you can now edit your collection layout")
  }
}

async function clearCustomLayout() {
  if (props.collection.page) {
    await trpc.page.remove.mutate({
      pageId: props.collection.page.id,
    })
    queryClient.invalidateQueries({ queryKey: ["collection"] })
    emit("updated", { ...props.collection, page: null } as any)
    toast.success("Page removed, collection is back to default layout")
  }
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[640px] collection-edit-dialog gap-6">
      <DialogHeader>
        <DialogTitle>Edit collection</DialogTitle>
        <DialogDescription>Manage collection details, visibility and appearance.</DialogDescription>
      </DialogHeader>

      <section class="grid gap-4" aria-labelledby="collection-details-heading">
        <h3 id="collection-details-heading" class="text-sm font-semibold">Details</h3>
        <FieldGroup v-if="!collection.synchronized" >
          <Label for="collection-name">Name</Label>
          <Input id="collection-name" v-model="form.name" placeholder="Collection name" />
        </FieldGroup>
        <FieldGroup>
          <Label for="collection-description">Description</Label>
          <Input id="collection-description" v-model="form.description" placeholder="Describe this collection" aria-describedby="collection-description-help" />
          <FieldDescription id="collection-description-help">Shown in list view.</FieldDescription>
        </FieldGroup>
      </section>

      <section class="grid gap-4" aria-labelledby="collection-visibility-heading">
        <h3 id="collection-visibility-heading" class="text-sm font-semibold">Visibility</h3>
        <div class="flex items-start gap-3">
          <Checkbox id="collection-draft" v-model="form.draft" class="mt-0.5" aria-describedby="collection-draft-help" />
          <div class="grid gap-1">
            <Label for="collection-draft">Hide collection</Label>
            <FieldDescription id="collection-draft-help">Hide this collection and its assets from users.</FieldDescription>
          </div>
        </div>
        <FieldGroup v-if="collection.canEditLimitedToGroupIds" >
          <Label for="limitedToGroupIds">Limit access to groups</Label>
          <SelectGroupInput v-model="form.limitedToGroupIds" id="limitedToGroupIds" placeholder="Select groups..." />
        </FieldGroup>
      </section>

      <section class="grid gap-4" aria-labelledby="collection-appearance-heading">
        <h3 id="collection-appearance-heading" class="text-sm font-semibold">Appearance</h3>
        <FieldGroup>
          <Label>Thumbnail</Label>
          <div class="flex items-center gap-4">
            <div class="flex h-[90px] w-[120px] shrink-0 items-center justify-center overflow-hidden bg-neutral-100">
              <img v-if="form.thumbnailURL" :src="form.thumbnailURL" alt="Collection thumbnail" class="size-full object-cover" />
              <span v-else class="text-xs text-neutral-500">No image</span>
            </div>
            <div class="grid justify-items-start gap-2">
              <input ref="upload" type="file" accept="image/*" class="hidden" aria-label="Collection thumbnail" @change="handleFileUploaded" />
              <Button type="button" variant="outline" size="sm" @click="upload?.click()"><ImageUp class="size-5" />Upload image</Button>
              <Button v-if="form.thumbnailURL" type="button" variant="ghost" size="sm" @click="form.thumbnailURL = null"><ImageMinus class="size-5" />Remove image</Button>
            </div>
          </div>
        </FieldGroup>
        <FieldGroup class="justify-items-start">
          <Label>Layout</Label>
          <FieldDescription>Use a custom layout to arrange images and text.</FieldDescription>
          <Button v-if="collection.page" type="button" variant="outline" size="sm" @click="clearCustomLayout">Use default layout</Button>
          <Button v-else type="button" variant="outline" size="sm" @click="setupCustomLayout">Use custom layout</Button>
        </FieldGroup>
      </section>

      <DialogFooter>
        <Button v-if="!collection.parent?.synchronized" type="button" variant="ghost" class="mr-auto text-destructive hover:text-destructive" @click="deleteCollection"><Trash class="size-5" />Delete collection</Button>
        <Button type="button" variant="outline" @click="emit('update:modelValue', false)">Cancel</Button>
        <Button type="button" @click="onSubmit">Save changes</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
