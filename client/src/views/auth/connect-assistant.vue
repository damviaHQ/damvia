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
import { extractErrors, trpc, type RouterOutput } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"

// The page where a person lets an AI assistant (Claude, ChatGPT...) reach the
// library on their behalf. The assistant sends them here; Damvia sends them
// back with a one-minute code, or with a refusal.
const route = useRoute()
const globalStore = useGlobalStore()
const keys = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const
const request = Object.fromEntries(keys.flatMap((key) => typeof route.query[key] === 'string' ? [[key, route.query[key] as string]] : []))

const details = ref<RouterOutput['oauth']['describe'] | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)

const scopeLabels: Record<string, string> = {
  'damvia.read': 'Search and view the collections, products and files you can see, including their previews',
  'damvia.download': 'Prepare downloads for you; licence terms are always shown to you first',
  'damvia.collections': 'Create and change your own collections',
  'damvia.share': 'Share your collections, after you confirm',
  'damvia.admin': 'Use the administration tools your role allows',
}
const refusals: Record<string, string> = {
  guest: 'Guest accounts cannot connect an AI assistant.',
  unapproved: 'This account is not approved yet, so it cannot connect an AI assistant.',
}

const library = computed(() => globalStore.env?.appName ?? 'Damvia')

onMounted(async () => {
  try {
    details.value = await trpc.oauth.describe.query(request)
    if (details.value.errorRedirect) window.location.assign(details.value.errorRedirect)
  } catch (cause) {
    error.value = extractErrors(cause as Error).message || 'This connection link is not valid. Start again from your assistant.'
  }
})

async function answer(allow: boolean) {
  busy.value = true
  try {
    const { redirectTo } = allow ? await trpc.oauth.approve.mutate(request) : await trpc.oauth.deny.mutate(request)
    window.location.assign(redirectTo)
  } catch (cause) {
    error.value = extractErrors(cause as Error).message
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">Connect an AI assistant</h1>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-else-if="!details" class="text-sm text-neutral-500" aria-live="polite">Checking the request…</p>
    <template v-else-if="details.refusal">
      <p role="alert" class="text-sm">{{ refusals[details.refusal] }}</p>
    </template>
    <template v-else-if="!details.errorRedirect">
      <div class="flex items-center gap-3">
        <img v-if="details.client.logoUri" :src="details.client.logoUri" alt="" class="size-10 object-contain" referrerpolicy="no-referrer" />
        <p class="text-sm">
          <strong>{{ details.client.name }}</strong> asks to use {{ library }} on behalf of
          <strong>{{ globalStore.user?.email }}</strong>.
        </p>
      </div>
      <p class="text-sm text-neutral-600">After you agree, you return to <strong>{{ details.client.returnsTo }}</strong>. Only continue if that is your assistant.</p>
      <div>
        <p class="text-sm font-medium">The assistant will be able to:</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li v-for="scope in details.scopes" :key="scope">{{ scopeLabels[scope] ?? scope }}</li>
        </ul>
      </div>
      <p class="text-sm text-neutral-600">It sees only what you can see. You can end this connection at any time in Account, Security.</p>
      <div class="flex items-center gap-3">
        <Button type="button" :disabled="busy" @click="answer(true)">Allow</Button>
        <Button type="button" variant="outline" :disabled="busy" @click="answer(false)">Cancel</Button>
      </div>
    </template>
  </div>
</template>
