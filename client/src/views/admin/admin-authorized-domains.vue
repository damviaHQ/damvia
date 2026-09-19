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
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, Trash2 } from "@lucide/vue"
import { ref } from "vue"
import { trpc } from "../../services/server.ts"

const toast = useGlobalToast()

const form = ref({ domain: "", detail: "" })
const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/
const modalState = ref<"creating" | "closed">("closed")
const queryClient = useQueryClient()
const { status, data, error } = useQuery({
  queryKey: ["authorized-domains"],
  queryFn: () => trpc.authorizedDomain.list.query(),
})

function openCreateModal() {
  form.value = { domain: "", detail: "" }
  modalState.value = "creating"
}

async function submitChanges(event: Event) {
  event.preventDefault()
  try {
    await trpc.authorizedDomain.create.mutate(form.value)
    await queryClient.invalidateQueries({ queryKey: ["authorized-domains"] })
    toast.success("Domain added!")
    modalState.value = "closed"
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function remove(id: string) {
  try {
    await trpc.authorizedDomain.remove.mutate(id)
    await queryClient.invalidateQueries({ queryKey: ["authorized-domains"] })
    toast.success("Domain removed!")
  } catch (error) {
    toast.error((error as Error).message)
  }
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
      <div><h1>Authorized domains</h1><p>Approve new accounts automatically for trusted email domains.</p></div>
      <Button type="button" variant="default" @click="openCreateModal"
        class="dv-button dv-button--primary">
        <CirclePlus class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)]" />
        Add domain
      </Button>
    </div>

    <AdminList :items="data" :fields="['domain', 'detail']" label="Authorized domains" v-slot="{ items }">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Domain</TableHead>
          <TableHead>Description</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="authorizedDomain in items" :key="authorizedDomain.id">
          <TableCell>{{ authorizedDomain.domain }}</TableCell>
          <TableCell>{{ authorizedDomain.detail }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button variant="ghost" size="sm">
                    <Trash2 class="w-[var(--dv-icon-compact)] h-[var(--dv-icon-compact)] mr-2" />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Removing Authorized Domain</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to remove this authorized domain? <br />
                      New accounts using this domain will need approval from an administrator or manager. Existing accounts are unaffected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction @click="remove(authorizedDomain.id)">
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
      <form :aria-busy="saving" @submit="onModalSubmit">
        <DialogHeader>
          <DialogTitle>Add new authorized domain</DialogTitle>
          <DialogDescription>
            Admins or Managers won't need to manually validate new accounts registered
            with this domain. (e.g. example.com)
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <FieldGroup >
            <Label for="domain">Domain *</Label>
            <Input id="domain" v-model="form.domain" placeholder="example.com" class="w-full" />
          </FieldGroup>
          <FieldGroup >
            <Label for="detail">Description</Label>
            <Input id="detail" v-model="form.detail" placeholder="Describe the domain" class="w-full" />
          </FieldGroup>
        </div>
        <DialogFooter class="items-center">
          <DialogClose as-child><Button type="button" variant="outline" :disabled="saving">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="saving || (!form.domain || !domainRegex.test(form.domain))">
            Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
