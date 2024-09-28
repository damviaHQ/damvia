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
import LayoutAdmin from "@/layouts/LayoutAdmin.vue"
import LayoutAuth from "@/layouts/LayoutAuth.vue"
import LayoutMain from "@/layouts/LayoutMain.vue"
import LayoutPublic from "@/layouts/LayoutPublic.vue"
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const component = computed(() => {
  switch (route.meta.layout) {
    case "main":
      return LayoutMain
    case "auth":
      return LayoutAuth
    case "admin":
      return LayoutAdmin
    case "public":
      return LayoutPublic
  }
  return null
})
</script>

<template>
  <component v-if="component" :is="component">
    <router-view />
  </component>
  <router-view v-else />
</template>
