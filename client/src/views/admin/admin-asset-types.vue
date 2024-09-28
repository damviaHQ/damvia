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
import DisplaySelector from "@/components/DisplaySelector.vue"
import Loader from "@/components/Loader.vue"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, GripVertical, InfoIcon, PencilLine, Trash2 } from "lucide-vue-next"
import { computed, ref } from "vue"
import Draggable from "vuedraggable"

const toast = useGlobalToast()
const form = ref<{
  id?: string
  name: string
  description: string | null
  isRelatedToProducts: boolean
  includeInSearchByDefault: boolean
  defaultDisplay: "grid" | "list"
  listDisplayItems: string[]
}>({
  name: "",
  description: null,
  isRelatedToProducts: false,
  includeInSearchByDefault: false,
  defaultDisplay: "grid",
  listDisplayItems: [],
})
const modalState = ref<"creating" | "editing" | "closed">("closed")
const queryClient = useQueryClient()
const { status, data, error } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})
const { data: productAttributes } = useQuery({
  queryKey: ["products", "attributes"],
  queryFn: () => trpc.productAttribute.list.query(),
})

const listItems = computed(() => [
  { name: "Size", value: "size" },
  { name: "License", value: "license" },
  { name: "Format", value: "format" },
  { name: "Dimensions", value: "dimensions" },
  { name: "Updated at", value: "updated_at" },
  ...(productAttributes.value ?? [])
    .filter((attr) => attr.viewable)
    .map((item) => ({
      name: item.displayName || item.name,
      value: `product_attribute.${item.id}`,
    })),
])
const allListItems = computed(() =>
  listItems.value.map((item) => ({
    ...item,
    isSelected: form.value.listDisplayItems.includes(item.value),
  }))
)

function openCreateModal() {
  form.value = {
    name: "",
    description: "",
    isRelatedToProducts: false,
    includeInSearchByDefault: false,
    defaultDisplay: "grid",
    listDisplayItems: [],
  }
  modalState.value = "creating"
}

function openEditModal(assetType: RouterOutput["assetType"]["list"][number]) {
  form.value = {
    id: assetType.id,
    name: assetType.name,
    description: assetType.description,
    isRelatedToProducts: assetType.isRelatedToProducts,
    includeInSearchByDefault: assetType.includeInSearchByDefault,
    defaultDisplay: assetType.defaultDisplay,
    listDisplayItems: [...assetType.listDisplayItems],
  }
  modalState.value = "editing"
}

async function onModalSubmit(event: Event) {
  event.preventDefault()

  const action =
    modalState.value === "creating" ? trpc.assetType.create : trpc.assetType.update
  try {
    const payload = {
      name: form.value.name,
      defaultDisplay: form.value.defaultDisplay,
      listDisplayItems: form.value.listDisplayItems,
      ...(form.value.id && { id: form.value.id }),
      ...(form.value.description !== null && { description: form.value.description }),
      ...(form.value.isRelatedToProducts !== undefined && {
        isRelatedToProducts: form.value.isRelatedToProducts,
      }),
      ...(form.value.includeInSearchByDefault !== undefined && {
        includeInSearchByDefault: form.value.includeInSearchByDefault,
      }),
    }

    await action.mutate(payload)
    await queryClient.invalidateQueries({ queryKey: ["asset-types"] })
    await queryClient.refetchQueries({ queryKey: ["asset-types"] })
    toast.success(modalState.value === "creating" ? "Type created!" : "Type updated!")
    modalState.value = "closed"
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function remove(id: string) {
  try {
    await trpc.assetType.remove.mutate(id)
    await queryClient.invalidateQueries({ queryKey: ["asset-types"] })
    toast.success("Type removed!")
  } catch (error) {
    toast.error((error as Error).message)
  }
}


function toggleAttribute(value: string, event: Event) {
  event.preventDefault()
  event.stopPropagation()

  if (form.value.listDisplayItems.includes(value)) {
    form.value.listDisplayItems = form.value.listDisplayItems.filter(
      (item) => item !== value
    )
  } else {
    form.value.listDisplayItems.push(value)
  }
}

function updateDefaultDisplay(value: "grid" | "list") {
  form.value.defaultDisplay = value
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="flex flex-col p-8">
    <div class="pages__top flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage> Asset Types </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button type="button" variant="link" @click="openCreateModal"
        class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
        <CirclePlus class="w-4 h-4" />
        Add new Asset Type
      </Button>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Related products</TableHead>
          <TableHead>Include in search by default</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="assetType in data" :key="assetType.id">
          <TableCell>{{ assetType.name }}</TableCell>
          <TableCell>{{ assetType.description }}</TableCell>
          <TableCell>{{ assetType.isRelatedToProducts ? "Yes" : "No" }}</TableCell>
          <TableCell>{{ assetType.includeInSearchByDefault ? "Yes" : "No" }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" @click="openEditModal(assetType)">
                <PencilLine class="w-4 h-4 mr-2" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger>
                  <Button variant="ghost" size="sm">
                    <Trash2 class="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to remove this asset type?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction @click="remove(assetType.id)">Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && (modalState = 'closed')">
    <DialogContent class="sm:max-w-[800px] h-[90vh] flex flex-col">
      <form @submit.prevent="onModalSubmit" class="flex flex-col h-full">
        <DialogHeader>
          <DialogTitle class="text-xl mb-4">{{ modalState === "creating" ? "Create" : "Edit" }} Asset Type</DialogTitle>
        </DialogHeader>
        <div class="flex gap-10 py-4 flex-grow overflow-hidden">
          <div class="flex-1 flex flex-col gap-5 overflow-y-auto pr-4">
            <div class="flex flex-col gap-2">
              <Label for="name">Name *</Label>
              <Input id="name" v-model="form.name" placeholder="Name" />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="description">Description</Label>
              <Input id="description" v-model="form.description" placeholder="Description" />
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="isRelatedToProducts" v-model:checked="form.isRelatedToProducts" />
              <Label for="isRelatedToProducts">Related to products</Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="includeInSearchByDefault" v-model:checked="form.includeInSearchByDefault" />
              <Label for="includeInSearchByDefault">Search by default</Label>
            </div>
            <div class="flex flex-col gap-2">
              <Label for="defaultDisplay">Default Display</Label>
              <DisplaySelector v-model="form.defaultDisplay" @update:model-value="updateDefaultDisplay" />
            </div>
            <Alert class="my-8">
              <InfoIcon class="h-4 w-4" />
              <AlertTitle>Asset Types</AlertTitle>
              <AlertDescription>
                Asset types help categorize your digital assets in the collections. They
                allow you to define if those asset are Marketing purpose, or are Product
                views for example. You can also define the default display settings, and
                search preferences for different types of files, and add attributes from
                the PIM to link them to your products.
              </AlertDescription>
            </Alert>
          </div>
          <div class="flex-1 flex flex-col gap-4 overflow-hidden">
            <div class="flex flex-col gap-2 h-full overflow-hidden">
              <Label>PIM attributes displayed in List view</Label>
              <p class="text-sm text-neutral-500">
                Add attributes, drag and drop to reorder or click the trash icon to
                remove.
              </p>
              <div class="flex-grow overflow-y-auto pr-4">
                <Draggable v-model="form.listDisplayItems" item-key="value" class="space-y-2">
                  <template #item="{ element }">
                    <div
                      class="flex items-center justify-between p-1 border border-neutral-300 hover:border-neutral-800 cursor-grab">
                      <div class="flex items-center gap-2">
                        <GripVertical class="h-4 w-4 text-neutral-400" />
                        {{
                          listItems.find((item) => item.value === element)?.name ??
                          element
                        }}
                      </div>
                      <Button type="button" variant="ghost" size="sm"
                        @click="(event) => toggleAttribute(element, event)"
                        class="hover:text-neutral-200 hover:bg-neutral-200">
                        <Trash2 class="h-4 w-4 text-neutral-500 hover:text-neutral-800" />
                      </Button>
                    </div>
                  </template>
                </Draggable>
                <div class="mt-4 space-y-2">
                  <div v-for="item in allListItems.filter((item) => !item.isSelected)" :key="item.value"
                    class="flex items-center justify-between p-1 bg-neutral-100">
                    <span>{{ item.name }}</span>
                    <Button type="button" variant="ghost" size="sm"
                      @click="(event) => toggleAttribute(item.value, event)"
                      class="hover:text-green-600 hover:bg-green-50">
                      <CirclePlus class="h-4 w-4 hover:text-green-600" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter class="sm:justify-between items-center">
          <div class="text-sm text-gray-500">* Required</div>
          <Button type="submit" :disabled="form.name === ''">
            {{ modalState === "creating" ? "Create" : "Save" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
