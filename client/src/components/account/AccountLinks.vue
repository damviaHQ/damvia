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
import { accountDisclosureClasses, accountDisclosureSummaryClasses, accountGroupTitleClasses, accountListClasses } from "@/components/account/accountStyles"
import Loader from "@/components/Loader.vue"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import dayjs from "dayjs"
import { ChevronRight, Link as LinkIcon, UserRound } from "@lucide/vue"
import { computed, ref } from "vue"

const toast = useGlobalToast()
const queryClient = useQueryClient()

const { data, status, error } = useQuery({
  queryKey: ["userInvitations"],
  queryFn: () => trpc.collection.invitation.getUserInvitations.query(),
})
type Invitation = NonNullable<typeof data.value>[number]

const isExpired = (link: Invitation) => dayjs(link.expiresAt).isBefore(dayjs())
const sorted = computed(() => [...(data.value ?? [])].sort((a, b) =>
  dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf() || dayjs(b.expiresAt).valueOf() - dayjs(a.expiresAt).valueOf()))
const active = computed(() => sorted.value.filter(link => !isExpired(link)))
const expired = computed(() => sorted.value.filter(isExpired))
const groups = computed(() => [
  { id: "active", title: "Active", links: active.value },
  { id: "expired", title: "Expired", links: expired.value },
].filter(group => group.links.length))

const removing = ref<Invitation | null>(null)
const confirmOpen = ref(false)

function confirmRemoval(invitation: Invitation) {
  removing.value = invitation
  confirmOpen.value = true
}

async function copyInvitationLink(invitation: Invitation) {
  const url = new URL(window.location.href)
  url.pathname = `/collections/${invitation.collection.id}`
  const searchParams = new URLSearchParams()
  searchParams.set(
    "auth_params",
    window.btoa(
      JSON.stringify({
        magicLink: true,
        email: invitation.email,
        collectionName: invitation.collection.name,
        collectionId: invitation.collection.id,
      })
    )
  )
  url.search = searchParams.toString()
  url.hash = ""
  await navigator.clipboard.writeText(url.toString())
  toast.success("Invitation link copied!")
}

async function removeInvitation() {
  const invitation = removing.value
  if (!invitation) return
  try {
    await trpc.collection.invitation.remove.mutate({ id: invitation.id })
    await queryClient.invalidateQueries({ queryKey: ["userInvitations"] })
    toast.success("Access removed.")
  } catch {
    toast.error("Failed to remove access.")
  }
}
</script>

<template>
  <Loader v-if="status === 'pending'" :text="true" />
  <p v-else-if="status === 'error'" role="alert" class="text-body text-destructive">{{ error?.message }}</p>
  <div v-else-if="sorted.length" class="grid gap-8">
    <component :is="group.id === 'expired' ? 'details' : 'section'" v-for="group in groups" :key="group.id"
      :class="group.id === 'expired' && accountDisclosureClasses" :aria-labelledby="group.id === 'active' ? 'links-active' : undefined">
      <summary v-if="group.id === 'expired'" :class="accountDisclosureSummaryClasses">
        <ChevronRight class="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        Expired <span class="font-normal tabular-nums">{{ group.links.length }}</span>
      </summary>
      <h2 v-else id="links-active" :class="accountGroupTitleClasses">Active <span class="font-normal tabular-nums">{{ group.links.length }}</span></h2>
      <ul :class="accountListClasses">
        <li v-for="link in group.links" :key="link.id" data-link-row class="flex items-center gap-3 py-3.5">
          <span class="grid size-10 shrink-0 place-items-center bg-neutral-100 text-neutral-500" :class="group.id === 'expired' && 'opacity-60'" aria-hidden="true">
            <UserRound class="size-5" stroke-width="1.75" />
          </span>
          <div class="min-w-0 flex-1">
            <router-link :to="`/collections/${link.collection.id}`" class="block truncate text-body font-medium hover:underline underline-offset-4"
              :class="group.id === 'expired' ? 'text-neutral-500' : 'text-neutral-900'" :title="link.collection.name">{{ link.collection.name }}</router-link>
            <p class="truncate text-caption text-neutral-500">
              <span :title="link.email">{{ link.email }}</span> · {{ group.id === 'expired' ? 'Expired' : 'Expires' }} {{ dayjs(link.expiresAt).format("D MMM YYYY") }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <TooltipProvider v-if="group.id === 'active'" :delay-duration="300">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button type="button" variant="ghost" size="icon-sm" :aria-label="`Copy invitation link for ${link.email}`" @click="copyInvitationLink(link)"><LinkIcon /></Button>
                </TooltipTrigger>
                <TooltipContent>Copy invitation link</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button type="button" variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="confirmRemoval(link)">Remove access</Button>
          </div>
        </li>
      </ul>
    </component>
  </div>
  <div v-else class="grid gap-2 py-6">
    <p class="text-body text-neutral-900">No shared links yet.</p>
    <p class="text-body text-neutral-500">When you invite a guest to a collection, the invitation appears here.</p>
  </div>

  <AlertDialog v-model:open="confirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove access?</AlertDialogTitle>
        <AlertDialogDescription>{{ removing?.email }} will no longer be able to open “{{ removing?.collection.name }}”.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="removeInvitation">Remove access</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
