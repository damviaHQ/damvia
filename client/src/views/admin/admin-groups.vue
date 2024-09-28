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
} from "@/components/ui/alert-dialog"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
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
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, Flag, PencilLine, Trash2 } from "lucide-vue-next"
import { ref } from "vue"

const toast = useGlobalToast()
const form = ref<{ id?: string; name: string }>({ name: "" })
const modalState = ref<"editing" | "creating" | "closed">("closed")
const queryClient = useQueryClient()
const showMoveUsersDialog = ref(false)
const groupToRemove = ref<string | null>(null)
const targetGroupId = ref<string | null>(null)
const { status, data, error } = useQuery({
  queryKey: ["groups"],
  queryFn: () => trpc.group.list.query(),
})

function openCreateModal() {
  form.value = { name: "" }
  modalState.value = "creating"
}

function openEditModal(group: RouterOutput["group"]["list"][number]) {
  form.value = { id: group.id, name: group.name }
  modalState.value = "editing"
}

async function onModalSubmit(event: Event) {
  event.preventDefault()
  const action = modalState.value === "creating" ? trpc.group.create : trpc.group.update
  action
    .mutate(form.value as any)
    .then(() => queryClient.invalidateQueries({ queryKey: ["groups"] }))
    .then(() => {
      toast.success(
        modalState.value === "creating" ? "Group created!" : "Group updated!"
      )
      modalState.value = "closed"
    })
    .catch((error) => toast.error((error as Error).message))
}

async function setDefault(groupId: string) {
  await trpc.group.setDefault.mutate(groupId)
  await queryClient.invalidateQueries({ queryKey: ["groups"] })
  toast.success("Group set as default!")
}

async function remove(id: string) {
  try {
    await trpc.group.remove.mutate(id)
    await queryClient.invalidateQueries({ queryKey: ["groups"] })
    toast.success("Group removed!")
  } catch (error) {
    if (
      (error as Error).message ===
      "Group has users or is default for regions. Please move them first."
    ) {
      groupToRemove.value = id
      showMoveUsersDialog.value = true
    } else {
      toast.error((error as Error).message)
    }
  }
}

async function moveUsersAndRemoveGroup() {
  if (!groupToRemove.value || !targetGroupId.value) return

  try {
    await trpc.group.moveUsersAndRegions.mutate({
      fromGroupId: groupToRemove.value,
      toGroupId: targetGroupId.value,
    })
    await remove(groupToRemove.value)
    showMoveUsersDialog.value = false
    groupToRemove.value = null
    targetGroupId.value = null
  } catch (error) {
    toast.error((error as Error).message)
  }
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
            <BreadcrumbPage>Groups</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button type="button" variant="link" @click="openCreateModal"
        class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
        <CirclePlus class="w-4 h-4" />
        Add new Group
      </Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="group in data" :key="group.id">
          <TableCell>
            {{ group.name }}
            <span v-if="group.isDefault" class="ml-2 text-sm text-green-600">(Default)</span>
          </TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" @click="openEditModal(group)">
                <PencilLine class="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" @click="remove(group.id)" :disabled="group.isDefault">
                <Trash2 class="w-4 h-4 mr-2" />
                Remove
              </Button>
              <Button v-if="!group.isDefault" variant="ghost" size="sm" @click="setDefault(group.id)">
                <Flag class="w-4 h-4 mr-2" />
                Set as Default
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>

  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && (modalState = 'closed')">
    <DialogContent class="sm:max-w-[425px]">
      <form @submit.prevent="onModalSubmit">
        <DialogHeader>
          <DialogTitle>{{ modalState === "creating" ? "Create" : "Edit" }} page</DialogTitle>
          <DialogDescription>
            Enter the name for your page and click
            {{ modalState === "creating" ? "Create" : "Edit" }}.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <div class="flex flex-col gap-2">
            <Label for="name">Name *</Label>
            <Input id="name" v-model="form.name" placeholder="Page name" />
          </div>
        </div>
        <DialogFooter class="sm:justify-between items-center">
          <div class="text-sm text-gray-500">* Required</div>
          <Button type="submit" :disabled="!form.name">
            {{ modalState === "creating" ? "Create" : "Edit" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog :open="showMoveUsersDialog" @update:open="showMoveUsersDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Move Users and Regions</AlertDialogTitle>
        <AlertDialogDescription>
          This group has users or is set as default for regions. Please select a group to
          move them to before removing this group.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Select v-model="targetGroupId">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="Select Group" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="group in data" :key="group.id" :value="group.id" :disabled="group.id === groupToRemove">
            {{ group.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <AlertDialogFooter>
        <AlertDialogCancel @click="showMoveUsersDialog = false">Cancel</AlertDialogCancel>
        <AlertDialogAction @click="moveUsersAndRemoveGroup" :disabled="!targetGroupId">
          Move and Remove Group
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
