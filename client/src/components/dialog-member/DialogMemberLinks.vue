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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import dayjs from "dayjs"
import { Copy, X } from "lucide-vue-next"
import { computed } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const globalStore = useGlobalStore()
const emit = defineEmits(['close'])

const { data, status, error } = useQuery({
  queryKey: ["userInvitations"],
  queryFn: () => trpc.collection.invitation.getUserInvitations.query(),
})

const isExpired = computed(() => (link: typeof data.value[0]) => {
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

async function copyInvitationLink(invitation: typeof data.value[0]) {
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
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="links__container flex flex-col gap-4">
    <p class="text-sm text-neutral-500">
      This is the list of all invitations you have created. If a guest cannot access a collection, check if the link has
      expired. You can navigate to
      the collection and create a new invitation.
    </p>
    <Table v-if="data && data.length > 0">
      <TableHeader>
        <TableRow>
          <TableHead>Creation</TableHead>
          <TableHead>Expiration</TableHead>
          <TableHead>Guest Email</TableHead>
          <TableHead>Collection</TableHead>
          <TableHead v-if="globalStore.user?.role === 'admin'"></TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="link in sortedData" :key="link.id">
          <TableCell :class="{ 'opacity-50': isExpired(link) }">
            <div class="min-w-max">
              {{ dayjs(link.createdAt).format('YYYY-MM-DD') }}
            </div>
          </TableCell>
          <TableCell :class="{ 'opacity-50': isExpired(link) }">
            <div class="min-w-max">
              {{ dayjs(link.expiresAt).format('YYYY-MM-DD') }}
            </div>
          </TableCell>
          <TableCell :class="{ 'opacity-50': isExpired(link) }">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger class="cursor-default">
                  <div class="max-w-[15rem] truncate">
                    {{ link.email }}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ link.email }}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
          <TableCell :class="{ 'opacity-50': isExpired(link) }">
            <Button @click="goToCollection(link.collection.id)" variant="link" class="px-0 text-primary text-left">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div class="max-w-[15rem] truncate">
                      {{ link.collection.name }}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p> {{ link.collection.name }}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Button>
          </TableCell>
          <TableCell :class="{ 'opacity-50': isExpired(link) }">
            <Badge v-if="!isExpired(link) && globalStore.user?.role === 'admin'"
              :class="link.collection.public ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'">
              {{ link.collection.public ? 'Public' : 'Private' }}
            </Badge>
            <Badge v-else-if="isExpired(link)" class="bg-neutral-500 hover:bg-neutral-600">Expired</Badge>
          </TableCell>
          <TableCell>
            <div class="flex gap-5 items-center min-w-max">
              <Button variant="outline" @click="copyInvitationLink(link)" :disabled="isExpired(link)">
                <Copy class="w-4 h-4 mr-1" />
                Copy link
              </Button>
              <Button variant="link" @click="removeInvitation(link.id)"
                class="flex justify-start px-0 text-destructive">
                <X class="w-4 h-4 mr-1" />
                Remove access
              </Button>
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
