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
import Loader from "@/components/Loader.vue"
import { useHomeTarget } from "@/composables/useHomeTarget"
import { ref, watch } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()
const showDefaultView = ref(false)
const { target } = useHomeTarget()

watch(target, (next) => {
  if (next === null) return
  if (next === false) showDefaultView.value = true
  else router.push(next)
}, { immediate: true })
</script>

<template>
  <div v-if="showDefaultView" class="layout-home flex flex-col items-center justify-center w-full [font-size:1rem] m-0 [color:var(--dv-text-secondary)] font-medium">
    <h1>Welcome to our Internal asset platform.</h1>
    <p>The homepage is still work in progress but you can already navigate through collections on the left or <a
        href="/search"> search</a> assets
      with th search bar on the top.</p>
  </div>
  <div v-else>
    <Loader :text="true" />
  </div>
</template>
