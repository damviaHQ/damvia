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
import Loader from "@/components/Loader.vue"
import { Toaster } from "@/components/ui/sonner"
import { provideGlobalToast } from "@/composables/useGlobalToast"
import LayoutAuth from "@/layouts/LayoutAuth.vue"
import LayoutRouter from "@/layouts/LayoutRouter.vue"
import { trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { watch } from "vue"
import { useRoute } from "vue-router"
import "vue3-treeselect-ts/dist/style.css"

const route = useRoute()
const globalStore = useGlobalStore()
provideGlobalToast()

watch(
  route,
  () => {
    if (route.query.verificationCode) {
      trpc.user.verifyEmail
        .mutate(route.query.verificationCode as string)
        .then(globalStore.fetchUser)
        .catch(console.error)
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
  <div v-if="globalStore.isAuthenticated && !globalStore.user">
    <Loader :text="true" />
  </div>
  <LayoutAuth v-else-if="globalStore.user && !(globalStore.user.approved && globalStore.user.emailVerified)">
    <div v-if="!globalStore.user.emailVerified" class="flex flex-col">
      <p>An email has been sent with a link to confirm your account to: <span class="font-bold">{{
        globalStore.user.email }}</span> </p>
      <div class="text-sm flex flex-col gap-1 mt-8">
        <div>No email? Check your spam folder</div>
        <div class="flex items-center gap-2 flex-nowrap whitespace-nowrap">or
          <AuthResendEmail :onResend="resendVerificationEmail" />
        </div>
      </div>
    </div>
    <div v-else>
      <div>Please wait until your account is approved.</div>
      <div>
        Your subscription is under review. You will be reached by email when an admin has
        approved your account.
      </div>
    </div>
  </LayoutAuth>
  <LayoutRouter v-else></LayoutRouter>
  <Toaster />
</template>
