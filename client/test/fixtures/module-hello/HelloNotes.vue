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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { moduleClient } from "@/modules"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ref } from "vue"
import type { HelloRouter } from "./router"

const hello = moduleClient<HelloRouter>('hello')
const queryClient = useQueryClient()
const text = ref('')
const { data: notes } = useQuery({ queryKey: ['hello', 'notes'], queryFn: () => hello.list.query() })

async function add() {
  await hello.add.mutate({ text: text.value })
  text.value = ''
  await queryClient.invalidateQueries({ queryKey: ['hello', 'notes'] })
}
</script>

<template>
  <section class="grid gap-4 p-6" aria-labelledby="hello-heading">
    <h1 id="hello-heading" class="text-2xl font-semibold text-neutral-900">Notes</h1>
    <form class="flex gap-2" @submit.prevent="add">
      <Input v-model="text" aria-label="New note" />
      <Button type="submit" :disabled="!text">Add note</Button>
    </form>
    <ul aria-label="Notes">
      <li v-for="note in notes" :key="note.id">{{ note.text }}</li>
    </ul>
  </section>
</template>
