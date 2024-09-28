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
import Logo from "@/assets/logo.svg"
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
  <div class="auth-layout__root">
    <div class="auth-layout__container">
      <div class="flex flex-1 flex-col justify-center p-8 ml-[5%]">
        <div class="auth-layout__form flex flex-col gap-[4rem] max-w-[350px]">
          <Logo class="auth-layout__logo" />
          <slot></slot>
          <footer class="text-sm text-neutral-500">
            <router-link to="/legal-information" target="_blank">Legal Mention</router-link>
          </footer>
        </div>
      </div>
      <div class="auth-layout__image" :style="{ backgroundImage: `url(${backgroundImageUrl})` }"></div>
    </div>
  </div>
</template>

<style scoped>
.auth-layout__root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  justify-content: space-between;
}

.auth-layout__container {
  min-height: 100vh;
  display: flex;
  width: 100%;
  overflow: hidden;
}

.auth-layout__image {
  @apply !bg-neutral-100;
  width: 60%;
  background: no-repeat center center;
  background-size: cover;
  flex-shrink: 0;
}

.auth-layout__logo {
  display: block;
  width: 132px;
  height: auto;
}

footer a,
a:visited {
  color: var(--primary-color80);
}
</style>
