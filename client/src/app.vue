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
import AuthResendEmail from "@/components/AuthResendEmail.vue"
import MfaSetup from "@/components/auth/MfaSetup.vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Loader from "@/components/Loader.vue"
import { Toaster } from "@/components/ui/sonner"
import { provideGlobalToast } from "@/composables/useGlobalToast"
import LayoutAuth from "@/layouts/LayoutAuth.vue"
import LayoutRouter from "@/layouts/LayoutRouter.vue"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { accentVariables } from "@/lib/brand-color"
import { useQuery } from "@tanstack/vue-query"
import { ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { toast } from "vue-sonner"
import "vue3-treeselect-ts/dist/style.css"

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
provideGlobalToast()

// The portal and its dialogs take the brand accent; the admin keeps the
// Damvia colours, as it never carries the dv-client class.
const { data: brandTheme } = useQuery({ queryKey: ['brand-theme'], queryFn: () => trpc.settings.getBrandTheme.query(), staleTime: 5 * 60 * 1000 })
watch(() => brandTheme.value?.accentColor, (accent) => {
  const variables = Object.entries(accentVariables(accent)).map(([name, value]) => `${name}:${value};`).join('')
  let style = document.getElementById('dv-brand-accent')
  if (!variables) return style?.remove()
  if (!style) {
    style = document.createElement('style')
    style.id = 'dv-brand-accent'
    document.head.appendChild(style)
  }
  style.textContent = `.dv-theme.dv-neutral.dv-client{${variables}}`
}, { immediate: true })

// The link works signed out too, for instance on the phone the email was
// read on, where the guard has sent it to the sign-in page.
watch(
  () => route.query.verificationCode,
  (code) => {
    if (typeof code !== "string" || !code) return
    router.replace({ query: { ...route.query, verificationCode: undefined } })
    trpc.user.verifyEmail
      .mutate(code)
      .then(async () => {
        if (!globalStore.user) {
          toast.success("Your email address is confirmed. Sign in to continue.")
          return
        }
        toast.success("Your email address is confirmed.")
        await globalStore.fetchUser()
      })
      .catch((error) => toast.error(extractErrors(error as Error).message))
  },
  { immediate: true }
)

const resendVerificationEmail = async () => {
  if (!globalStore.user?.id) {
    throw new Error("User not found")
  }
  await trpc.user.resendVerificationEmail.mutate(globalStore.user.id)
}

const editingEmail = ref(false)
const newEmail = ref("")
const emailError = ref<string | null>(null)
const savingEmail = ref(false)

function startEditingEmail() {
  newEmail.value = globalStore.user?.email ?? ""
  emailError.value = null
  editingEmail.value = true
}

async function changeEmail(event: Event) {
  event.preventDefault()
  savingEmail.value = true
  emailError.value = null
  try {
    await trpc.user.changeUnverifiedEmail.mutate(newEmail.value.trim())
    await globalStore.fetchUser()
    editingEmail.value = false
    toast.success("A new confirmation email has been sent.")
  } catch (error) {
    emailError.value = extractErrors(error as Error).message
  } finally {
    savingEmail.value = false
  }
}

</script>

<template>
  <div class="dv-theme" :class="route.meta.layout === 'admin' ? '' : 'dv-neutral dv-client'">
  <main v-if="!globalStore.authChecked">
    <Loader :text="true" />
  </main>
  <LayoutAuth v-else-if="globalStore.user?.mfaSetupRequired">
    <div class="grid gap-4">
      <h1 class="text-lg font-semibold">Set up two-step verification</h1>
      <p class="text-sm">Your role requires a code from an authenticator app in addition to your password.</p>
      <MfaSetup @done="globalStore.fetchUser" />
      <Button type="button" variant="ghost" class="justify-self-start" @click="globalStore.logout">Sign out</Button>
    </div>
  </LayoutAuth>
  <LayoutAuth v-else-if="globalStore.user && !(globalStore.user.approved && globalStore.user.emailVerified)">
    <div v-if="!globalStore.user.emailVerified" class="flex flex-col">
      <p role="status">An email has been sent with a link to confirm your account to: <span class="font-bold">{{
        globalStore.user.email }}</span> </p>
      <p class="text-sm text-neutral-500 mt-2">The link also works if you open it on another device.</p>
      <form v-if="editingEmail" class="grid gap-2 mt-8" @submit="changeEmail">
        <Label for="pending-email">Email address</Label>
        <Input id="pending-email" type="email" v-model="newEmail" autocomplete="email" required autofocus
          :aria-invalid="emailError ? true : undefined" :aria-describedby="emailError ? 'pending-email-error' : undefined" />
        <p v-if="emailError" id="pending-email-error" class="text-sm text-red-600">{{ emailError }}</p>
        <div class="flex gap-2">
          <Button type="submit" :disabled="savingEmail || !newEmail.trim()">Send to this address</Button>
          <Button type="button" variant="ghost" @click="editingEmail = false">Cancel</Button>
        </div>
      </form>
      <div v-else class="text-sm flex flex-col gap-1 mt-8">
        <div>No email? Check your spam folder</div>
        <div class="flex items-center gap-2 flex-nowrap whitespace-nowrap">or
          <AuthResendEmail :onResend="resendVerificationEmail" />
        </div>
        <div class="flex items-center gap-2 flex-nowrap whitespace-nowrap">Wrong address?
          <Button variant="link" class="p-0 text-neutral-500" @click="startEditingEmail">change it</Button>
        </div>
      </div>
      <Button type="button" variant="ghost" class="justify-self-start self-start mt-8" @click="globalStore.logout">Sign out</Button>
    </div>
    <div v-else role="status">
      <div>Please wait until your account is approved.</div>
      <div>
        Your subscription is under review. You will be reached by email when an admin has
        approved your account.
      </div>
    </div>
  </LayoutAuth>
  <LayoutRouter v-else></LayoutRouter>
  <Toaster :neutral="route.meta.layout !== 'admin'" />
  </div>
</template>
