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
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { CirclePlus, FilePenLine, PencilLine, Trash2 } from "lucide-vue-next"
import { ref } from "vue"

export type Page = RouterOutput["page"]["list"][number]

const form = ref<{ pageId?: string; name: string }>({ name: "" })
const modalState = ref<"creating" | "editing" | "closed">("closed")
const queryClient = useQueryClient()
const toast = useGlobalToast()
const { status, data, error } = useQuery({
  queryKey: ["pages"],
  queryFn: () => trpc.page.list.query(),
})

function openCreateModal() {
  form.value = { name: "" }
  modalState.value = "creating"
}

function openEditModal(page: Page) {
  form.value = {
    pageId: page.id,
    name: page.name!,
  }
  modalState.value = "editing"
}

async function onModalSubmit(event: Event) {
  event.preventDefault();

  ((modalState.value === "creating" ? trpc.page.create : trpc.page.update) as any)
    .mutate(form.value)
    .then(() => queryClient.invalidateQueries({ queryKey: ["pages"] }))
    .then(() => {
      toast.success(modalState.value === "creating" ? "Page created!" : "Page updated!")
      modalState.value = "closed"
    })
    .catch((error: Error) => toast.error(error.message))
}

async function remove(pageId: string) {
  await trpc.page.remove.mutate({ pageId })
  await queryClient.invalidateQueries({ queryKey: ["pages"] })
  toast.success("Page removed!")
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
            <BreadcrumbPage> Pages </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button type="button" variant="link" @click="openCreateModal"
        class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
        <CirclePlus class="w-4 h-4" />
        Add new page
      </Button>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Page Name</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="page in data" :key="page.id">
          <TableCell>{{ page.name }}</TableCell>
          <TableCell>
            <div class="flex space-x-2">
              <Button variant="ghost" size="sm" asChild>
                <router-link :to="{ name: 'admin-page', params: { id: page.id } }">
                  <FilePenLine class="w-4 h-4 mr-2" />
                  Edit page
                </router-link>
              </Button>
              <Button variant="ghost" size="sm" @click="openEditModal(page)">
                <PencilLine class="w-4 h-4 mr-2" />
                Rename
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
                    <AlertDialogTitle>Remove page</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. Are you sure you want to remove this
                      page?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction @click="remove(page.id)">
                      Continue
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
          <DialogTitle>{{ modalState === "creating" ? "Create" : "Edit" }} page</DialogTitle>
          <DialogDescription>
            Enter the name for your page and click
            {{ modalState === "creating" ? "Create" : "Edit" }}.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <div class="flex flex-col gap-2">
            <Label for="name">Name</Label>
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
</template>

<style scoped>
.pages__modal {
  width: 100%;
  min-width: 24rem;
}
</style>
