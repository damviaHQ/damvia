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
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,} from "@/components/ui/breadcrumb"
import {Button} from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from "@/components/ui/table"
import {useGlobalToast} from "@/composables/useGlobalToast"
import {RouterOutput, trpc} from "@/services/server.ts"
import {CalendarDate, parseDate} from '@internationalized/date'
import {useQuery, useQueryClient} from "@tanstack/vue-query"
import {CirclePlus, PencilLine, Trash2, XIcon} from "lucide-vue-next"
import {useDateFormatter} from 'radix-vue'
import {toDate} from 'radix-vue/date'
import {computed, ref} from 'vue'
import Treeselect from "vue3-treeselect-ts"
import {QuillEditor} from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css"
import DatePickerInput from "@/components/DatePickerInput.vue";
import {subDays, addDays} from 'date-fns'

const toast = useGlobalToast()
const modalState = ref("closed")
const queryClient = useQueryClient()
const locale = ref('en-US')
const formatter = useDateFormatter(locale.value)
const form = ref({
  id: '',
  name: '',
  details: '',
  usageFrom: null,
  usageTo: null,
  scopes: [],
  allowedRegionIds: [],
})
const licenseScopeOptions = [
  { id: "digital", label: "Digital" },
  { id: "print", label: "Print" },
]
const { status, data, error } = useQuery({
  queryKey: ["licenses"],
  queryFn: () => trpc.license.list.query(),
})
const { data: regions } = useQuery({
  queryKey: ["regions"],
  queryFn: () => trpc.region.list.query(),
})
const regionOptions = computed(() =>
  regions.value?.map((region) => ({ label: region.name, id: region.id })) ?? []
)

function openCreateModal() {
  form.value = {
    id: '',
    name: '',
    usageFrom: null,
    usageTo: null,
    details: '',
    scopes: [],
    allowedRegionIds: [],
  }
  modalState.value = "creating"
}

function openEditModal(license: RouterOutput["license"]["list"][number]) {
  form.value = {
    id: license.id,
    name: license.name,
    usageFrom: license.usageFrom ? parseDate(license.usageFrom) : null,
    usageTo: license.usageTo ? parseDate(license.usageTo) : null,
    details: license.details,
    scopes: license.scopes,
    allowedRegionIds: license.allowedRegionIds,
  }
  modalState.value = "editing"
}

async function onModalSubmit(event: Event) {
  event.preventDefault()

  const formData = {
    ...form.value,
    usageFrom: form.value.usageFrom?.toString?.() ?? null,
    usageTo: form.value.usageTo?.toString?.() ?? null,
  }

  const action = modalState.value === "creating" ? trpc.license.create : trpc.license.update
  try {
    await action.mutate(formData as any)
    await queryClient.invalidateQueries({ queryKey: ["licenses"] })
    toast.success(modalState.value === "creating" ? "License created!" : "License updated!")
    modalState.value = "closed"
  } catch (error) {
    toast.error((error as Error).message)
  }
}

async function remove(licenseId: string) {
  try {
    await trpc.license.remove.mutate(licenseId)
    await queryClient.invalidateQueries({ queryKey: ["licenses"] })
    toast.success("License removed successfully.")
  } catch (error) {
    toast.error((error as Error).message)
  }
}

function formatDate(date: CalendarDate | undefined) {
  if (!date) return ''
  return formatter.custom(toDate(date), { dateStyle: "medium" })
}
</script>

<template>
  <div class="flex flex-col p-8">
    <div class="flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Licenses</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button type="button" variant="link" @click="openCreateModal"
        class="flex w-fit gap-2 text-neutral-600 hover:text-neutral-900">
        <CirclePlus class="w-4 h-4" />
        Add new License
      </Button>
    </div>

    <div v-if="status === 'pending'">
      <Loader :text="true" />
    </div>
    <div v-else-if="status === 'error'" class="alert alert-danger">
      {{ error?.message }}
    </div>
    <div v-else-if="status === 'success'">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Usage from</TableHead>
            <TableHead>Usage to</TableHead>
            <TableHead>Scopes</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="license in data" :key="license.id">
            <TableCell>{{ license.name }}</TableCell>
            <TableCell>{{
              license.usageFrom
                ? formatDate(
                  new CalendarDate(
                    new Date(license.usageFrom).getFullYear(),
                    new Date(license.usageFrom).getMonth() + 1,
                    new Date(license.usageFrom).getDate()
                  )
                )
                : "N/A"
            }}</TableCell>
            <TableCell>{{
              license.usageTo
                ? formatDate(
                  new CalendarDate(
                    new Date(license.usageTo).getFullYear(),
                    new Date(license.usageTo).getMonth() + 1,
                    new Date(license.usageTo).getDate()
                  )
                )
                : "N/A"
            }}</TableCell>
            <TableCell>{{
              license.scopes.map((s) => s.toUpperCase()).join(", ")
            }}</TableCell>
            <TableCell>
              <div class="flex space-x-2">
                <Button variant="ghost" size="sm" @click="openEditModal(license)">
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
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently remove the
                        license and all associated assets will be accessible.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction @click="remove(license.id)">Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>

  <Dialog :open="modalState !== 'closed'" @update:open="(open) => !open && (modalState = 'closed')">
    <DialogContent class="sm:max-w-[480px] overflow-y-auto max-h-[calc(100vh-32px)]">
      <form @submit.prevent="onModalSubmit" class="flex flex-col gap-4 py-4">
        <DialogHeader>
          <DialogTitle>{{ modalState === "creating" ? "Create" : "Edit" }} License</DialogTitle>
          <DialogDescription>
            Licenses help you restrict access to your assets by time and region and define
            the scopes of usage. At the end of the usage period, the assets won't be
            visible anymore.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Label for="name">Name *</Label>
          <Input id="name" v-model="form.name" placeholder="License name" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="name">Details</Label>
          <div class="bg-white flex-grow overflow-hidden">
            <QuillEditor
              ref="editor"
              v-model:content="form.details"
              class="bg-white flex-grow flex flex-col"
              theme="snow"
              toolbar="essential"
              placeholder="..."
              content-type="html"
            />
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="usageFrom">Usage From</Label>
          <div class="flex gap-2">
            <DatePickerInput
              :model-value="form.usageFrom"
              @update:modelValue="(event) => {
                form.usageFrom = new CalendarDate(event.year, event.month, event.day)
                if (form.usageTo && form.usageFrom.compare(form.usageTo) > 1) {
                  form.usageTo = null
                }
              }"
            />
            <Button type="button" variant="ghost" size="icon" @click="form.usageFrom = null">
              <XIcon />
            </Button>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="usageTo">Usage To</Label>
          <div class="flex gap-2">
            <DatePickerInput
              :model-value="form.usageTo"
              @update:modelValue="(event) => {
                form.usageTo = new CalendarDate(event.year, event.month, event.day)
                if (form.usageFrom && form.usageTo.compare(form.usageFrom) < 1) {
                  form.usageFrom = null
                }
              }"
            />
            <Button type="button" variant="ghost" size="icon" @click="form.usageTo = null">
              <XIcon />
            </Button>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="scopes">Usage Scopes *</Label>
          <Treeselect v-model="form.scopes" :options="licenseScopeOptions" :multiple="true"
            placeholder="Select scopes" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="allowedRegions">Allowed Regions *</Label>
          <Treeselect v-model="form.allowedRegionIds" :options="regionOptions" :multiple="true"
            placeholder="Select allowed regions" />
        </div>
        <DialogFooter class="sm:justify-between items-center">
          <div class="text-sm text-gray-500">* Required</div>
          <Button type="submit" :disabled="form.name === '' ||
            form.scopes.length === 0 ||
            form.allowedRegionIds.length === 0
          ">
            {{ modalState === "creating" ? "Create" : "Save" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.licenses__modal {
  width: 100%;
  min-width: 24rem;
  max-width: 24rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
}
</style>
