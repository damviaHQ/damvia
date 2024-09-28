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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { toTypedSchema } from "@vee-validate/zod"
import { AlertTriangle } from "lucide-vue-next"
import { useForm } from "vee-validate"
import { watchEffect } from "vue"
import * as z from "zod"

const toast = useGlobalToast()
const globalStore = useGlobalStore()
const { data, status, error } = useQuery({
  queryKey: ['user'],
  queryFn: () => trpc.user.me.query(),
})
const formSchema = toTypedSchema(z.object({
  name: z.string().min(1).max(80),
  company: z.string().min(1).max(80),
  email: z.string().email(),
}))
const { handleSubmit, values, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: '',
    company: '',
    email: '',
  },
})

watchEffect(() => {
  if (data.value) {
    setFieldValue('name', data.value.name)
    setFieldValue('company', data.value.company)
    setFieldValue('email', data.value.email)
  }
})

const updateProfile = handleSubmit(async (values) => {
  const { name, company, email } = values
  const updatedUser = await trpc.user.updateProfile.mutate({ name, company, email })
  globalStore.fetchUser()
  toast.success("Profile updated successfully")
})

async function removeAccount() {
  try {
    if (!data.value?.id) {
      throw new Error("User ID not found")
    }
    await trpc.user.removeAccount.mutate(data.value.id)
    toast.success("Your account has been successfully removed. You will be redirected to login page.")
    globalStore.fetchUser()
  } catch (error) {
    toast.error("Failed to remove account. Please try again.")
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
  <div v-else-if="status === 'success'" class="links__container h-full flex flex-col gap-4">
    <p class="text-sm text-neutral-500">
      This is the list of all invitations you have created. If a guest cannot access a collection, check if the link has
      expired. You can navigate to
      the collection and create a new invitation.
    </p>
    <div class="flex flex-col justify-between h-full">
      <form @submit.prevent="updateProfile" class="flex flex-col items-start gap-4">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>
              <Label for="name">Name</Label>
            </FormLabel>
            <FormControl>
              <Input id="name" v-bind="componentField" />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="company">
          <FormItem>
            <FormLabel>
              <Label for="company">Company</Label>
            </FormLabel>
            <FormControl>
              <Input id="company" v-bind="componentField" />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <FormLabel>
              <Label for="email">Email</Label>
            </FormLabel>
            <FormControl>
              <Input id="email" v-bind="componentField" :disabled="globalStore?.user?.role !== 'admin'" />
              <p v-if="globalStore?.user?.role !== 'admin'" class="text-sm text-neutral-500">
                Please contact an administrator to change your email.
              </p>
            </FormControl>
          </FormItem>
        </FormField>
        <Button type="submit" class="mt-6">Update</Button>
      </form>
      <div class="profile__alert-container flex flex-col w-[50%] mt-[5rem] gap-4">
        <Alert variant="destructive" class="flex items-center gap-8">
          <div class="flex self-start gap-2">
            <AlertTriangle class="w-6 h-6" />
          </div>
          <div class="flex flex-col gap-2">
            <AlertTitle>
              Delete your Account
            </AlertTitle>
            <AlertDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data including
              downloads, shared links, and
              collections. Guests won't be able to access your shared collections anymore.
            </AlertDescription>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" class="mt-6">Delete Account</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your account and remove all your data
                    including downloads, shared
                    links,
                    and
                    collections. Guests won't be able to access your shared collections anymore.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction @click="removeAccount" class="bg-red-600 hover:bg-red-700">Yes, remove my account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

        </Alert>
      </div>
    </div>
  </div>
</template>
