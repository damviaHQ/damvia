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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarGrid,
  RangeCalendarGridBody,
  RangeCalendarGridHead,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
} from '@/components/ui/range-calendar'
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
import { CalendarDate, type DateValue, isEqualMonth } from '@internationalized/date'
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CirclePlus, PencilLine, Trash2 } from "lucide-vue-next"
import { type DateRange, RangeCalendarRoot, useDateFormatter } from 'radix-vue'
import { type Grid, createMonth, toDate } from 'radix-vue/date'
import { computed, ref, watch } from 'vue'
import Treeselect from "vue3-treeselect-ts"

const toast = useGlobalToast()
const modalState = ref("closed")
const queryClient = useQueryClient()
const locale = ref('en-US')
const formatter = useDateFormatter(locale.value)
const form = ref({
  id: '',
  name: '',
  usageRange: {
    start: new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
    end: new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()).add({ days: 7 }),
  },
  scopes: [],
  allowedRegionIds: [],
})
const firstMonthPlaceholder = ref(form.value.usageRange.start)
const secondMonthPlaceholder = ref(form.value.usageRange.start.add({ months: 1 }))
const firstMonth = ref(createMonth({
  dateObj: firstMonthPlaceholder.value,
  locale: locale.value,
  fixedWeeks: true,
  weekStartsOn: 0,
}))
const secondMonth = ref(createMonth({
  dateObj: secondMonthPlaceholder.value,
  locale: locale.value,
  fixedWeeks: true,
  weekStartsOn: 0,
}))
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

function updateMonth(reference: 'first' | 'second', months: number) {
  if (reference === 'first') {
    firstMonthPlaceholder.value = firstMonthPlaceholder.value.add({ months })
    secondMonthPlaceholder.value = firstMonthPlaceholder.value.add({ months: 1 })
  } else {
    secondMonthPlaceholder.value = secondMonthPlaceholder.value.add({ months })
    firstMonthPlaceholder.value = secondMonthPlaceholder.value.subtract({ months: 1 })
  }
}

watch(firstMonthPlaceholder, (_placeholder) => {
  firstMonth.value = createMonth({
    dateObj: _placeholder,
    weekStartsOn: 0,
    fixedWeeks: false,
    locale: locale.value,
  })
  // Ensure secondMonthPlaceholder is always one month ahead
  secondMonthPlaceholder.value = _placeholder.add({ months: 1 })
})

watch(secondMonthPlaceholder, (_placeholder) => {
  secondMonth.value = createMonth({
    dateObj: _placeholder,
    weekStartsOn: 0,
    fixedWeeks: false,
    locale: locale.value,
  })
  // Ensure firstMonthPlaceholder is always one month behind
  if (isEqualMonth(_placeholder, firstMonthPlaceholder.value)) {
    firstMonthPlaceholder.value = _placeholder.subtract({ months: 1 })
  }
})

function openCreateModal() {
  form.value = {
    id: '',
    name: '',
    usageRange: {
      start: new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
      end: new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()).add({ days: 7 }),
    },
    scopes: [],
    allowedRegionIds: [],
  }
  modalState.value = "creating"
}

function openEditModal(license: RouterOutput["license"]["list"][number]) {
  form.value = {
    id: license.id,
    name: license.name,
    usageRange: {
      start: license.usageFrom ? new CalendarDate(new Date(license.usageFrom).getFullYear(), new Date(license.usageFrom).getMonth() + 1, new Date(license.usageFrom).getDate()) : undefined,
      end: license.usageTo ? new CalendarDate(new Date(license.usageTo).getFullYear(), new Date(license.usageTo).getMonth() + 1, new Date(license.usageTo).getDate()) : undefined,
    },
    scopes: license.scopes,
    allowedRegionIds: license.allowedRegionIds,
  }
  modalState.value = "editing"
}

async function onModalSubmit(event: Event) {
  event.preventDefault()

  const formData = {
    ...form.value,
    usageFrom: form.value.usageRange.start.toString(),
    usageTo: form.value.usageRange.end.toString(),
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
    <DialogContent class="sm:max-w-[480px]">
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
          <Label for="usageRange">Usage Period *</Label>
          <Popover>
            <PopoverTrigger as-child>
              <Button variant="outline" class="w-full justify-start text-left font-normal">
                <CalendarIcon class="mr-2 h-4 w-4" />
                {{
                  form.usageRange.start ? formatDate(form.usageRange.start) : "Start date"
                }}
                -
                {{ form.usageRange.end ? formatDate(form.usageRange.end) : "End date" }}
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0" @update:open="(open) => !open">
              <RangeCalendarRoot v-model="form.usageRange" class="p-3">
                <div class="flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0">
                  <div>
                    <div class="flex items-center justify-between">
                      <Button variant="outline" class="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                        @click="updateMonth('first', -1)">
                        <ChevronLeft class="h-4 w-4" />
                      </Button>
                      <div class="text-sm font-medium">
                        {{ formatter.fullMonthAndYear(toDate(firstMonth.value)) }}
                      </div>
                      <Button variant="outline" class="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                        @click="updateMonth('first', 1)">
                        <ChevronRight class="h-4 w-4" />
                      </Button>
                    </div>
                    <RangeCalendarGrid>
                      <RangeCalendarGridHead>
                        <RangeCalendarGridRow>
                          <RangeCalendarHeadCell v-for="day in firstMonth.weekDays" :key="day" class="w-full">
                            {{ day }}
                          </RangeCalendarHeadCell>
                        </RangeCalendarGridRow>
                      </RangeCalendarGridHead>
                      <RangeCalendarGridBody>
                        <RangeCalendarGridRow v-for="(weekDates, index) in firstMonth.rows" :key="`weekDate-${index}`"
                          class="mt-2 w-full">
                          <RangeCalendarCell v-for="weekDate in weekDates" :key="weekDate.toString()" :date="weekDate">
                            <RangeCalendarCellTrigger :day="weekDate" :month="firstMonth.value" />
                          </RangeCalendarCell>
                        </RangeCalendarGridRow>
                      </RangeCalendarGridBody>
                    </RangeCalendarGrid>
                  </div>
                  <div>
                    <div class="flex items-center justify-between">
                      <Button variant="outline" class="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                        @click="updateMonth('second', -1)">
                        <ChevronLeft class="h-4 w-4" />
                      </Button>
                      <div class="text-sm font-medium">
                        {{ formatter.fullMonthAndYear(toDate(secondMonth.value)) }}
                      </div>
                      <Button variant="outline" class="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                        @click="updateMonth('second', 1)">
                        <ChevronRight class="h-4 w-4" />
                      </Button>
                    </div>
                    <RangeCalendarGrid>
                      <RangeCalendarGridHead>
                        <RangeCalendarGridRow>
                          <RangeCalendarHeadCell v-for="day in secondMonth.weekDays" :key="day" class="w-full">
                            {{ day }}
                          </RangeCalendarHeadCell>
                        </RangeCalendarGridRow>
                      </RangeCalendarGridHead>
                      <RangeCalendarGridBody>
                        <RangeCalendarGridRow v-for="(weekDates, index) in secondMonth.rows" :key="`weekDate-${index}`"
                          class="mt-2 w-full">
                          <RangeCalendarCell v-for="weekDate in weekDates" :key="weekDate.toString()" :date="weekDate">
                            <RangeCalendarCellTrigger :day="weekDate" :month="secondMonth.value" />
                          </RangeCalendarCell>
                        </RangeCalendarGridRow>
                      </RangeCalendarGridBody>
                    </RangeCalendarGrid>
                  </div>
                </div>
              </RangeCalendarRoot>
            </PopoverContent>
          </Popover>
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
            form.usageRange.start === '' ||
            form.usageRange.end === '' ||
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
