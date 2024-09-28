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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import { EyeOff, ImageMinus, ImageUp, Trash } from "lucide-vue-next"
import { ref, toRefs, watch } from "vue"
import { useRouter } from "vue-router"

const props = defineProps<{
  collection: RouterOutput["collection"]["findById"] | RouterOutput["collection"]["treeAdmin"][number]
  modelValue: boolean
}>()
const emit = defineEmits<{
  (e: "update:modelValue", isOpen: boolean): void;
  (e: "updated", collection: RouterOutput["collection"]["update"]): void
}>()
const { collection, modelValue } = toRefs(props)
const toast = useGlobalToast()
const router = useRouter()
const queryClient = useQueryClient()
const form = ref<{
  name?: string
  description?: string
  draft?: boolean
  thumbnailFile?: File
  thumbnailURL?: string | null
}>({})
function updateForm() {
  form.value = {
    name: collection.value.name,
    description: collection.value.description,
    draft: collection.value.draft,
    thumbnailURL: collection.value.thumbnailURL,
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
    <DialogContent class="sm:max-w-[525px]">
      <DialogTitle>Edit collection</DialogTitle>
      <DialogDescription>
        You can customize the collection name, description, thumbnail and layout.
      </DialogDescription>
      <div v-if="!collection.synchronized">
        <Label for="name" class="text-sm font-medium">Name</Label>
        <Input id="name" v-model="form.name" placeholder="Name" />
      </div>
      <div>
        <Label for="description" class="text-sm font-medium">Description</Label>
        <Input id="description" v-model="form.description"
          placeholder="Describe your collection, this is visible in list view." />
      </div>
      <div class="flex items-center space-x-2">
        <Checkbox id="draft" v-model:checked="form.draft" />
        <Label for="draft" class="flex items-center text-sm font-medium">
          <EyeOff class="w-4 h-4 mr-2" />
          Hide <span class="text-sm ml-1 font-normal text-gray-500">(No one can see this collection and assets
            inside)</span>
        </Label>
      </div>
      <div class="flex flex-col space-y-4">
        <Label for="thumbnail" class="text-sm font-medium">Custom Thumbnail</Label>
        <div class="flex items-center space-x-4">
          <div class="w-[15rem] h-[11.5rem] rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
            <img v-if="form.thumbnailURL" :src="form.thumbnailURL" class="object-cover w-full h-full" />
            <span v-else class="text-gray-500 text-sm">No Image</span>
          </div>
          <div class="flex flex-col space-y-2">
            <div class="flex flex-col items-start gap-3">
              <input ref="upload" type="file" accept="image/*" style="display: none" @change="handleFileUploaded">
              <button type="button" @click="$refs.upload?.click()"
                class="flex items-center text-sm font-medium rounded-md px-2 py-1 text-gray-500 hover:text-gray-700">
                <ImageUp class="w-5 h-5 mr-2" />
                Upload Thumbnail
              </button>
              <button v-if="form.thumbnailURL" type="button" @click="form.thumbnailURL = null"
                class="flex items-center text-sm font-medium rounded-md px-2 py-1 text-gray-500 hover:text-gray-700">
                <ImageMinus class="w-5 h-5 mr-2" />
                Remove Thumbnail
              </button>
            </div>
          </div>
        </div>
        <input ref="upload" type="file" accept="image/*" class="hidden" @change="handleFileUploaded">
      </div>
      <div class="flex flex-col gap-2">
        <Label class="text-sm font-medium">Layout</Label>
        <p class="text-sm text-gray-500">
          You can setup custom layout for this collection and override the default layout. You can add Pictures, Text
          etc.
        </p>
        <div>
          <Button v-if="collection.page" @click="clearCustomLayout">
            Move back to default layout
          </Button>
          <Button v-else @click="setupCustomLayout" variant="outline"> Switch to custom layout </Button>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2 pt-10">
        <Button v-if="!collection.parent?.synchronized" variant="link" @click="deleteCollection"
          class="text-red-500 hover:text-red-500 hover:bg-red-100">
          <Trash class="w-4 h-4 mr-2" />
          Delete collection
        </Button>
        <div></div>
        <div class="flex items-center gap-2">
          <Button variant="link" @click="emit('update:modelValue', false)">Cancel</Button>
          <Button @click="onSubmit">Update</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
