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
import Loader from "@/components/Loader.vue"
import AccountNewsletters from "@/components/account/AccountNewsletters.vue"
import { accountGroupTitleClasses } from "@/components/account/accountStyles"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { zodTypedSchema } from "@/lib/zodTypedSchema"
import { Download } from "@lucide/vue"
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

async function downloadMyData() {
  try {
    const data = await trpc.user.exportMyData.mutate()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  }
}

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
  <Loader v-if="status === 'pending'" :text="true" />
  <p v-else-if="status === 'error'" role="alert" class="text-body text-destructive">{{ error?.message }}</p>
  <div v-else-if="status === 'success'" class="grid gap-10">
    <section aria-labelledby="profile-details" class="grid gap-5">
      <h2 id="profile-details" :class="accountGroupTitleClasses">Details</h2>
      <form @submit.prevent="updateProfile" class="grid max-w-2xl gap-5">
        <div class="grid gap-5 sm:grid-cols-2">
          <FormField v-slot="{ componentField }" name="name">
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input v-bind="componentField" autocomplete="name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="company">
            <FormItem>
              <FormLabel>Company</FormLabel>
              <FormControl>
                <Input v-bind="componentField" autocomplete="organization" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input v-bind="componentField" autocomplete="email" :disabled="globalStore?.user?.role !== 'admin'" />
            </FormControl>
            <FormMessage />
            <FormDescription v-if="globalStore?.user?.role !== 'admin'">Contact an administrator to change your email.</FormDescription>
          </FormItem>
        </FormField>
        <Button type="submit" class="justify-self-start">Save changes</Button>
      </form>
    </section>

    <AccountNewsletters />

    <section aria-labelledby="profile-data" class="grid gap-4">
      <h2 id="profile-data" :class="accountGroupTitleClasses">Your data</h2>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <p class="max-w-md text-body text-neutral-600">A JSON copy of what this library holds about you: account, groups, favourites, collections, invitations, downloads, newsletters, activity and sign-ins.</p>
        <Button type="button" variant="outline" @click="downloadMyData"><Download class="size-4" aria-hidden="true" />Download my data</Button>
      </div>
    </section>

    <section aria-labelledby="profile-danger" class="grid gap-4">
      <h2 id="profile-danger" :class="accountGroupTitleClasses">Danger zone</h2>
      <div class="flex flex-wrap items-center justify-between gap-4 border border-destructive/30 p-4">
        <div class="grid max-w-md gap-1">
          <p class="text-body font-medium text-neutral-900">Delete account</p>
          <p class="text-body text-neutral-600">Removes your account, downloads, shared links and collections. Guests lose access to what you shared.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="destructive">Delete account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. Your account, downloads, shared links and collections are deleted, and guests can no longer open the collections you shared.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction @click="removeAccount" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, remove my account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  </div>
</template>
