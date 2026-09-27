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
import { useRoute } from "vue-router"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import dayjs from "dayjs"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { canApproveUser, canEditUser, userState, userStateLabels } from "@/utils/adminUsers"
import MobileTopBar from "../components/MobileTopBar.vue"

const route = useRoute()
const store = useGlobalStore()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const id = computed(() => route.params.id as string)
const viewer = computed(() => store.user ? { id: store.user.id, role: store.user.role, regionId: store.user.regionId } : undefined)
const isAdmin = computed(() => store.user?.role === "admin")

// The same list as the Users screen: the permission helpers work on its rows.
const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => trpc.user.list.query() })
const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: () => trpc.group.list.query() })
const { data: regions } = useQuery({ enabled: isAdmin, queryKey: ["regions"], queryFn: () => trpc.region.list.query() })
const user = computed(() => users.value?.find((entry) => entry.id === id.value))
const suspended = computed(() => !!(user.value as { suspendedAt?: unknown } | undefined)?.suspendedAt)
const mfa = computed(() => (user.value as { mfaEnabled?: boolean } | undefined)?.mfaEnabled)
const state = computed(() => user.value ? (suspended.value ? "Suspended" : userStateLabels[userState(user.value)]) : "")
const editable = computed(() => !!user.value && canEditUser(viewer.value, user.value))
const self = computed(() => user.value?.id === store.user?.id)

const groupIds = ref<string[]>([])
const role = ref("")
const regionId = ref("")
watch(user, (value) => {
  groupIds.value = value?.groups.map((group) => group.id) ?? []
  role.value = value?.role ?? ""
  regionId.value = value?.regionId ?? ""
}, { immediate: true })
const dirty = computed(() => !!user.value && (
  [...groupIds.value].sort().join() !== user.value.groups.map((group) => group.id).sort().join() || role.value !== user.value.role || regionId.value !== user.value.regionId))
const regionChanged = computed(() => !!user.value && regionId.value !== user.value.regionId)
const busy = ref("")
const confirmSuspend = ref(false)

async function run(action: string, work: () => Promise<unknown>, done: string) {
  busy.value = action
  try {
    await work()
    await queryClient.invalidateQueries({ queryKey: ["users"] })
    toast.success(done)
  } catch (error) {
    toast.error((error as Error).message)
    await queryClient.invalidateQueries({ queryKey: ["users"] })
  } finally {
    busy.value = ""
  }
}
const approve = () => run("approve", () => trpc.user.approve.mutate(id.value), `${user.value?.name} can now use the library`)
const save = () => run("save", () => trpc.user.update.mutate({
  id: id.value, name: user.value!.name, company: user.value!.company, email: user.value!.email,
  role: role.value as never, regionId: regionId.value, groupIds: groupIds.value,
}), "Changes saved")
const suspend = () => run("suspend", () => trpc.user.suspend.mutate(id.value), "Access suspended").then(() => { confirmSuspend.value = false })
const resume = () => run("resume", () => trpc.user.resume.mutate(id.value), "Access restored")
const resend = () => run("resend", () => trpc.user.resendVerificationEmailFor.mutate(id.value), "Verification email sent")
const reset = () => run("reset", () => trpc.user.sendPasswordResetFor.mutate(id.value), "Password reset email sent")
function toggleGroup(groupId: string) {
  groupIds.value = groupIds.value.includes(groupId) ? groupIds.value.filter((current) => current !== groupId) : [...groupIds.value, groupId]
}
</script>

<template>
  <MobileTopBar :title="user?.name ?? 'User'" back="/admin/users" :trail="[{ label: 'Account', to: { name: 'account' } }, { label: 'Users', to: { name: 'admin-users' } }]" />
  <Loader v-if="isLoading" :text="true" />
  <p v-else-if="!user" class="px-4 pt-8 text-center text-[var(--dv-text-secondary)]">This person is not in your list.</p>
  <div v-else class="grid gap-6 px-4 pt-4 pb-24">
    <section class="grid gap-1" aria-label="Person">
      <p class="text-lg font-semibold">{{ user.name }}</p>
      <p class="break-all">{{ user.email }}</p>
      <p class="text-[var(--dv-text-secondary)]">{{ [user.company, user.region, user.role].filter(Boolean).join(" · ") }}</p>
      <p class="text-sm text-[var(--dv-text-secondary)]">
        {{ state }} · joined {{ dayjs(user.createdAt).format("D MMM YYYY") }} · last sign-in {{ user.lastLoginAt ? dayjs(user.lastLoginAt).format("D MMM YYYY") : "never" }}<template v-if="mfa !== undefined"> · two-step sign-in {{ mfa ? "on" : "off" }}</template>
      </p>
    </section>

    <section v-if="canApproveUser(viewer, user)" class="grid gap-2 rounded-[var(--dv-radius-lg)] bg-[var(--dv-surface-subtle)] p-4" aria-label="Approval">
      <p>Approving gives access to the library and sends an approval email.</p>
      <Button type="button" class="min-h-12" :disabled="!!busy" @click="approve">{{ busy === "approve" ? "Approving…" : "Approve" }}</Button>
    </section>
    <p v-else-if="userState(user) === 'unverified'" class="text-sm text-[var(--dv-text-secondary)]">This person has not confirmed their email yet, so they cannot be approved.</p>

    <section v-if="editable && !self" class="grid gap-3" aria-labelledby="access-heading">
      <h2 id="access-heading" class="text-sm font-semibold text-[var(--dv-text-secondary)]">Access</h2>
      <template v-if="isAdmin">
        <label class="grid gap-1"><span class="text-sm font-medium">Role</span>
          <select v-model="role" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] bg-transparent px-2 text-base">
            <option value="admin">Admin</option><option value="manager">Manager</option><option value="member">Member</option><option value="guest">Guest</option>
          </select>
        </label>
        <label class="grid gap-1"><span class="text-sm font-medium">Region</span>
          <select v-model="regionId" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] bg-transparent px-2 text-base">
            <option v-for="region in regions ?? []" :key="region.id" :value="region.id">{{ region.name }}</option>
          </select>
        </label>
        <p v-if="regionChanged" class="text-sm">A new region changes which licensed files this person sees. Their groups stay as they are: check them below.</p>
      </template>
      <fieldset class="grid">
        <legend class="pb-1 text-sm font-medium">Groups</legend>
        <label v-for="group in groups ?? []" :key="group.id" class="flex min-h-11 items-center gap-3">
          <input type="checkbox" class="size-5" :checked="groupIds.includes(group.id)" @change="toggleGroup(group.id)" />{{ group.name }}
        </label>
      </fieldset>
      <Button v-if="dirty" type="button" class="min-h-12" :disabled="!!busy" @click="save">{{ busy === "save" ? "Saving…" : "Save changes" }}</Button>
    </section>

    <section v-if="editable && !self" class="grid gap-2" aria-labelledby="help-heading">
      <h2 id="help-heading" class="text-sm font-semibold text-[var(--dv-text-secondary)]">Help them sign in</h2>
      <Button v-if="userState(user) === 'unverified'" type="button" variant="outline" class="min-h-12" :disabled="!!busy" @click="resend">Resend verification email</Button>
      <Button type="button" variant="outline" class="min-h-12" :disabled="!!busy" @click="reset">Send password reset email</Button>
    </section>

    <section v-if="editable && !self" class="grid gap-2" aria-labelledby="suspend-heading">
      <h2 id="suspend-heading" class="text-sm font-semibold text-[var(--dv-text-secondary)]">Suspend</h2>
      <template v-if="suspended">
        <p class="text-sm">Access is suspended. Their collections and downloads are kept.</p>
        <Button type="button" variant="outline" class="min-h-12" :disabled="!!busy" @click="resume">Restore access</Button>
      </template>
      <template v-else-if="confirmSuspend">
        <p class="text-sm">{{ user.name }} is signed out everywhere and their download links stop working until you restore access.</p>
        <div class="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" class="min-h-12" @click="confirmSuspend = false">Cancel</Button>
          <Button type="button" variant="destructive" class="min-h-12" :disabled="!!busy" @click="suspend">Suspend</Button>
        </div>
      </template>
      <Button v-else type="button" variant="outline" class="min-h-12 text-[var(--dv-color-danger)]" @click="confirmSuspend = true">Suspend access</Button>
    </section>
    <p class="text-sm text-[var(--dv-text-secondary)]">Deleting an account is done on a computer.</p>
  </div>
</template>
