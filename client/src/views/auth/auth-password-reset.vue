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
import { extractErrors, trpc } from "../../services/server.ts"

const submitted = ref(false)
const form = ref({ email: '' })
const formRootError = ref<string | null>(null)

async function onSubmit(event: Event) {
  event.preventDefault()

  trpc.user.sendResetPasswordEmail.mutate(form.value.email)
    .then(() => submitted.value = true)
    .catch((error) => {
      const { message, fieldErrors } = extractErrors(error)
      formRootError.value = Object.keys(fieldErrors).length > 0 ? 'User not found.' : message
    })
}
</script>

<template>
  <template v-if="submitted">
    <div class="heading-2 mb-075">Please check your inbox.</div>
    <div>You will receive an email to change your password.</div>
  </template>
  <form v-else @submit="onSubmit">
    <div v-if="formRootError" class="alert alert-danger mb-075">
      {{ formRootError }}
    </div>
    <div class="form-field">
      <input type="email" autocomplete="email" v-model="form.email" placeholder="Email" class="form-input">
    </div>
    <div class="flex items-center">
      <button type="submit" class="btn btn-primary">
        Reset password
      </button>
      <router-link :to="{ name: 'login' }" class="btn btn-outline">
        Log in
      </router-link>
    </div>
  </form>
</template>
