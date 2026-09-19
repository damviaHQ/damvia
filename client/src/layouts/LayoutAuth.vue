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
import Logo from "@/components/ClientLogo.vue"
import { trpc } from "@/services/server.ts"
import { onMounted, ref } from 'vue'

const backgroundImageUrl = ref<string | null>(null)

onMounted(async () => {
  try {
    const result = await trpc.settings.getAuthBackgroundImage.query()
    backgroundImageUrl.value = result.exists ? result.imageUrl : ""
  } catch (error) {
    console.error("Failed to fetch background image:", error)
  }
})
</script>

<template>
  <div class="auth-layout__root min-h-screen flex flex-col items-center m-0 justify-between bg-white">
    <div class="auth-layout__container min-h-screen flex w-full overflow-hidden">
      <main id="main-content" tabindex="-1" class="flex flex-1 flex-col items-center justify-center px-6 py-12 focus:outline-none">
        <div class="auth-layout__form flex flex-col gap-9 w-full max-w-[360px]">
          <Logo class="auth-layout__logo block [width:132px] h-auto" />
          <slot></slot>
          <footer class="text-sm text-neutral-500">
            <router-link to="/legal-information" target="_blank">Legal Mention</router-link>
          </footer>
        </div>
      </main>
      <div v-if="backgroundImageUrl" class="auth-layout__image hidden md:block !bg-neutral-100 [width:60%] [background:no-repeat_center_center] [background-size:cover] [flex-shrink:0]" :style="{ backgroundImage: `url(${backgroundImageUrl})` }"></div>
    </div>
  </div>
</template>
