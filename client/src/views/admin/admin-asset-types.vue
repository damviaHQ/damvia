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
import { DialogClose } from "@/components/ui/dialog"
import AdminList from "@/components/admin/AdminList.vue"
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
import { ArrowDown, ArrowUp, CirclePlus, GripVertical, InfoIcon, PencilLine, Trash2 } from "lucide-vue-next"
import { computed, nextTick, ref } from "vue"
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

async function submitChanges(event: Event) {
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

const listAnnouncement = ref("")
async function moveListItem(index: number, delta: number) {
  const items = [...form.value.listDisplayItems]
  const [value] = items.splice(index, 1)
  items.splice(index + delta, 0, value)
  form.value.listDisplayItems = items
  listAnnouncement.value = `${listItems.value.find((item) => item.value === value)?.name ?? value} moved to position ${index + delta + 1} of ${items.length}`
  await nextTick()
  const row = document.querySelector(`[data-list-column="${CSS.escape(value)}"]`)
  const button = row?.querySelector<HTMLButtonElement>(`[data-move="${delta < 0 ? "up" : "down"}"]:not(:disabled)`)
    ?? row?.querySelector<HTMLButtonElement>("[data-move]:not(:disabled)")
  button?.focus()
}

function updateDefaultDisplay(value: "grid" | "list") {
  form.value.defaultDisplay = value
}
const saving = ref(false)
async function onModalSubmit(event: Event) {
  event.preventDefault()
  if (saving.value) return
  saving.value = true
  try { await submitChanges(event) } finally { saving.value = false }
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="admin-error" role="alert">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="admin-page admin-resource-page">
    <div class="admin-heading">
      <div><h1>Asset types</h1><p>Configure search defaults and file information for each asset type.</p></div>
      <Button type="button" variant="default" @click="openCreateModal"
        class="dv-button dv-button--primary">
        <CirclePlus class="w-4 h-4" />
        Add asset type
      </Button>
    </div>
    <AdminList :items="data" :fields="['name', 'description']" label="Asset types" v-slot="{ items }">
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
        <TableRow v-for="assetType in items" :key="assetType.id">
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
                <AlertDialogTrigger as-child>
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
    </AdminList>
  </div>
  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && !saving && (modalState = 'closed')">
    <DialogContent class="admin-dialog--wide flex flex-col">
      <form :aria-busy="saving" @submit.prevent="onModalSubmit" class="admin-form">
        <DialogHeader>
          <DialogTitle >{{ modalState === "creating" ? "Create" : "Edit" }} asset type</DialogTitle>
          <DialogDescription>Set search defaults, product linking and list columns.</DialogDescription>
        </DialogHeader>
        <div class="modal-editor-grid">
          <div class="flex flex-col gap-5 min-w-0">
            <FieldGroup >
              <Label for="name">Name *</Label>
              <Input id="name" v-model="form.name" placeholder="Name" />
            </FieldGroup>
            <FieldGroup >
              <Label for="description">Description</Label>
              <Input id="description" v-model="form.description" placeholder="Description" />
            </FieldGroup>
            <div class="flex items-center space-x-2">
              <Checkbox id="isRelatedToProducts" v-model="form.isRelatedToProducts" />
              <Label for="isRelatedToProducts">Related to products</Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="includeInSearchByDefault" v-model="form.includeInSearchByDefault" />
              <Label for="includeInSearchByDefault">Search by default</Label>
            </div>
            <div class="flex flex-col gap-2">
              <Label id="defaultDisplay">Default Display</Label>
              <DisplaySelector aria-labelledby="defaultDisplay" v-model="form.defaultDisplay" @update:model-value="updateDefaultDisplay" />
            </div>

          </div>
          <div class="flex flex-col gap-4 min-w-0">
            <div class="flex flex-col gap-2">
              <Label>List columns</Label>
              <p class="text-sm admin-text-secondary">
                Add attributes, drag and drop or use the arrow buttons to reorder, or click the trash icon to
                remove.
              </p>
              <div class="modal-attribute-list">
                <Draggable v-model="form.listDisplayItems" item-key="value" class="space-y-2">
                  <template #item="{ element, index }">
                    <div :data-list-column="element"
                      class="flex items-center justify-between p-1 border border-neutral-300 hover:border-neutral-800 cursor-grab">
                      <div class="flex items-center gap-2">
                        <GripVertical class="h-4 w-4 admin-text-secondary" aria-hidden="true" />
                        {{
                          listItems.find((item) => item.value === element)?.name ??
                          element
                        }}
                      </div>
                      <div class="flex items-center">
                      <Button type="button" variant="ghost" size="sm" data-move="up" :disabled="index === 0"
                        @click="moveListItem(index, -1)"
                        :aria-label="`Move ${listItems.find(item => item.value === element)?.name ?? element} up`">
                        <ArrowUp class="h-4 w-4 admin-text-secondary" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" data-move="down" :disabled="index === form.listDisplayItems.length - 1"
                        @click="moveListItem(index, 1)"
                        :aria-label="`Move ${listItems.find(item => item.value === element)?.name ?? element} down`">
                        <ArrowDown class="h-4 w-4 admin-text-secondary" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm"
                        @click="(event) => toggleAttribute(element, event)"
                        :aria-label="`Remove ${listItems.find(item => item.value === element)?.name ?? element}`">
                        <Trash2 class="h-4 w-4 admin-text-secondary admin-text-primary-hover" />
                      </Button>
                      </div>
                    </div>
                  </template>
                </Draggable>
                <p role="status" class="sr-only">{{ listAnnouncement }}</p>
                <div class="mt-4 space-y-2">
                  <div v-for="item in allListItems.filter((item) => !item.isSelected)" :key="item.value"
                    class="flex items-center justify-between p-1 bg-neutral-100">
                    <span>{{ item.name }}</span>
                    <Button type="button" variant="ghost" size="sm"
                      @click="(event) => toggleAttribute(item.value, event)"
                      :aria-label="`Add ${item.name}`">
                      <CirclePlus class="h-4 w-4 hover:text-green-600" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter class="items-center">
          <DialogClose as-child><Button type="button" variant="outline" :disabled="saving">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="saving || (form.name === '')">
            {{ modalState === "creating" ? "Create" : "Save" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
