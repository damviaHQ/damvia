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
  AlertDialogTrigger,
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
import { CirclePlus, PencilLine, Trash2 } from "lucide-vue-next"
import { ref } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const showMoveUsersDialog = ref(false)
const regionToRemove = ref<string | null>(null)
const targetRegionId = ref<string>('')
const modalState = ref<"editing" | "creating" | "closed">("closed")
const form = ref<{ id?: string; name: string; defaultGroupId: string }>({
  name: "",
  defaultGroupId: "",
})
const { status, data, error } = useQuery({
  queryKey: ["regions"],
  queryFn: () => trpc.region.list.query(),
})
const { data: groups } = useQuery({
  queryKey: ["groups"],
  queryFn: () => trpc.group.list.query(),
})

function openCreateModal() {
  form.value = { name: "", defaultGroupId: "" }
  modalState.value = "creating"
}

function openEditModal(region: RouterOutput["region"]["list"][number]) {
  form.value = {
    id: region.id,
    name: region.name,
    defaultGroupId: region.defaultGroupId,
  }
  modalState.value = "editing"
}

async function onModalSubmit(event: Event) {
  event.preventDefault()
  const action =
    modalState.value === "creating" ? trpc.region.create : trpc.region.update
  try {
    await action.mutate(form.value as any)
    await queryClient.invalidateQueries({ queryKey: ["regions"] })
    toast.success(
      modalState.value === "creating" ? "Region created!" : "Region updated!"
    )
    modalState.value = "closed"
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function remove(id: string) {
  try {
    const result = await trpc.region.remove.mutate(id)
    await queryClient.invalidateQueries({ queryKey: ["regions"] })

    if (result.updatedLicenses > 0) {
      toast.success(`Region removed and ${result.updatedLicenses} license(s) updated.`)
    } else {
      toast.success("Region removed successfully.")
    }
  } catch (error) {
    if ((error as Error).message === "Region has users. Please move them first.") {
      regionToRemove.value = id
      showMoveUsersDialog.value = true
    } else {
      toast.error((error as Error).message)
    }
  }
}

async function moveUsersAndRemoveRegion() {
  if (!regionToRemove.value || !targetRegionId.value) return

  try {
    await trpc.region.moveUsers.mutate({
      fromRegionId: regionToRemove.value,
      toRegionId: targetRegionId.value,
    })
    await remove(regionToRemove.value)
    await queryClient.invalidateQueries({ queryKey: ["users"] })
    showMoveUsersDialog.value = false
    regionToRemove.value = null
    targetRegionId.value = ''
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
    <div class="regions__top flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Regions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button type="button" variant="link" @click="openCreateModal"
        class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
        <CirclePlus class="w-4 h-4" />
        Add new Region
      </Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Default Group</TableHead>
          <TableHead>Licenses</TableHead>
          <TableHead>Users</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="region in data" :key="region.id">
          <TableCell>{{ region.name }}</TableCell>
          <TableCell>{{
            groups?.find((g) => g.id === region.defaultGroupId)?.name || "N/A"
            }}</TableCell>
          <TableCell>{{ region.licenseCount }}</TableCell>
          <TableCell>{{ region.userCount }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" @click="openEditModal(region)">
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
                    <AlertDialogTitle>Remove region</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. Are you sure you want to remove this
                      region?
                      <span v-if="region.licenseCount > 0 || region.userCount > 0">
                        This region is associated with
                      </span>
                      <span v-if="region.licenseCount > 0">
                        {{ region.licenseCount }} license(s)
                        <span v-if="region.userCount > 0">and </span>
                      </span>
                      <span v-if="region.userCount > 0">
                        {{ region.userCount }} user(s).
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction @click="remove(region.id)">
                      Remove
                    </AlertDialogAction>
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
    <DialogContent class="sm:max-w-[425px]">
      <form @submit.prevent="onModalSubmit">
        <DialogHeader>
          <DialogTitle>{{ modalState === "creating" ? "Create" : "Edit" }} region</DialogTitle>
          <DialogDescription>
            Enter the details for your region and click
            {{ modalState === "creating" ? "Create" : "Edit" }}.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <div class="flex flex-col gap-2">
            <Label for="name">Name *</Label>
            <Input id="name" v-model="form.name" placeholder="Region name" />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="defaultGroup">Default Group *</Label>
            <Select v-model="form.defaultGroupId">
              <SelectTrigger>
                <SelectValue placeholder="Select a default group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
                  {{ group.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter class="sm:justify-between items-center">
          <div class="text-sm text-gray-500">* Required</div>
          <Button type="submit" :disabled="!form.name || !form.defaultGroupId">
            {{ modalState === "creating" ? "Create" : "Edit" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  <AlertDialog :open="showMoveUsersDialog" @update:open="showMoveUsersDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Move Users</AlertDialogTitle>
        <AlertDialogDescription>
          Please move your users to another region before removing this region.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Select v-model="targetRegionId">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="Select Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="region in data" :key="region.id" :value="region.id"
            :disabled="region.id === regionToRemove">
            {{ region.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <AlertDialogFooter>
        <AlertDialogCancel @click="showMoveUsersDialog = false">Cancel</AlertDialogCancel>
        <AlertDialogAction @click="moveUsersAndRemoveRegion" :disabled="!targetRegionId">
          Move Users and Remove Region
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
