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
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { toast } from "vue3-toastify"
import { extractErrors, trpc } from "../../services/server.ts"
import { useGlobalStore } from "../../stores/globalStore.ts"

const router = useRouter()
const route = useRoute()
const globalStore = useGlobalStore()
const form = ref({ password: '' })
const formRootError = ref<string | null>(null)

async function onSubmit(event: Event) {
  event.preventDefault()

  trpc.user.resetPassword.mutate({
    email: route.query.email as string,
    token: route.query.token as string,
    newPassword: form.value.password,
  })
    .then((token) => {
      globalStore.setAuthToken(token)
      toast.success('Password successfully changed!')
      router.push({ name: 'home' })
    })
    .catch((error) => {
      const { message, fieldErrors } = extractErrors(error)
      formRootError.value = Object.keys(fieldErrors).length > 0 ? 'User not found.' : message
    })
}
</script>

<template>
  <form @submit="onSubmit">
    <div v-if="formRootError" class="alert alert-danger mb-075">
      {{ formRootError }}
    </div>
    <div class="form-field">
      <input type="password" autocomplete="new-password" v-model="form.password" placeholder="New password"
        class="form-input">
    </div>
    <div class="flex items-center">
      <button type="submit" class="btn btn-primary">
        Change password
      </button>
    </div>
  </form>
</template>
