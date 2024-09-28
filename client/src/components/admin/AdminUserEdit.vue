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
import { Button } from "@/components/ui/button"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { toTypedSchema } from "@vee-validate/zod"
import { useForm } from "vee-validate"
import { computed, ref, watch } from "vue"
import * as z from "zod"

type UserRole = RouterOutput['user']['list'][number]['role']

const props = defineProps<{
  user: {
    id: string
    name: string
    email: string
    company: string
    regionId: string
    role: UserRole
    groupId: string
  }
}>()
const emit = defineEmits<{ updated: []; close: [] }>()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const globalStore = useGlobalStore()
const { data: groups } = useQuery({
  queryKey: ["groups"],
  queryFn: () => trpc.group.list.query(),
})
const { data: regions } = useQuery({
  queryKey: ["regions"],
  queryFn: () => trpc.region.list.query(),
})
const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(2).max(50),
    email: z.string().email(),
    company: z.string().min(2).max(50),
    regionId: z.string().min(1),
    role: z.enum(["guest", "member", "manager", "admin"] as const),
    groupId: z.string().uuid("Invalid group"),
  })
)
const { handleSubmit, values, setValues } = useForm({
  validationSchema: formSchema,
})
const formRootError = ref<string | null>(null)
const formErrors = ref<Record<string, string>>({})

const isCurrentUser = computed(() => {
  return globalStore.user?.id === props.user.id
})
const isCurrentUserManager = computed(() => {
  return globalStore.user?.role === "manager" && isCurrentUser.value
})

watch(
  () => props.user,
  (user) => {
    if (user) {
      setValues({
        name: user.name,
        company: user.company,
        regionId: user.regionId,
        email: user.email,
        role: user.role,
        groupId: user.groupId,
      })
    }
  },
  { immediate: true }
)

const onSubmit = handleSubmit(async (formValues) => {
  try {
    const updatedValues = { ...formValues }

    // If the current user is a manager editing their own profile,
    // keep the original values for region, role, and group
    if (isCurrentUserManager.value) {
      updatedValues.regionId = props.user.regionId
      updatedValues.role = props.user.role
      updatedValues.groupId = props.user.groupId
    }

    await trpc.user.update.mutate({
      id: props.user.id,
      ...updatedValues,
      role: updatedValues.role as UserRole,
    })

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users", props.user.id] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
    ])
    toast.success("User updated successfully")
    emit("updated")
    emit("close")
  } catch (error) {
    const { message, fieldErrors } = extractErrors(error)
    formRootError.value = message
    formErrors.value = fieldErrors
  }
})
</script>

<template>
  <form @submit.prevent="onSubmit" class="space-y-4">
    <div v-if="isCurrentUserManager" class="text-yellow-600 bg-yellow-100 p-2 rounded">
      As a manager, you cannot edit your own Region, Role or Group.
    </div>
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>Name</FormLabel>
        <FormControl>
          <Input type="text" placeholder="Name" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="email">
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input type="email" placeholder="Email" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="company">
      <FormItem>
        <FormLabel>Company name</FormLabel>
        <FormControl>
          <Input type="text" placeholder="Company name" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-if="!isCurrentUserManager" v-slot="{ componentField }" name="regionId">
      <FormItem>
        <FormLabel>Region</FormLabel>
        <FormControl>
          <Select v-bind="componentField" :disabled="isCurrentUserManager">
            <SelectTrigger>
              <SelectValue placeholder="Select a region..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="region in regions" :key="region.id" :value="region.id">
                {{ region.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-if="!isCurrentUserManager" v-slot="{ componentField }" name="role">
      <FormItem>
        <FormLabel>Role</FormLabel>
        <FormControl>
          <Select v-bind="componentField" :disabled="isCurrentUserManager">
            <SelectTrigger>
              <SelectValue placeholder="Select a role..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="guest">Guest</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem v-if="globalStore.user?.role === 'admin'" value="manager">
                Manager
              </SelectItem>
              <SelectItem v-if="globalStore.user?.role === 'admin'" value="admin">
                Admin
              </SelectItem>
            </SelectContent>
          </Select>
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-if="!isCurrentUserManager" v-slot="{ componentField }" name="groupId">
      <FormItem>
        <FormLabel>Group</FormLabel>
        <FormControl>
          <Select v-bind="componentField">
            <SelectTrigger>
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <div class="flex justify-end space-x-2">
      <Button type="submit" :disabled="props.user.role === 'admin' && globalStore.user?.role !== 'admin'">
        Save changes
      </Button>
    </div>
  </form>
</template>
