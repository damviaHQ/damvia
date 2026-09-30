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
import { accountGroupTitleClasses, accountListClasses } from "@/components/account/accountStyles"
import MfaSetup from "@/components/auth/MfaSetup.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { extractErrors, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ref } from "vue"

const toast = useGlobalToast()
const globalStore = useGlobalStore()
const queryClient = useQueryClient()
const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: () => trpc.auth.sessions.query() })
const code = ref("")
const error = ref<string | null>(null)
const recoveryCodes = ref<string[]>([])

const methods: Record<string, string> = {
  password: 'Password', email_link: 'Email link', invitation: 'Invitation link', sso: 'Single sign-on',
  password_reset: 'Password reset', sign_up: 'Sign-up', legacy: 'Earlier sign-in',
}

function describeDevice(userAgent: string | null) {
  if (!userAgent) return 'Unknown device'
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser'
  const system = /iPhone|iPad/.test(userAgent) ? 'iOS' : /Android/.test(userAgent) ? 'Android'
    : /Mac OS X/.test(userAgent) ? 'macOS' : /Windows/.test(userAgent) ? 'Windows' : /Linux/.test(userAgent) ? 'Linux' : ''
  return system ? `${browser} on ${system}` : browser
}

const formatDate = (value: string | Date) => new Date(value).toLocaleString()

async function refreshSessions() {
  await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] })
}

async function revoke(id: string) {
  await trpc.auth.revokeSession.mutate({ id })
  await refreshSessions()
}

async function revokeOthers() {
  await trpc.auth.revokeOtherSessions.mutate()
  toast.success("Signed out of every other session.")
  await refreshSessions()
}

async function withCode(action: 'disable' | 'regenerate') {
  error.value = null
  try {
    if (action === 'disable') {
      await trpc.auth.mfaDisable.mutate({ code: code.value })
      toast.success("Two-step verification is off.")
      await globalStore.fetchUser()
    } else {
      recoveryCodes.value = (await trpc.auth.mfaRegenerateRecoveryCodes.mutate({ code: code.value })).recoveryCodes
    }
    code.value = ""
  } catch (caught) {
    error.value = extractErrors(caught as Error).message
  }
}

async function mfaTurnedOn() {
  await globalStore.fetchUser()
  await refreshSessions()
}
</script>

<template>
  <div class="grid gap-10">
    <section class="grid gap-4" aria-labelledby="security-mfa-title">
      <h2 id="security-mfa-title" :class="accountGroupTitleClasses">Two-step verification</h2>
      <MfaSetup v-if="!globalStore.user?.mfaEnabled" @done="mfaTurnedOn" />
      <div v-else class="grid max-w-lg gap-4">
        <p class="text-sm text-pretty">On. Enter a code from your authenticator app, or a recovery code, to change it.</p>
        <FieldGroup>
          <Label for="security-mfa-code">Code</Label>
          <Input id="security-mfa-code" v-model="code" autocomplete="one-time-code"
            :aria-invalid="error ? true : undefined" :aria-describedby="error ? 'security-mfa-error' : undefined" />
        </FieldGroup>
        <p v-if="error" id="security-mfa-error" role="alert" class="text-sm font-medium text-destructive">{{ error }}</p>
        <div class="flex flex-wrap gap-3">
          <Button type="button" variant="outline" :disabled="!code" @click="withCode('regenerate')">New recovery codes</Button>
          <Button type="button" variant="destructive" :disabled="!code" @click="withCode('disable')">Turn off</Button>
        </div>
        <template v-if="recoveryCodes.length">
          <p class="text-sm">Your previous recovery codes no longer work. Keep these somewhere safe.</p>
          <ul class="grid grid-cols-2 gap-2 font-mono text-sm" aria-label="Recovery codes">
            <li v-for="recovery in recoveryCodes" :key="recovery">{{ recovery }}</li>
          </ul>
        </template>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="security-sessions-title">
      <h2 id="security-sessions-title" :class="accountGroupTitleClasses">Where you're signed in</h2>
      <ul :class="accountListClasses" class="-mt-4">
        <li v-for="session in sessions.data.value" :key="session.id"
          class="flex flex-wrap items-center justify-between gap-3 py-3.5">
          <div class="grid gap-0.5">
            <span class="text-body font-medium">{{ describeDevice(session.userAgent) }}<span v-if="session.current" class="text-neutral-500"> · this browser</span></span>
            <span class="text-caption text-neutral-500">{{ methods[session.method] ?? session.method }} · signed in {{ formatDate(session.createdAt) }} · last active {{ formatDate(session.lastSeenAt) }}</span>
          </div>
          <Button v-if="!session.current" type="button" variant="ghost" size="sm" @click="revoke(session.id)">Sign out</Button>
        </li>
      </ul>
      <Button v-if="(sessions.data.value?.length ?? 0) > 1" type="button" variant="outline" class="justify-self-start" @click="revokeOthers">Sign out everywhere else</Button>
    </section>
  </div>
</template>
