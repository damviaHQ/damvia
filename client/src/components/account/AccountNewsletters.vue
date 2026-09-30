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
import { accountGroupTitleClasses } from "@/components/account/accountStyles"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useGlobalStore } from "@/stores/globalStore"
import { extractErrors, trpc } from "@/services/server"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ref } from "vue"

const toast = useGlobalToast()
const globalStore = useGlobalStore()
const queryClient = useQueryClient()
const { data } = useQuery({ queryKey: ['newsletter-subscription-me'], queryFn: () => trpc.newsletter.mySubscription.query() })
const saving = ref(false)

async function change(subscribed: boolean | 'indeterminate') {
  saving.value = true
  try {
    await trpc.newsletter.setMySubscription.mutate({ subscribed: subscribed === true })
    await queryClient.invalidateQueries({ queryKey: ['newsletter-subscription-me'] })
    toast.success(subscribed === true ? 'You will receive news and updates' : 'You will no longer receive news and updates')
  } catch (error) {
    toast.error(extractErrors(error as Error).message)
  } finally { saving.value = false }
}
</script>

<template>
  <section v-if="data" aria-labelledby="profile-newsletters" class="grid gap-4">
    <h2 id="profile-newsletters" :class="accountGroupTitleClasses">Email communication</h2>
    <p v-if="data.bouncedAt" class="max-w-2xl border border-amber-300 bg-amber-50 p-3 text-body text-amber-900" role="status">
      Emails to your address could not be delivered<template v-if="data.bounceReason"> ({{ data.bounceReason }})</template>, so news and updates are paused. Check the address above, or tick the box below once it works again.
    </p>
    <div class="flex max-w-2xl items-start gap-3">
      <Checkbox id="newsletters-subscribed" :model-value="data.subscribed && !data.bouncedAt" :disabled="saving" class="mt-0.5" aria-describedby="newsletters-help" @update:model-value="change" />
      <div class="grid gap-1">
        <Label for="newsletters-subscribed">Receive news and updates from {{ globalStore.env?.appName ?? 'us' }}</Label>
        <p id="newsletters-help" class="text-body text-neutral-600">Announcements and newsletters. Emails about your account, such as password resets and shared downloads, always arrive. Changing this also ends the unsubscribe links in emails you already received.</p>
      </div>
    </div>
  </section>
</template>
