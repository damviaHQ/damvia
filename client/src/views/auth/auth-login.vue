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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import AuthResendEmail from "@/components/AuthResendEmail.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { apiBase, extractErrors, trpc, type RouterOutput } from "@/services/server.ts"
import { TRPCClientError } from "@trpc/client"
import { useGlobalStore } from "@/stores/globalStore"
import { Mail } from "@lucide/vue"
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

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

const mfaChallenge = ref<string | null>((window.history.state?.mfaChallenge as string | undefined) ?? null)
const mfaCode = ref("")
const redirectAfterSignIn = ref<{ name: string, params?: Record<string, string> }>({ name: "home" })

const isFormValid = computed(() => {
  return emailRegex.test(form.value.email) && acceptedPolicies.value
})

async function finishSignIn(result: RouterOutput['auth']['login']) {
  if (result.status === 'email_sent') {
    emailSent.value = true
  } else if (result.status === 'mfa_required') {
    mfaChallenge.value = result.challenge
  } else {
    await globalStore.signedIn()
    router.push(redirectAfterSignIn.value)
  }
}

function showLinkError(error: Error) {
  formRootError.value = extractErrors(error).message
}

// Email links carry a single-use token; it is removed from the address bar
// before it is exchanged so it does not linger in history.
function exchangeEmailLink() {
  const link = route.query.link as string | undefined
  const invite = route.query.invite as string | undefined
  if (!link && !invite) return
  router.replace({ query: { ...route.query, link: undefined, invite: undefined } })
  if (invite) {
    trpc.auth.exchangeInvitation.mutate({ token: invite })
      .then((result) => {
        redirectAfterSignIn.value = { name: "collection", params: { id: result.collectionId } }
        return finishSignIn(result)
      })
      .catch(showLinkError)
  } else if (link) {
    trpc.auth.exchangeLink.mutate({ token: link }).then(finishSignIn).catch(showLinkError)
  }
}

exchangeEmailLink()

const ssoErrors: Record<string, string> = {
  no_account: "There is no account for this identity yet. Ask an administrator to invite you.",
  email_unverified: "Your identity provider did not confirm your email address, so it cannot be linked to an account.",
  conflict: "This email address is already linked to another single sign-on identity.",
  suspended: "This account is suspended. Contact an administrator.",
  failed: "Single sign-on did not complete. Please try again.",
}
if (typeof route.query.sso_error === "string") {
  formRootError.value = ssoErrors[route.query.sso_error] ?? ssoErrors.failed
}
const ssoOnly = computed(() => !!globalStore.env?.sso?.only)

function startSingleSignOn() {
  const url = new URL(`${apiBase}/v1/auth/oidc/start`)
  if (redirectAfterSignIn.value.name !== "home") url.searchParams.set("redirect", router.resolve(redirectAfterSignIn.value).fullPath)
  window.location.assign(url.toString())
}

async function onVerifyMfa(event: Event) {
  event.preventDefault()
  if (!mfaChallenge.value) return
  formRootError.value = null
  trpc.auth.verifyMfa
    .mutate({ challenge: mfaChallenge.value, code: mfaCode.value })
    .then(finishSignIn)
    .catch((error) => {
      if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') mfaChallenge.value = null
      formRootError.value = extractErrors(error).message
    })
}

watch(
  route,
  () => {
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

  trpc.auth.login
    .mutate({ ...form.value, magicLink: authParams.value?.magicLink })
    .then(finishSignIn)
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
  <form v-else-if="mfaChallenge" @submit="onVerifyMfa" class="space-y-4">
    <div class="font-semibold">Two-step verification</div>
    <p class="text-sm">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
    <FieldGroup>
      <Label for="mfa-code">Code</Label>
      <Input id="mfa-code" v-model="mfaCode" autocomplete="one-time-code" autofocus
        :aria-invalid="formRootError ? true : undefined" :aria-describedby="formRootError ? 'login-error' : undefined" />
    </FieldGroup>
    <div v-if="formRootError" id="login-error" role="alert" class="text-sm font-medium text-destructive">
      {{ formRootError }}
    </div>
    <Button type="submit" class="w-full" :disabled="!mfaCode.trim()">Verify</Button>
  </form>
  <div v-else-if="ssoOnly" class="space-y-4">
    <div v-if="formRootError" id="login-error" role="alert" class="text-sm font-medium text-destructive">
      {{ formRootError }}
    </div>
    <Button type="button" class="w-full" @click="startSingleSignOn">{{ globalStore.env?.sso?.label }}</Button>
    <p class="text-xs text-neutral-500">Invited as a guest? Open the link in your invitation email.</p>
  </div>
  <form v-else @submit="onSubmit" class="space-y-4">
    <div v-if="authParams.collectionName" class="font-semibold mb-4">
      Access to {{ authParams.collectionName }} collection
    </div>
    <FieldGroup>
      <Label for="email">Your email</Label>
      <Input id="email" type="email" v-model="form.email" placeholder="name@domain.com" autocomplete="email" :aria-invalid="formRootError ? true : undefined" :aria-describedby="formRootError ? 'login-error' : undefined" />
    </FieldGroup>
    <FieldGroup v-if="
      globalStore.env &&
      !globalStore.env.passwordLessAuthentication &&
      !authParams.magicLink" >
      <Label for="password">Password</Label>
      <Input id="password" type="password" v-model="form.password" placeholder="My password" autocomplete="current-password" :aria-invalid="formRootError ? true : undefined" :aria-describedby="formRootError ? 'login-error' : undefined" />
    </FieldGroup>
    <div v-if="formRootError" id="login-error" role="alert" class="text-sm font-medium text-destructive">
      {{ formRootError }}
    </div>
    <div class="flex flex-col pt-5">
      <div class="flex items-center space-x-2 mb-3">
        <Checkbox id="acceptPolicies" v-model="acceptedPolicies" />
        <Label for="acceptPolicies">
          I accept the
          <router-link to="/privacy-policy" class="underline">Privacy and Cookie
            Policy</router-link>.
        </Label>
      </div>
      <p v-if="!isFormValid" id="login-requirements" class="mb-2 text-xs text-neutral-500">
        {{ emailRegex.test(form.email) ? "Accept the Privacy and Cookie Policy to log in." : "Enter a valid email and accept the Privacy and Cookie Policy to log in." }}
      </p>
      <Button type="submit" class="w-full" :disabled="!isFormValid" :aria-describedby="isFormValid ? undefined : 'login-requirements'"> Log in </Button>
      <Button v-if="globalStore.env?.sso" type="button" variant="outline" class="w-full mt-2" @click="startSingleSignOn">{{ globalStore.env.sso.label }}</Button>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-2" v-if="!authParams.magicLink">
        <Button as-child variant="link" class="px-0 text-xs">
          <router-link :to="{ name: 'sign-up' }">No account? Register now</router-link>
        </Button>
        <Button as-child variant="link" class="px-0 text-xs" v-if="globalStore.env && !globalStore.env.passwordLessAuthentication">
          <router-link :to="{ name: 'password-reset' }"> Reset password </router-link>
        </Button>
      </div>
    </div>
  </form>
</template>
