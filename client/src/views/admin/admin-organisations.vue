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
import AdminPageHeader from "@/components/admin/AdminPageHeader.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { DialogClose } from "@/components/ui/dialog"
import AdminList from "@/components/admin/AdminList.vue"
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
import { CirclePlus, PencilLine, Trash2 } from "@lucide/vue"
import { ref } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()
const modalState = ref<"editing" | "creating" | "closed">("closed")
const form = ref<{ id?: string; name: string }>({ name: "" })
const { status, data, error } = useQuery({
  queryKey: ["organisations"],
  queryFn: () => trpc.organisation.list.query(),
})

function openCreateModal() {
  form.value = { name: "" }
  modalState.value = "creating"
}

function openEditModal(organisation: RouterOutput["organisation"]["list"][number]) {
  form.value = { id: organisation.id, name: organisation.name }
  modalState.value = "editing"
}

const saving = ref(false)
async function onModalSubmit() {
  if (saving.value) return
  saving.value = true
  try {
    if (form.value.id) await trpc.organisation.update.mutate({ id: form.value.id, name: form.value.name })
    else await trpc.organisation.create.mutate({ name: form.value.name })
    await queryClient.invalidateQueries({ queryKey: ["organisations"] })
    toast.success(modalState.value === "creating" ? "Organisation created." : "Organisation renamed.")
    modalState.value = "closed"
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    saving.value = false
  }
}

async function remove(id: string) {
  try {
    const result = await trpc.organisation.remove.mutate(id)
    await queryClient.invalidateQueries({ queryKey: ["organisations"] })
    await queryClient.invalidateQueries({ queryKey: ["users"] })
    toast.success(result.unassignedUsers ? `Organisation removed. ${result.unassignedUsers} user(s) no longer belong to one.` : "Organisation removed.")
  } catch (error) {
    toast.error((error as Error).message)
  }
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
    <AdminPageHeader description="The companies your users work for, such as a subsidiary or a distributor. Set each user's organisation from the Users screen.">
      <Button type="button" variant="default" @click="openCreateModal"
        class="dv-button dv-button--primary">
        <CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
        Add organisation
      </Button>
    </AdminPageHeader>

    <AdminList :items="data" :fields="['name']" label="Organisations" v-slot="{ items }">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Users</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="organisation in items" :key="organisation.id">
          <TableCell>{{ organisation.name }}</TableCell>
          <TableCell>{{ organisation.userCount }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" @click="openEditModal(organisation)">
                <PencilLine class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] mr-2" />
                Rename
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
                    <AlertDialogTitle>Remove {{ organisation.name }}</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone.
                      <template v-if="organisation.userCount">Its {{ organisation.userCount }} user(s) keep their account, without an organisation.</template>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction @click="remove(organisation.id)">
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
    </AdminList>
  </div>
  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && !saving && (modalState = 'closed')">
    <DialogContent class="admin-dialog--compact">
      <form :aria-busy="saving" @submit.prevent="onModalSubmit">
        <DialogHeader>
          <DialogTitle>{{ modalState === "creating" ? "Create organisation" : "Rename organisation" }}</DialogTitle>
          <DialogDescription>Each name is used once.</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <FieldGroup>
            <Label for="organisation-name">Name *</Label>
            <Input id="organisation-name" v-model="form.name" maxlength="80" placeholder="Organisation name" />
          </FieldGroup>
        </div>
        <DialogFooter class="items-center">
          <DialogClose as-child><Button type="button" variant="outline" :disabled="saving">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="saving || !form.name.trim()">
            {{ modalState === "creating" ? "Create" : "Rename" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
