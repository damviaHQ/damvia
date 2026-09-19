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
import Loader from "@/components/Loader.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import dayjs from "dayjs"
import { Copy, X } from "lucide-vue-next"
import { computed } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const emit = defineEmits(['close'])

const { data, status, error } = useQuery({
  queryKey: ["userInvitations"],
  queryFn: () => trpc.collection.invitation.getUserInvitations.query(),
})

const isExpired = computed(() => (link: NonNullable<typeof data.value>[number]) => {
  return dayjs(link.expiresAt).isBefore(dayjs())
})

const sortedData = computed(() => {
  if (!data.value) return []
  return [...data.value].sort((a, b) => {
    const creationDiff = dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()
    if (creationDiff !== 0) return creationDiff
    return dayjs(b.expiresAt).valueOf() - dayjs(a.expiresAt).valueOf()
  })
})

async function copyInvitationLink(invitation: NonNullable<typeof data.value>[number]) {
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

async function removeInvitation(invitationId: string) {
  try {
    await trpc.collection.invitation.remove.mutate({ id: invitationId })
    await queryClient.invalidateQueries({ queryKey: ["userInvitations"] })
    toast.success("Invitation removed successfully.")
  } catch (error) {
    toast.error("Failed to remove invitation.")
  }
}

function goToCollection(collectionId: string) {
  router.push(`/collections/${collectionId}`)
  emit('close')
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="links__container flex flex-col gap-4">
    <Table v-if="data && data.length > 0" class="table-fixed text-[13px] [&_td]:px-3 [&_td]:py-3 [&_th]:px-3">
      <TableHeader><TableRow>
        <TableHead class="w-[35%]">Guest / collection</TableHead>
        <TableHead class="w-[24%]">Dates</TableHead>
        <TableHead class="w-[14%]">Status</TableHead>
        <TableHead class="w-[27%]"><span class="sr-only">Actions</span></TableHead>
      </TableRow></TableHeader>
      <TableBody>
        <TableRow v-for="link in sortedData" :key="link.id">
          <TableCell :class="{ 'text-neutral-500': isExpired(link) }">
            <p class="truncate" :title="link.email">{{ link.email }}</p>
            <Button @click="goToCollection(link.collection.id)" variant="link" class="mt-1 h-auto max-w-full justify-start p-0 text-neutral-500" :title="link.collection.name">
              <span class="truncate">{{ link.collection.name }}</span>
            </Button>
          </TableCell>
          <TableCell class="text-xs leading-5 text-neutral-500">
            <p>Created {{ dayjs(link.createdAt).format('D MMM YYYY') }}</p>
            <p>Expires {{ dayjs(link.expiresAt).format('D MMM YYYY') }}</p>
          </TableCell>
          <TableCell><Badge variant="secondary">{{ isExpired(link) ? 'Expired' : 'Active' }}</Badge></TableCell>
          <TableCell>
            <div class="flex flex-col items-start gap-1">
              <Button variant="ghost" size="sm" class="gap-2 px-2" @click="copyInvitationLink(link)" :disabled="isExpired(link)"><Copy class="size-4" />Copy link</Button>
              <Button variant="ghost" size="sm" class="gap-2 px-2 text-destructive" @click="removeInvitation(link.id)"><X class="size-4" />Remove access</Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div v-else>
      <p class="text-sm text-neutral-500">You haven't created any links yet. Once you do, they will appear here.</p>
    </div>
  </div>
</template>
