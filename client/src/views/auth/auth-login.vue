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
import AuthResendEmail from "@/components/AuthResendEmail.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { Mail } from "lucide-vue-next"
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useQueryClient } from "@tanstack/vue-query"

const toast = useGlobalToast()
const router = useRouter()
const route = useRoute()
const acceptedPolicies = ref(false)
const globalStore = useGlobalStore()
const emailSent = ref(false)
const form = ref({ email: "", password: "" })
const formRootError = ref<string | null>(null)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const authParams = ref<{
  magicLink?: boolean
  email?: string
  collectionId?: string
  collectionName?: string
}>({})
const queryClient = useQueryClient()

const isFormValid = computed(() => {
  return emailRegex.test(form.value.email) && acceptedPolicies.value
})

watch(
  route,
  () => {
    if (route.query.token) {
      globalStore.setAuthToken(route.query.token as string)
      router.push({ name: "home" })
    }
    if (route.query.auth_params) {
      authParams.value = JSON.parse(window.atob(route.query.auth_params as string))
      form.value.email = authParams.value?.email ?? ""
    }
  },
  { immediate: true }
)

async function onSubmit(event: Event) {
  if (!acceptedPolicies.value) {
    toast.error("You must accept the privacy and cookie policies to login.")
    return
  }

  event.preventDefault()

  trpc.user.login
    .mutate({ ...form.value, magicLink: authParams.value?.magicLink })
    .then(async (token) => {
      if (token === null) {
        emailSent.value = true
        return
      }

      await globalStore.setAuthToken(token)
      router.push({ name: "home" })
    })
    .catch((error) => {
      const { message, fieldErrors } = extractErrors(error)
      formRootError.value =
        Object.keys(fieldErrors).length > 0 ? "Invalid email or password." : message
    })
}

const resendLoginEmail = async () => {
  await onSubmit(new Event('submit'))
}
</script>

<template>
  <div v-if="emailSent" class="flex flex-col gap-4">
    <div class="inline-flex font-medium items-center gap-1">Please check your
      <Mail class="ml-1 inline-block w-4 h-4" /> inbox
    </div>
    <div>
      An email has been sent to <span class="font-bold">{{ form.email }}</span> with a link to login.
    </div>
    <div class="text-sm flex flex-col gap-1 mt-2">
      <div>No email? Check your spam folder</div>
      <div class="flex items-center gap-2 flex-nowrap whitespace-nowrap">or
        <AuthResendEmail :onResend="resendLoginEmail" />
      </div>
    </div>
  </div>
  <form v-else @submit="onSubmit" class="space-y-4">
    <div v-if="authParams.collectionName" class="font-semibold mb-4">
      Access to {{ authParams.collectionName }} collection
    </div>
    <div class="space-y-2">
      <Label for="email">Your email</Label>
      <Input id="email" type="email" v-model="form.email" placeholder="name@domain.com" />
    </div>
    <div v-if="
      globalStore.env &&
      !globalStore.env.passwordLessAuthentication &&
      !authParams.magicLink" class="space-y-2">
      <Label for="password">Password</Label>
      <Input id="password" type="password" v-model="form.password" placeholder="My password" />
    </div>
    <div v-if="formRootError" class="text-sm font-medium text-destructive">
      {{ formRootError }}
    </div>
    <div class="flex flex-col pt-5">
      <div class="flex items-center space-x-2 mb-3">
        <Checkbox id="acceptPolicies" v-model:checked="acceptedPolicies" />
        <Label for="acceptPolicies">
          I accept the
          <router-link to="/privacy-policy" class="underline">Privacy and Cookie
            Policy</router-link>.
        </Label>
      </div>
      <Button type="submit" class="w-full" :disabled="!isFormValid"> Log in </Button>
      <div class="flex items-center" v-if="!authParams.magicLink">
        <Button variant="link" class="px-0">
          <router-link :to="{ name: 'sign-up' }">No account? Register now</router-link>
        </Button>
        <Button variant="link" class="px-0" v-if="globalStore.env && !globalStore.env.passwordLessAuthentication">
          <router-link :to="{ name: 'password-reset' }"> Reset password </router-link>
        </Button>
      </div>
    </div>
  </form>
</template>

<style scoped lang="scss">
.coming-soon {
  color: var(--primary-color);
  margin-left: 2rem;
}
</style>
