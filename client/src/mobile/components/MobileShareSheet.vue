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
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui"
import { Copy, Send, X } from "@lucide/vue"
import dayjs from "dayjs"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { invitationLink } from "@/utils/invitationLink"

const props = defineProps<{ collectionId: string, collectionName: string }>()
const open = defineModel<boolean>("open", { default: false })
const router = useRouter()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const email = ref("")
const expiresAt = ref("")
const busy = ref(false)
const error = ref("")

// Invitations belong to the collection; the reader list comes from the same
// query as the collection screen, which only editors receive.
const { data: collection } = useQuery({
  enabled: open,
  queryKey: computed(() => ["collection", props.collectionId]),
  queryFn: () => trpc.collection.findById.query(props.collectionId),
})
const invitations = computed(() => collection.value?.invitations ?? [])
watch(open, (value) => {
  if (!value) return
  email.value = ""
  error.value = ""
  expiresAt.value = dayjs().add(30, "day").format("YYYY-MM-DD")
})

function linkFor(address: string) {
  const path = router.resolve({ name: "collection", params: { id: props.collectionId } }).href
  return invitationLink(window.location.origin, path, { email: address, collectionId: props.collectionId, collectionName: props.collectionName })
}
async function copyLink(address: string) {
  await navigator.clipboard.writeText(linkFor(address))
  toast.success("Invitation link copied")
}
async function invite(sendEmail: boolean) {
  error.value = ""
  if (!dayjs(expiresAt.value).isAfter(dayjs().add(1, "day").startOf("day"))) {
    error.value = "Choose an expiry date after tomorrow."
    return
  }
  busy.value = true
  try {
    await trpc.collection.invitation.create.mutate({ collectionId: props.collectionId, email: email.value, expiresAt: expiresAt.value as unknown as Date, sendEmail })
    await queryClient.invalidateQueries({ queryKey: ["collection", props.collectionId] })
    if (sendEmail) toast.success("Invitation sent")
    else await copyLink(email.value)
    email.value = ""
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    busy.value = false
  }
}
async function remove(id: string) {
  try {
    await trpc.collection.invitation.remove.mutate({ id })
    await queryClient.invalidateQueries({ queryKey: ["collection", props.collectionId] })
    toast.success("Invitation removed")
  } catch (err) {
    toast.error((err as Error).message)
  }
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40" />
      <DialogContent class="fixed inset-x-0 bottom-0 z-50 grid max-h-[92dvh] grid-rows-[auto_auto_1fr] rounded-t-[var(--dv-radius-xl)] bg-[var(--dv-surface-panel)] text-base dv-theme dv-neutral dv-client">
        <header class="flex items-center gap-2 border-b border-[var(--dv-color-line)] px-4 py-3">
          <DialogTitle class="flex-1 truncate text-[17px] font-semibold">Share {{ collectionName }}</DialogTitle>
          <button type="button" class="-mr-3 grid size-11 place-items-center" aria-label="Close" @click="open = false"><X :size="22" aria-hidden="true" /></button>
        </header>
        <DialogDescription class="sr-only">Invite someone by email. They sign in with a link and can view and download this collection until the invitation expires.</DialogDescription>
        <form class="grid gap-3 px-4 py-4" @submit.prevent="invite(true)">
          <label class="grid gap-1"><span class="text-sm font-medium">Email</span>
            <input v-model="email" type="email" required autocomplete="email" inputmode="email" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3 text-base" />
          </label>
          <label class="grid gap-1"><span class="text-sm font-medium">Access until</span>
            <input v-model="expiresAt" type="date" required class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3 text-base" />
          </label>
          <p v-if="error" role="alert" class="text-sm text-[var(--dv-color-danger)]">{{ error }}</p>
          <div class="grid grid-cols-2 gap-2">
            <Button type="submit" class="min-h-12" :disabled="busy || !email"><Send :size="18" aria-hidden="true" />Send invite</Button>
            <Button type="button" variant="outline" class="min-h-12" :disabled="busy || !email" @click="invite(false)"><Copy :size="18" aria-hidden="true" />Copy link</Button>
          </div>
        </form>
        <section class="overflow-y-auto border-t border-[var(--dv-color-line)] pb-[max(12px,env(safe-area-inset-bottom))]" aria-label="People invited">
          <h2 class="px-4 pt-3 pb-1 text-sm font-semibold text-[var(--dv-text-secondary)]">Invited ({{ invitations.length }})</h2>
          <div v-for="invitation in invitations" :key="invitation.id" class="flex items-center gap-2 border-b border-[var(--dv-color-line)] px-4 py-2">
            <div class="min-w-0 flex-1">
              <p class="truncate">{{ invitation.email }}</p>
              <p class="text-sm text-[var(--dv-text-secondary)]">Until {{ dayjs(invitation.expiresAt).format("D MMM YYYY") }}</p>
            </div>
            <button type="button" class="grid size-11 place-items-center" :aria-label="`Copy link for ${invitation.email}`" @click="copyLink(invitation.email)"><Copy :size="18" aria-hidden="true" /></button>
            <button type="button" class="min-h-11 px-2 text-[var(--dv-color-danger)]" @click="remove(invitation.id)">Remove</button>
          </div>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
