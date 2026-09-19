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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "../../services/server.ts"
import { useGlobalStore } from "../../stores/globalStore.ts"

const router = useRouter()
const globalStore = useGlobalStore()
const toast = useGlobalToast()
const acceptedPolicies = ref(false)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const form = ref({ name: "", company: "", regionId: "", email: "", password: "" })
const formRootError = ref<string | null>(null)
const formErrors = ref<Record<string, string>>({})
const isFormValid = computed(() => {
  return (
    form.value.name &&
    form.value.company &&
    form.value.regionId &&
    emailRegex.test(form.value.email) &&
    (globalStore.env?.passwordLessAuthentication || form.value.password) &&
    acceptedPolicies.value
  )
})

const emailError = computed(() => {
  if (formErrors.value.email) {
    return formErrors.value.email
  }
  if (form.value.email && !emailRegex.test(form.value.email)) {
    return "Please enter a valid email address."
  }
  return null
})

async function onSubmit(event: Event) {
  if (!acceptedPolicies.value) {
    toast.error("You must accept the privacy and cookie policies to register.")
    return
  }

  event.preventDefault()

  formRootError.value = null
  formErrors.value = {}
  trpc.user.create
    .mutate(form.value)
    .then(async (token) => {
      await globalStore.setAuthToken(token)
      router.push({ name: "home" })
    })
    .catch((error) => {
      const { message, fieldErrors } = extractErrors(error)
      formRootError.value = message
      formErrors.value = fieldErrors
    })
}
</script>

<template>
  <form @submit="onSubmit" class="flex flex-col gap-3">
    <div class="text-sm self-end text-neutral-500 mb-3">* Required</div>
    <FieldGroup>
      <Label for="name">Name *</Label>
      <Input id="name" type="text" v-model="form.name" placeholder="Your name" autocomplete="name" required :aria-invalid="formErrors.name ? true : undefined" :aria-describedby="formErrors.name ? 'name-error' : undefined" autofocus />
      <div v-if="formErrors.name" id="name-error" class="text-sm text-destructive">
        {{ formErrors.name }}
      </div>
    </FieldGroup>
    <FieldGroup>
      <Label for="company">Company *</Label>
      <Input id="company" type="text" v-model="form.company" placeholder="Your company" autocomplete="organization" required :aria-invalid="formErrors.company ? true : undefined" :aria-describedby="formErrors.company ? 'company-error' : undefined" />
      <div v-if="formErrors.company" id="company-error" class="text-sm text-destructive">
        {{ formErrors.company }}
      </div>
    </FieldGroup>
    <FieldGroup>
      <Label for="region">Region *</Label>
      <Select v-model="form.regionId">
        <SelectTrigger id="region" aria-required="true" :aria-invalid="formErrors.regionId ? true : undefined" :aria-describedby="formErrors.regionId ? 'region-error' : undefined">
          <SelectValue placeholder="Select a region..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="region in globalStore.env?.regions" :key="region.id" :value="region.id">
            {{ region.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <div v-if="formErrors.regionId" id="region-error" class="text-sm text-destructive">
        {{ formErrors.regionId }}
      </div>
    </FieldGroup>
    <FieldGroup>
      <Label for="email">Email *</Label>
      <Input id="email" type="email" v-model="form.email" placeholder="name@example.com" autocomplete="email" required :aria-invalid="emailError ? true : undefined" :aria-describedby="emailError ? 'email-error' : undefined" />
      <div v-if="emailError" id="email-error" class="text-sm text-destructive">
        {{ emailError }}
      </div>
    </FieldGroup>
    <FieldGroup v-if="globalStore.env && !globalStore.env.passwordLessAuthentication" >
      <Label for="password">Password *</Label>
      <Input id="password" type="password" v-model="form.password" placeholder="Your password"
        autocomplete="new-password" required :aria-invalid="formErrors.password ? true : undefined" :aria-describedby="formErrors.password ? 'password-error' : undefined" />
      <div v-if="formErrors.password" id="password-error" class="text-sm text-destructive">
        {{ formErrors.password }}
      </div>
    </FieldGroup>
    <div class="flex flex-col pt-5">
      <div class="flex items-center space-x-2 mb-3">
        <Checkbox id="acceptPolicies" v-model="acceptedPolicies" aria-required="true" />
        <Label for="acceptPolicies">
          I accept the
          <router-link to="/privacy-policy" class="underline">Privacy Policy and Cookie
            Policy. *</router-link>
        </Label>
      </div>
      <Button type="submit" class="w-full" :disabled="!isFormValid">Sign up</Button>
      <div v-if="formRootError" role="alert" class="text-sm font-medium mt-2 text-destructive">
        {{ formRootError }}
      </div>
      <div class="flex">
        <Button as-child variant="link" class="px-0">
          <router-link :to="{ name: 'login' }">Already have an account? Log in</router-link>
        </Button>
      </div>
    </div>
  </form>
</template>
