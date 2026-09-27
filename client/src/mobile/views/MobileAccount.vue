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
import { useQuery } from "@tanstack/vue-query"
import { ChevronRight, Download, LogOut, ShieldCheck, Users, Activity } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"

const store = useGlobalStore()
const toast = useGlobalToast()
const user = computed(() => store.user)
const role = computed(() => user.value?.role)
const name = ref("")
const company = ref("")
const saving = ref(false)
watch(user, (value) => { name.value = value?.name ?? ""; company.value = value?.company ?? "" }, { immediate: true })
const changed = computed(() => name.value.trim() !== (user.value?.name ?? "") || company.value.trim() !== (user.value?.company ?? ""))
const { data: downloads } = useQuery({ queryKey: ["downloads"], queryFn: () => trpc.download.list.query() })
const preparing = computed(() => (downloads.value ?? []).filter((download) => download.status === "preparing").length)
const ready = computed(() => (downloads.value ?? []).filter((download) => download.status === "ready").length)

async function save() {
  saving.value = true
  try {
    await trpc.user.updateProfile.mutate({ name: name.value.trim(), company: company.value.trim(), email: user.value!.email })
    await store.fetchUser()
    toast.success("Profile saved")
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <h1 class="sr-only">Account</h1>
  <div class="grid gap-6 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-24">
    <section class="grid gap-3" aria-labelledby="profile-heading">
      <h2 id="profile-heading" class="text-sm font-semibold text-[var(--dv-text-secondary)]">Profile</h2>
      <p class="break-all">{{ user?.email }}</p>
      <label class="grid gap-1"><span class="text-sm font-medium">Name</span>
        <input v-model="name" maxlength="80" autocomplete="name" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3 text-base" />
      </label>
      <label class="grid gap-1"><span class="text-sm font-medium">Company</span>
        <input v-model="company" maxlength="80" autocomplete="organization" class="min-h-11 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3 text-base" />
      </label>
      <Button v-if="changed" type="button" class="min-h-12" :disabled="saving || !name.trim() || !company.trim()" @click="save">Save</Button>
    </section>

    <nav class="grid" aria-label="Account">
      <router-link :to="{ name: 'downloads' }" class="mobile-account-row">
        <Download :size="20" aria-hidden="true" /><span class="flex-1">Downloads</span>
        <span v-if="preparing" class="text-sm text-[var(--dv-text-secondary)]">{{ preparing }} preparing</span>
        <span v-else-if="ready" class="text-sm text-[var(--dv-text-secondary)]">{{ ready }} ready</span>
        <ChevronRight :size="18" aria-hidden="true" />
      </router-link>
      <router-link v-if="role === 'admin' || role === 'manager'" :to="{ name: 'admin-users' }" class="mobile-account-row">
        <Users :size="20" aria-hidden="true" /><span class="flex-1">Users</span><ChevronRight :size="18" aria-hidden="true" />
      </router-link>
      <router-link v-if="role === 'admin'" :to="{ name: 'admin-dashboard' }" class="mobile-account-row">
        <Activity :size="20" aria-hidden="true" /><span class="flex-1">Library status</span><ChevronRight :size="18" aria-hidden="true" />
      </router-link>
      <div class="mobile-account-row text-[var(--dv-text-secondary)]">
        <ShieldCheck :size="20" aria-hidden="true" /><span class="flex-1">Sign-in security, sessions and account deletion are on the computer version.</span>
      </div>
    </nav>

    <Button type="button" variant="outline" class="min-h-12" @click="store.logout()"><LogOut :size="18" aria-hidden="true" />Sign out</Button>
  </div>
</template>

<style scoped>
.mobile-account-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  border-bottom: 1px solid var(--dv-color-line);
  color: inherit;
  text-decoration: none;
}
</style>
