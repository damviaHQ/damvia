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
import Loader from "@/components/Loader.vue"
import { Toaster } from "@/components/ui/sonner"
import { provideGlobalToast } from "@/composables/useGlobalToast"
import LayoutAuth from "@/layouts/LayoutAuth.vue"
import LayoutRouter from "@/layouts/LayoutRouter.vue"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { accentVariables } from "@/lib/brand-color"
import { useQuery } from "@tanstack/vue-query"
import { watch } from "vue"
import { useRoute } from "vue-router"
import { toast } from "vue-sonner"
import "vue3-treeselect-ts/dist/style.css"

const route = useRoute()
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

watch(
  route,
  () => {
    if (route.query.verificationCode) {
      trpc.user.verifyEmail
        .mutate(route.query.verificationCode as string)
        .then(globalStore.fetchUser)
        .catch((error) => toast.error(extractErrors(error as Error).message))
    }
  },
  { immediate: true }
)

const resendVerificationEmail = async () => {
  if (!globalStore.user?.id) {
    throw new Error("User not found")
  }
  await trpc.user.resendVerificationEmail.mutate(globalStore.user.id)
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
    <div v-if="!globalStore.user.emailVerified" role="status" class="flex flex-col">
      <p>An email has been sent with a link to confirm your account to: <span class="font-bold">{{
        globalStore.user.email }}</span> </p>
      <div class="text-sm flex flex-col gap-1 mt-8">
        <div>No email? Check your spam folder</div>
        <div class="flex items-center gap-2 flex-nowrap whitespace-nowrap">or
          <AuthResendEmail :onResend="resendVerificationEmail" />
        </div>
      </div>
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
