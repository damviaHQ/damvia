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
import { Button } from "@/components/ui/button"
import { extractErrors, trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"

// Opening the link changes nothing: mail scanners follow links on their own.
// Only the button below unsubscribes.
const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const { data, status, error } = useQuery({
  queryKey: computed(() => ['newsletter-subscription', token.value]),
  queryFn: () => trpc.newsletter.subscription.query({ token: token.value }),
  enabled: computed(() => token.value.length > 0),
  retry: false,
})
const subscribed = ref<boolean | null>(null)
watch(data, () => { if (data.value) subscribed.value = data.value.subscribed }, { immediate: true })
const busy = ref(false)
const failure = ref('')
async function unsubscribe() {
  busy.value = true
  failure.value = ''
  try {
    subscribed.value = (await trpc.newsletter.unsubscribe.mutate({ token: token.value })).subscribed
  } catch (caught) {
    failure.value = extractErrors(caught as Error).message
  } finally { busy.value = false }
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
    <template v-if="!token || status === 'error'">
      <h1 class="text-2xl font-semibold">This link does not work</h1>
      <p class="text-sm text-neutral-600">{{ token ? extractErrors(error as Error).message : 'The unsubscribe link is incomplete.' }} Links work for 90 days, and stop once you change your choice in your profile. Sign in to change it there.</p>
    </template>
    <p v-else-if="status === 'pending'" role="status">Loading…</p>
    <template v-else-if="data">
      <h1 class="text-2xl font-semibold">{{ subscribed ? 'Unsubscribe from newsletters?' : 'You are unsubscribed' }}</h1>
      <p class="text-sm text-neutral-600" aria-live="polite">
        <template v-if="subscribed">{{ data.email }} will stop receiving newsletters. Emails about your account, such as password resets and shared downloads, still arrive.</template>
        <template v-else>{{ data.email }} no longer receives newsletters. Emails about your account still arrive. To receive them again, sign in and tick <strong>Receive news and updates</strong> in your profile.</template>
      </p>
      <Button v-if="subscribed" :disabled="busy" @click="unsubscribe">{{ busy ? 'Unsubscribing…' : 'Unsubscribe' }}</Button>
      <Button v-else variant="outline" as-child><router-link :to="{ name: 'account' }">Open my profile</router-link></Button>
      <p v-if="failure" class="text-sm text-red-700" role="alert">{{ failure }}</p>
    </template>
  </div>
</template>
