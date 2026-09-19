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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGlobalToast } from "@/composables/useGlobalToast.ts"
import { extractErrors, RouterOutput, trpc } from "@/services/server.ts"
import { useQueryClient } from "@tanstack/vue-query"
import dayjs from "dayjs"
import { Copy, Link, Send, XCircle } from "lucide-vue-next"
import { computed, onMounted, ref } from "vue"

type Collection = RouterOutput["collection"]["findById"]
type Invitation = Collection["invitations"][number]

const props = defineProps<{ modelValue: boolean; collection: Collection }>()
const emit = defineEmits<{ (e: "update:modelValue", isOpen: boolean): void }>()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const form = ref<{ email?: string; expiresAt?: string }>({})
const formErrors = ref<Record<string, string>>({})

const invitations = computed(() => props.collection.invitations || [])

function getDefaultExpiryDate() {
  const result = new Date()
  result.setDate(result.getDate() + 30)
  return result.toISOString().split("T")[0]
}

function resetForm() {
  form.value = { email: "", expiresAt: getDefaultExpiryDate() }
  formErrors.value = {}
}

function isValidExpiryDate(date: string): boolean {
  const expiryDate = new Date(date)
  return dayjs(expiryDate).isAfter(dayjs().add(1, "day").startOf("day"))
}

async function createInvitation(sendEmail: boolean) {
  if (!isValidExpiryDate(form.value.expiresAt!)) {
    formErrors.value.expiresAt = "Expiry date must be after today"
    return
  }

  try {
    await trpc.collection.invitation.create.mutate({
      collectionId: props.collection.id,
      email: form.value.email!,
      expiresAt: (form.value.expiresAt! as unknown) as Date,
      sendEmail,
    })
    await queryClient.invalidateQueries({
      queryKey: ["collection", props.collection.id],
    })
    if (sendEmail) {
      toast.success("The invitation link has been sent to your guest")
    } else {
      await copyInvitationLink(form.value.email!)
    }
    resetForm()
  } catch (error) {
    const { fieldErrors } = extractErrors(error as Error)
    formErrors.value = fieldErrors
  }
}

async function copyInvitationLink(email: string) {
  const url = new URL(window.location.href)
  const searchParams = new URLSearchParams()
  searchParams.set(
    "auth_params",
    window.btoa(
      JSON.stringify({
        magicLink: true,
        email,
        collectionName: props.collection.name,
        collectionId: props.collection.id,
      })
    )
  )
  url.search = searchParams.toString()
  url.hash = ""
  await navigator.clipboard.writeText(url.toString())
  toast.success("Invitation link copied!")
}

async function removeInvitation(invitation: Invitation) {
  try {
    await trpc.collection.invitation.remove.mutate({ id: invitation.id })
    await queryClient.invalidateQueries({
      queryKey: ["collection", props.collection.id],
    })
    toast.success("Invitation removed! The guest will no longer be able to access the collection.")
  } catch (error) {
    toast.error((error as Error).message)
  }
}

onMounted(() => {
  resetForm()
})
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[600px] gap-6">
      <DialogHeader>
      <DialogTitle>Share collection</DialogTitle>
      <DialogDescription>
        Invite someone by email or copy a link to this collection.
      </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-6 w-full">
        <div class="flex flex-col gap-2 w-full">
          <form @submit.prevent="createInvitation(true)" class="flex flex-col gap-4 w-full">
            <div class="grid grid-cols-[minmax(0,1fr)_180px] items-start gap-4">

              <FieldGroup>
                <Label for="email" class="flex items-center gap-1 ">
                  Guest email
                </Label>
                <Input id="email" v-model="form.email" type="email" placeholder="Enter guest email" required />
              </FieldGroup>

              <FieldGroup class="min-w-0">
                <Label for="expiresAt" class="flex items-center gap-1 ">
                  Expiry date
                </Label>
                <div class="relative w-full">
                  <Input id="expiresAt" v-model="form.expiresAt" type="date"
                    :min="new Date().toISOString().split('T')[0]" required class="w-full" />
                </div>
              </FieldGroup>
            </div>
            <div v-if="formErrors.expiresAt || formErrors.email" class="grid gap-2">
              <p v-if="formErrors.expiresAt" class="mt-1 text-sm text-red-600">
                {{ formErrors.expiresAt }}
              </p>
              <p v-if="formErrors.email" class="mt-1 text-sm text-red-600">
                {{ formErrors.email }}
              </p>
            </div>

            <div class="flex justify-end w-full gap-2">
              <Button type="submit">
                <Send class="w-4 h-4 mr-2" />
                Send Invite
              </Button>
              <Button type="button" variant="outline" @click="createInvitation(false)">
                <Copy class="w-4 h-4 mr-2" />
                Copy Link
              </Button>
            </div>
          </form>
        </div>

        <section class="grid gap-3">
          <h3 class="text-sm font-semibold">Invitations</h3>
          <div v-if="invitations.length === 0" class="text-sm text-gray-500">
            No invitations yet. Create one to share this collection.
          </div>
          <ScrollArea v-else :class="{ 'h-[300px] pr-2': invitations.length > 5 }">
            <div v-for="invitation in invitations" :key="invitation.id"
              class="flex items-center justify-between py-2 pr-2 hover:bg-gray-100">
              <div class="flex flex-col w-full items-start">
                <div class="text-sm font-medium truncate w-[calc(100%-10px)]">{{ invitation.email }}</div>
                <div class="text-xs text-gray-500">
                  Expires on {{ dayjs(invitation.expiresAt).format("D MMMM YYYY") }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Button size="sm" variant="outline" @click="copyInvitationLink(invitation.email)">
                  <Link class="w-4 h-4 mr-1" />
                  Copy Link
                </Button>
                <Button size="sm" variant="outline" @click="removeInvitation(invitation)">
                  <XCircle class="w-4 h-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </ScrollArea>
        </section>
      </div>
      <DialogFooter><Button type="button" variant="outline" @click="emit('update:modelValue', false)">Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>
</template>
