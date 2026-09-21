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
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { DialogClose } from "@/components/ui/dialog"
import AdminList from "@/components/admin/AdminList.vue"
import DisplaySelector from "@/components/DisplaySelector.vue"
import Loader from "@/components/Loader.vue"
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
import { useRecordLabel } from "@/composables/useRecordLabel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AdminFolderRules from "@/views/admin/admin-folder-rules.vue"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ArrowDown, ArrowUp, CirclePlus, GripVertical, PencilLine, Trash2 } from "@lucide/vue"
import { computed, nextTick, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import Draggable from "vuedraggable"

const toast = useGlobalToast()
const recordLabel = useRecordLabel()
const route = useRoute()
const router = useRouter()
const tab = ref(route.query.tab === "folder-rules" ? "folder-rules" : "types")
function onTab(value: string | number) {
  tab.value = String(value)
  router.replace({ query: { ...route.query, tab: value === "folder-rules" ? "folder-rules" : undefined } })
}
const form = ref<{
  id?: string
  name: string
  description: string
  isRelatedToRecords: boolean
  groupVariants: boolean
  includeInSearchByDefault: boolean
  defaultDisplay: "grid" | "list"
  listDisplayItems: string[]
}>({
  name: "",
  description: '',
  isRelatedToRecords: false,
  groupVariants: false,
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
const { data: metadataFields } = useQuery({
  queryKey: ["metadata-fields"],
  queryFn: () => trpc.metadataField.list.query(),
})
const { data: recordAttributes } = useQuery({
  queryKey: ["records", "attributes"],
  queryFn: () => trpc.recordAttribute.list.query(),
})

const listItems = computed(() => [
  { name: "Size", value: "size" },
  { name: "License", value: "license" },
  { name: "Format", value: "format" },
  { name: "Dimensions", value: "dimensions" },
  { name: "Updated at", value: "updated_at" },
  ...(recordAttributes.value ?? [])
    .filter((attr) => attr.viewable)
    .map((item) => ({
      name: item.displayName || item.name,
      value: `record_attribute.${item.id}`,
    })),
  ...(metadataFields.value ?? [])
    .filter((field) => field.viewable)
    .map((field) => ({
      name: `${field.displayName || field.name} (from the file)`,
      value: `metadata_field.${field.id}`,
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
    isRelatedToRecords: false,
    groupVariants: false,
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
    description: assetType.description ?? '',
    isRelatedToRecords: assetType.isRelatedToRecords,
    groupVariants: assetType.groupVariants,
    includeInSearchByDefault: assetType.includeInSearchByDefault,
    defaultDisplay: assetType.defaultDisplay,
    listDisplayItems: [...assetType.listDisplayItems],
  }
  modalState.value = "editing"
}

async function submitChanges(event: Event) {
  event.preventDefault()

  try {
    const payload = {
      name: form.value.name,
      defaultDisplay: form.value.defaultDisplay,
      listDisplayItems: form.value.listDisplayItems,
      ...(form.value.id && { id: form.value.id }),
      description: form.value.description,
      ...(form.value.isRelatedToRecords !== undefined && {
        isRelatedToRecords: form.value.isRelatedToRecords,
      }),
      groupVariants: form.value.groupVariants,
      ...(form.value.includeInSearchByDefault !== undefined && {
        includeInSearchByDefault: form.value.includeInSearchByDefault,
      }),
    }

    if (modalState.value === "creating") await trpc.assetType.create.mutate(payload)
    else await trpc.assetType.update.mutate({ ...payload, id: form.value.id ?? '' })
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
    <AdminPageHeader :description="`Say what kind of file each folder holds: packshot, event photo, banner. The next steps are set per type: how its files find their ${recordLabel.lower.value} and whether its variants are grouped.`">
      <template #lead><span class="admin-step">Setup · step 1 of 4</span></template>
    </AdminPageHeader>
    <Tabs :model-value="tab" @update:model-value="onTab">
      <TabsList>
        <TabsTrigger value="types">Types</TabsTrigger>
        <TabsTrigger value="folder-rules">Folder rules</TabsTrigger>
      </TabsList>
      <TabsContent value="folder-rules" class="mt-4">
        <AdminFolderRules />
      </TabsContent>
      <TabsContent value="types" class="mt-4">
    <AdminPageHeader :title="null" description="Search defaults, file information and list columns of each type. Type a folder in Assets, or many at once with folder rules.">
      <Button type="button" variant="default" @click="openCreateModal"
        class="dv-button dv-button--primary">
        <CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
        Add asset type
      </Button>
    </AdminPageHeader>
    <AdminList :items="data" :fields="['name', 'description']" label="Asset types" v-slot="{ items }">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Related to {{ recordLabel.lowerPlural.value }}</TableHead>
          <TableHead>Include in search by default</TableHead>
          <TableHead>Group variants</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="assetType in items" :key="assetType.id">
          <TableCell>{{ assetType.name }}</TableCell>
          <TableCell>{{ assetType.description }}</TableCell>
          <TableCell>{{ assetType.isRelatedToRecords ? "Yes" : "No" }}</TableCell>
          <TableCell>{{ assetType.includeInSearchByDefault ? "Yes" : "No" }}</TableCell>
          <TableCell>{{ assetType.groupVariants ? "Yes" : "No" }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" @click="openEditModal(assetType)">
                <PencilLine class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] mr-2" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button variant="ghost" size="sm">
                    <Trash2 class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] mr-2" />
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
      </TabsContent>
    </Tabs>
  </div>
  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && !saving && (modalState = 'closed')">
    <DialogContent class="admin-dialog--wide flex flex-col">
      <form :aria-busy="saving" @submit.prevent="onModalSubmit" class="admin-form">
        <DialogHeader>
          <DialogTitle >{{ modalState === "creating" ? "Create" : "Edit" }} asset type</DialogTitle>
          <DialogDescription>Set search defaults, {{ recordLabel.lower.value }} linking and list columns.</DialogDescription>
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
              <Checkbox id="isRelatedToRecords" v-model="form.isRelatedToRecords" />
              <Label for="isRelatedToRecords">Related to {{ recordLabel.lowerPlural.value }}</Label>
            </div>
            <p class="text-body admin-text-secondary -mt-3">Files of this type can be linked to a {{ recordLabel.lower.value }}. Matching rules are set on the Matching screen.</p>
            <div class="flex items-center space-x-2">
              <Checkbox id="groupVariants" v-model="form.groupVariants" />
              <Label for="groupVariants">Group variants</Label>
            </div>
            <p class="text-body admin-text-secondary -mt-3">Files of this type that share the same name and differ only by format, language or duration are shown as one card. Never enable it for packshots.</p>
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
              <p class="text-body admin-text-secondary">
                Add attributes, drag and drop or use the arrow buttons to reorder, or click the trash icon to
                remove.
              </p>
              <div class="modal-attribute-list">
                <Draggable v-model="form.listDisplayItems" item-key="value" class="space-y-2">
                  <template #item="{ element, index }">
                    <div :data-list-column="element"
                      class="flex items-center justify-between p-1 border border-neutral-300 hover:border-neutral-800 cursor-grab">
                      <div class="flex items-center gap-2">
                        <GripVertical class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)] admin-text-secondary" aria-hidden="true" />
                        {{
                          listItems.find((item) => item.value === element)?.name ??
                          element
                        }}
                      </div>
                      <div class="flex items-center">
                      <Button type="button" variant="ghost" size="sm" data-move="up" :disabled="index === 0"
                        @click="moveListItem(index, -1)"
                        :aria-label="`Move ${listItems.find(item => item.value === element)?.name ?? element} up`">
                        <ArrowUp class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)] admin-text-secondary" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" data-move="down" :disabled="index === form.listDisplayItems.length - 1"
                        @click="moveListItem(index, 1)"
                        :aria-label="`Move ${listItems.find(item => item.value === element)?.name ?? element} down`">
                        <ArrowDown class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)] admin-text-secondary" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm"
                        @click="(event: Event) => toggleAttribute(element, event)"
                        :aria-label="`Remove ${listItems.find(item => item.value === element)?.name ?? element}`">
                        <Trash2 class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)] admin-text-secondary admin-text-primary-hover" />
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
                      @click="(event: Event) => toggleAttribute(item.value, event)"
                      :aria-label="`Add ${item.name}`">
                      <CirclePlus class="h-[var(--dv-icon-compact)] w-[var(--dv-icon-compact)] hover:text-green-600" />
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
