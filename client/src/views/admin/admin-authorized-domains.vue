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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, Trash2 } from "lucide-vue-next"
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

async function onModalSubmit(event: Event) {
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
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="flex flex-col p-8">
    <div class="authorized-domains__top flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Authorized Domains</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button type="button" variant="link" @click="openCreateModal"
        class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
        <CirclePlus class="w-4 h-4" />
        Add new Authorized Domain
      </Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Domain</TableHead>
          <TableHead>Description</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="authorizedDomain in data" :key="authorizedDomain.id">
          <TableCell>{{ authorizedDomain.domain }}</TableCell>
          <TableCell>{{ authorizedDomain.detail }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <AlertDialog>
                <AlertDialogTrigger>
                  <Button variant="ghost" size="sm">
                    <Trash2 class="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Removing Authorized Domain</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to remove this authorized domain? <br />
                      User registering with this domain will not be able to self-validate
                      their accounts amd an Admin or Manager will have to validate new
                      accounts manually.
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
  </div>

  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && (modalState = 'closed')">
    <DialogContent class="sm:max-w-[425px]">
      <form @submit="onModalSubmit">
        <DialogHeader>
          <DialogTitle>Add new authorized domain</DialogTitle>
          <DialogDescription>
            Admins or Managers won't need to manually validate new accounts registered
            with this domain. (e.g. example.com)
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <div class="flex flex-col gap-2 w-full">
            <Label for="domain">Domain *</Label>
            <Input id="domain" v-model="form.domain" placeholder="domain.xtd" class="w-full" />
          </div>
          <div class="flex flex-col gap-2 w-full">
            <Label for="detail">Description</Label>
            <Input id="detail" v-model="form.detail" placeholder="Describe the domain" class="w-full" />
          </div>
        </div>
        <DialogFooter class="sm:justify-between items-center">
          <div class="text-sm text-gray-500">* Required</div>
          <Button type="submit" :disabled="!form.domain || !domainRegex.test(form.domain)">
            Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
