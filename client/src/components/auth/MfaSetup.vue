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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { extractErrors, trpc } from "@/services/server.ts"
import { computed, ref } from "vue"

const emit = defineEmits<{ done: [] }>()

const setup = ref<{ secret: string, qrSvg: string }>()
const code = ref("")
const recoveryCodes = ref<string[]>([])
const error = ref<string | null>(null)
const busy = ref(false)
const qrSource = computed(() => setup.value ? `data:image/svg+xml;utf8,${encodeURIComponent(setup.value.qrSvg)}` : "")

async function start() {
  error.value = null
  busy.value = true
  try {
    setup.value = await trpc.auth.mfaSetup.mutate()
  } catch (caught) {
    error.value = extractErrors(caught as Error).message
  } finally {
    busy.value = false
  }
}

async function confirm(event: Event) {
  event.preventDefault()
  error.value = null
  busy.value = true
  try {
    const result = await trpc.auth.mfaEnable.mutate({ code: code.value })
    recoveryCodes.value = result.recoveryCodes
  } catch (caught) {
    error.value = extractErrors(caught as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="grid max-w-lg gap-4">
    <template v-if="recoveryCodes.length">
      <p class="font-medium">Two-step verification is on.</p>
      <p class="text-sm">Keep these recovery codes somewhere safe. Each one signs you in once if you lose your authenticator app. They are shown only now.</p>
      <ul class="grid grid-cols-2 gap-2 font-mono text-sm" aria-label="Recovery codes">
        <li v-for="recovery in recoveryCodes" :key="recovery">{{ recovery }}</li>
      </ul>
      <Button type="button" class="justify-self-start" @click="emit('done')">I have saved my codes</Button>
    </template>
    <template v-else-if="setup">
      <p class="text-sm">Scan this code with an authenticator app, then enter the 6-digit code it shows.</p>
      <img :src="qrSource" alt="QR code for your authenticator app" class="h-48 w-48" />
      <p class="text-sm">Can't scan it? Enter this key: <code class="break-all font-mono">{{ setup.secret }}</code></p>
      <form class="grid gap-3" @submit="confirm">
        <FieldGroup>
          <Label for="mfa-setup-code">Code</Label>
          <Input id="mfa-setup-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
            :aria-invalid="error ? true : undefined" :aria-describedby="error ? 'mfa-setup-error' : undefined" />
        </FieldGroup>
        <p v-if="error" id="mfa-setup-error" role="alert" class="text-sm font-medium text-destructive">{{ error }}</p>
        <Button type="submit" class="justify-self-start" :disabled="busy || code.length !== 6">Turn on</Button>
      </form>
    </template>
    <template v-else>
      <p class="text-sm">Two-step verification asks for a code from an authenticator app each time you sign in with your password or an email link.</p>
      <p v-if="error" role="alert" class="text-sm font-medium text-destructive">{{ error }}</p>
      <Button type="button" class="justify-self-start" :disabled="busy" @click="start">Set up two-step verification</Button>
    </template>
  </div>
</template>
