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
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { zodTypedSchema } from "@/lib/zodTypedSchema"
import { AlertTriangle } from "@lucide/vue"
import { useForm } from "vee-validate"
import { watchEffect } from "vue"
import * as z from "zod"

const toast = useGlobalToast()
const globalStore = useGlobalStore()
const { data, status, error } = useQuery({
  queryKey: ['user'],
  queryFn: () => trpc.user.me.query(),
})
const formSchema = zodTypedSchema(z.object({
  name: z.string().min(1).max(80),
  company: z.string().min(1).max(80),
  email: z.email(),
}))
const { handleSubmit, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: '',
    company: '',
    email: '',
  },
})

watchEffect(() => {
  if (data.value) {
    setFieldValue('name', data.value.name, false)
    setFieldValue('company', data.value.company ?? '', false)
    setFieldValue('email', data.value.email, false)
  }
})

const updateProfile = handleSubmit(async (values) => {
  const { name, company, email } = values
  await trpc.user.updateProfile.mutate({ name, company, email })
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
  <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="links__container grid gap-6">
    <div class="grid gap-6">
      <form @submit.prevent="updateProfile" class="grid w-full max-w-lg gap-5">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="company">
          <FormItem>
            <FormLabel>Company</FormLabel>
            <FormControl>
              <Input v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input v-bind="componentField" :disabled="globalStore?.user?.role !== 'admin'" />
            </FormControl>
            <FormMessage />
            <FormDescription v-if="globalStore?.user?.role !== 'admin'">Contact an administrator to change your email.</FormDescription>
          </FormItem>
        </FormField>
        <Button type="submit" class="justify-self-start">Save changes</Button>
      </form>
      <div class="profile__alert-container w-full max-w-lg pt-2">
        <Alert variant="destructive" class="border-0 bg-transparent p-0 flex items-start gap-3">
          <div class="flex self-start gap-2">
            <AlertTriangle class="w-6 h-6" />
          </div>
          <div class="flex flex-col gap-2">
            <AlertTitle>
              Delete account
            </AlertTitle>
            <AlertDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data including
              downloads, shared links, and
              collections. Guests won't be able to access your shared collections anymore.
            </AlertDescription>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" class="mt-2 self-start">Delete account</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
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
                  <AlertDialogAction @click="removeAccount" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, remove my account
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
