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
import AminUserEdit from "@/components/admin/AdminUserEdit.vue"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import dayjs from "dayjs"
import {
  AlarmClockCheck,
  ClipboardList,
  Trash2,
  UserPen,
  UserRoundCheck,
} from "lucide-vue-next"
import { computed, ref } from "vue"

type User = RouterOutput['user']['list'][number]

const globalStore = useGlobalStore()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const selectedUser = ref<User | null>(null)
const isEditDialogOpen = ref(false)
const { status, data, error } = useQuery({
  queryKey: ["users"],
  queryFn: () => trpc.user.list.query(),
  select: (data) => {
    // Sorts users by `createdAt` in descending order to put the latest on top
    return data.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  refetchOnMount: true,
})
const filters = ref({
  approved: false,
  role: "all",
  region: "all",
  needsApproval: false,
})
const isAlertOpen = ref(false)
const deletingUserId = ref<{
  email: string
  id: string
}>({
  email: "",
  id: "",
})

const filteredUsers = computed(() => {
  if (!data.value) return []

  return data.value.filter((user) => {
    if (filters.value.approved && !user.approved) return false
    if (filters.value.role === "all-except-guest" && user.role === "guest") return false
    if (filters.value.role !== "all" && filters.value.role !== "all-except-guest" && user.role !== filters.value.role) return false
    if (filters.value.region !== "all" && user.region !== filters.value.region)
      return false
    if (filters.value.needsApproval && (user.approved || !user.emailVerified))
      return false
    return true
  })
})

const availableRegions = computed(() => {
  if (!data.value) return []
  const regions = new Set(data.value.map((user) => user.region).filter(Boolean))
  return Array.from(regions)
})
const availableRoles = computed(() => {
  if (!data.value) return []
  const roles = new Set(data.value.map((user) => user.role))
  return Array.from(roles)
})
const copyText = computed(() => {
  const verifiedEmailCount = filteredUsers.value.filter((user) => user.emailVerified).length
  return `Copy ${verifiedEmailCount} emails`
})

async function remove(userId: string) {
  try {
    await trpc.user.remove.mutate(userId)
    queryClient.invalidateQueries({ queryKey: ["users"] })
    toast.success("User deleted successfully")
  } catch (error) {
    toast.error("Couldn't remove this user")
  }
}

async function approve(userId: string) {
  trpc.user.approve
    .mutate(userId as string)
    .then(() => Promise.all([queryClient.invalidateQueries({ queryKey: ["users"] })]))
    .catch((error) => toast.error(error.message))
}

async function copyEmail() {
  if (!filteredUsers.value) {
    toast.error("User data could not be loaded")
    return
  }

  const verifiedEmails = filteredUsers.value
    .filter(user => user.emailVerified)
    .map(user => user.email)
    .join(", ")
  await navigator.clipboard.writeText(verifiedEmails)
  toast.success("Verified emails copied to clipboard")
}

const handleOpenChange = (open: boolean) => {
  isAlertOpen.value = open
}

function openEditDialog(user: User) {
  selectedUser.value = user
  isEditDialogOpen.value = true
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
    <AlertDialog :open="isAlertOpen" @update:open="handleOpenChange">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete
            <span v-if="deletingUserId.email" class="font-bold">{{
              deletingUserId.email
              }}</span>
            account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="
            deletingUserId = {
              email: '',
              id: '',
            }
            ">Cancel</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive" @click="remove(deletingUserId.id)">
            Delete User
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div class="admin-layout__top flex items-center mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage> Users </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
    <div class="flex items-center gap-4 mb-4">
      <div class="flex items-center space-x-2">
        <Checkbox id="approved" v-model:checked="filters.approved" />
        <label for="approved"
          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Approved
        </label>
      </div>
      <div class="flex items-center space-x-2">
        <Checkbox id="needsApproval" v-model:checked="filters.needsApproval" />
        <label for="needsApproval"
          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Wait for Approval
        </label>
      </div>
      <Select v-model="filters.role">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="Select Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Roles</SelectItem>
          <SelectItem value="all-except-guest">All Except Guests</SelectItem>
          <SelectItem v-for="role in availableRoles" :key="role" :value="role">
            {{ role }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="filters.region">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="Select Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all"> All Regions </SelectItem>
          <SelectItem v-for="(region, index) in availableRegions" :key="index" :value="region ?? ''">
            {{ region ?? 'Unknown' }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" @click="copyEmail"
        class="p-1.5 gap-1.5 bg-transparent hover:bg-transparent text-neutral-500 hover:text-neutral-800">
        <ClipboardList class="w-4 h-4" />
        {{ copyText }}
      </Button>
    </div>
    <Table>
      <TableHeader>
        <TableRow class="[&>*]:text-neutral-500">
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Registration Date</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Region</TableHead>
          <TableHead>Group</TableHead>
          <TableHead>Approval Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="user in filteredUsers" :key="user.id">
          <TableCell class="max-w-[150px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as="div" class="truncate text-left">{{
                  user.name
                  }}</TooltipTrigger>
                <TooltipContent>{{ user.name }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
          <TableCell class="max-w-[200px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as="div" class="truncate text-left">{{
                  user.email
                  }}</TooltipTrigger>
                <TooltipContent>{{ user.email }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
          <TableCell class="max-w-[150px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as="div" class="truncate text-left">{{
                  user.company || "N/A"
                  }}</TooltipTrigger>
                <TooltipContent>{{ user.company || "N/A" }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
          <TableCell>{{ dayjs(user.createdAt).format("YYYY/MM/DD") }}</TableCell>
          <TableCell>
            {{ user.role }}
          </TableCell>
          <TableCell class="max-w-[100px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as="div" class="truncate text-left">{{
                  user.region || "N/A"
                  }}</TooltipTrigger>
                <TooltipContent>{{ user.region || "N/A" }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
          <TableCell class="max-w-[100px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as="div" class="truncate text-left">{{
                  user.group?.name || "N/A"
                  }}</TooltipTrigger>
                <TooltipContent>{{ user.group?.name || "N/A" }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
          <TableCell v-if="user.emailVerified && user.approved">
            <Button variant="ghost" size="sm" disabled
              class="flex items-center gap-2 text-green-600 disabled:opacity-80">
              <UserRoundCheck class="w-4 h-4" />
              Approved
            </Button>
          </TableCell>
          <TableCell v-else-if="!user.approved && user.emailVerified">
            <Button variant="ghost" type="button" size="sm" @click="approve(user.id)"
              class="flex items-center gap-2 text-neutral-600 hover:bg-green-100 hover:text-green-800">
              <AlarmClockCheck class="w-4 h-4" />
              Approve User
            </Button>
          </TableCell>
          <TableCell v-else class="pending">
            <Button variant="ghost" size="sm" disabled class="flex items-center gap-2 text-neutral-500">
              <AlarmClockCheck class="w-4 h-4" />
              Email not verified
            </Button>
          </TableCell>
          <TableCell class="flex items-center gap-2">
            <Button variant="ghost" size="sm" :disabled="user.role === 'admin' && globalStore.user?.role !== 'admin'"
              @click="openEditDialog(user)">
              <UserPen class="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" type="button" @click="
              isAlertOpen = true
            deletingUserId = {
              email: user.email,
              id: user.id,
            };
            " class="btn btn-outline-danger btn-small"
              :disabled="user.role === 'admin' && globalStore.user?.role !== 'admin'">
              <Trash2 class="w-4 h-4" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <Dialog :open="isEditDialogOpen" @update:open="isEditDialogOpen = $event" @update:close="isEditDialogOpen = false">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Edit the user's details below.</DialogDescription>
        </DialogHeader>
        <AminUserEdit v-if="selectedUser" :user="selectedUser" @close="isEditDialogOpen = false" />
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
}
</style>
