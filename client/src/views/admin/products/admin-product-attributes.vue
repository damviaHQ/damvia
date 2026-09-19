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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, FileUp, PencilLine, Trash2 } from "lucide-vue-next"
import { ref, watchEffect } from "vue"
import { RouterOutput, trpc } from "../../../services/server.ts"

type ProductAttribute = RouterOutput["productAttribute"]["list"][number]

const toast = useGlobalToast()
const queryClient = useQueryClient()
const { data: productAttributeNames } = useQuery({
  queryKey: ["products", "available-attributes"],
  queryFn: () => trpc.productAttribute.listAvailable.query(),
})
const { data: productAttributes } = useQuery({
  queryKey: ["products", "attributes"],
  queryFn: () => trpc.productAttribute.list.query(),
})
const form = ref<{
  id?: string
  name: string | null
  displayName: string | null
  facetable: boolean
  viewable: boolean
  searchable: boolean
}>({
  name: null,
  displayName: null,
  facetable: false,
  viewable: false,
  searchable: false,
})
const modalState = ref<"creating" | "editing" | "closed">("closed")
const nameError = ref("")

function openCreateModal() {
  form.value = {
    name: "",
    displayName: "",
    facetable: false,
    viewable: false,
    searchable: false,
  }
  nameError.value = ""
  modalState.value = "creating"
}

function openEditModal(productAttribute: ProductAttribute) {
  form.value = {
    id: productAttribute.id,
    name: productAttribute.name,
    displayName: productAttribute.displayName,
    facetable: productAttribute.facetable,
    viewable: productAttribute.viewable,
    searchable: productAttribute.searchable,
  }
  nameError.value = ""
  modalState.value = "editing"
}

watchEffect(() => {
  if (form.value.facetable) {
    form.value.viewable = true
  }
})

async function remove(productAttribute: ProductAttribute) {
  await trpc.productAttribute.remove.mutate(productAttribute.id)
  await queryClient.invalidateQueries({ queryKey: ["products", "attributes"] })
  toast.success("Record attribute removed!")
}

function submitChanges(event: Event) {
  event.preventDefault()

  if (!form.value.name) {
    nameError.value = "Please enter a name"
    toast.error(nameError.value)
    return
  }
  nameError.value = ""

  const action: any =
    modalState.value === "creating"
      ? trpc.productAttribute.create
      : trpc.productAttribute.update
  return action
    .mutate(form.value)
    .then(() => queryClient.invalidateQueries({ queryKey: ["products", "attributes"] }))
    .then(() => {
      toast.success(
        modalState.value === "creating"
          ? "Record attribute created!"
          : "Record attribute updated!"
      )
      modalState.value = "closed"
    })
    .catch((error: Error) => toast.error(error.message))
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
  <div class="admin-page admin-resource-page">
    <div class="admin-heading">
      <div><h1>Record attributes</h1><p>Choose which record fields appear in lists, filters and search.</p></div>
      <Button variant="default" @click="openCreateModal" class="dv-button dv-button--primary">
        <CirclePlus class="w-4 h-4" />
        Add attribute
      </Button>
    </div>
    <div v-if="productAttributes && !productAttributes.length" class="admin-text-secondary flex items-center gap-2">
      You must first <router-link :to="{ name: 'admin-product-import' }" class="underline flex items-center gap-2">
        <FileUp class="w-4 h-4" />import products data
      </router-link> to use attributes.
    </div>
    <AdminList v-else :items="productAttributes" :fields="['name', 'displayName']" label="Record attributes" v-slot="{ items }">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Attribute Key</TableHead>
          <TableHead>Display Name</TableHead>
          <TableHead>Filter in Search</TableHead>
          <TableHead>Visible in Record List</TableHead>
          <TableHead>Searchable</TableHead>
          <TableHead><span class="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="attribute in items" :key="attribute.id">
          <TableCell>{{ attribute.name }}</TableCell>
          <TableCell>{{ attribute.displayName }}</TableCell>
          <TableCell>{{ attribute.facetable ? "Yes" : "No" }}</TableCell>
          <TableCell>{{ attribute.viewable ? "Yes" : "No" }}</TableCell>
          <TableCell>{{ attribute.searchable ? "Yes" : "No" }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" @click="openEditModal(attribute)">
                <PencilLine class="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" @click="remove(attribute)">
                <Trash2 class="w-4 h-4 mr-2" />
                Remove
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    </AdminList>

    <Dialog :open="modalState !== 'closed'" @update:open="open => { if (!open && !saving) modalState = 'closed' }">
      <DialogContent class="admin-dialog--compact">
        <DialogHeader>
          <DialogTitle>
            {{ modalState === "creating" ? "Add" : "Edit" }} record attribute
          </DialogTitle>
          <DialogDescription>
            Attributes are characteristics of your records. Define an attribute to let
            users search or filter for records by this characteristic, or to display in
            Record List View.
          </DialogDescription>
        </DialogHeader>
        <form :aria-busy="saving" @submit="onModalSubmit">
          <div class="flex flex-col gap-6 py-4">
            <FieldGroup >
              <Label for="name">Select an Attribute *</Label>
              <Select v-model="form.name!" :disabled="modalState === 'editing'" class="w-full" @update:model-value="nameError = ''">
                <SelectTrigger id="name" class="w-full" :aria-invalid="!!nameError || undefined"
                  :aria-describedby="nameError ? 'name-error' : undefined">
                  <SelectValue placeholder="Available Attributes..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="name in productAttributeNames" :key="name" :value="name"
                    :disabled="!!productAttributes?.find((attr) => attr.name === name)">
                    {{ name }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p v-if="nameError" id="name-error" class="admin-form-error" role="alert">{{ nameError }}</p>
            </FieldGroup>
            <FieldGroup >
              <Label for="displayName">Change Display Name</Label>
              <Input id="displayName" v-model="form.displayName!" placeholder="Keep empty for default value"
                class="w-full" />
            </FieldGroup>
            <div class="flex items-center space-x-2">
              <Checkbox id="facetable" v-model="form.facetable" />
              <Label for="facetable">Add filter in search</Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="viewable" v-model="form.viewable" :disabled="form.facetable" />
              <Label for="viewable">Visible in Record List</Label>
            </div>
            <div class="flex items-center space-x-2">
              <Checkbox id="searchable" v-model="form.searchable" />
              <Label for="searchable">Searchable</Label>
            </div>
          </div>
          <DialogFooter class="items-center">
            <DialogClose as-child><Button type="button" variant="outline" :disabled="saving">Cancel</Button></DialogClose>
            <Button type="submit" :disabled="saving || (!form.name)">
              {{ modalState === "creating" ? "Create" : "Save changes" }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
