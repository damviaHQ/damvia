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
      <main id="main-content" tabindex="-1" class="auth-layout__main flex flex-1 flex-col items-center justify-center px-6 py-12 focus:outline-none">
        <!-- On a phone the tenant picture becomes a band above the form. -->
        <div v-if="backgroundImageUrl" class="auth-layout__hero" :style="{ backgroundImage: `url(&quot;${backgroundImageUrl}&quot;)` }" aria-hidden="true"></div>
        <div class="auth-layout__form flex flex-col gap-9 w-full max-w-[360px]">
          <Logo class="auth-layout__logo block [width:132px] h-auto" />
          <slot></slot>
          <footer class="auth-layout__footer text-sm text-neutral-500">
            <router-link to="/legal-information" target="_blank">Legal Mention</router-link>
          </footer>
        </div>
      </main>
      <div v-if="backgroundImageUrl" class="auth-layout__image hidden md:block !bg-neutral-100 [width:60%] [background:no-repeat_center_center] [background-size:cover] [flex-shrink:0]" :style="{ backgroundImage: `url(${backgroundImageUrl})` }"></div>
    </div>
  </div>
</template>

<style scoped>
.auth-layout__hero {
  display: none;
}

@media (max-width: 767px) {
  .auth-layout__main {
    justify-content: flex-start;
    padding: 0;
    background: var(--dv-surface-canvas, #fafafa);
  }
  .auth-layout__hero {
    display: block;
    width: 100%;
    height: 32dvh;
    min-height: 180px;
    background-color: #f5f5f5;
    background-position: center;
    background-size: cover;
  }
  /* The form sits on a sheet: over the picture when there is one, from the top otherwise. */
  .auth-layout__form {
    flex: 1;
    max-width: none;
    gap: 28px;
    padding: calc(env(safe-area-inset-top) + 40px) 24px calc(env(safe-area-inset-bottom) + 20px);
    background: #fff;
    font-size: 16px;
  }
  .auth-layout__hero + .auth-layout__form {
    margin-top: -24px;
    padding-top: 32px;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -8px 24px rgb(0 0 0 / 0.06);
  }
  .auth-layout__logo {
    width: 120px;
  }
  .auth-layout__footer {
    margin-top: auto;
    text-align: center;
  }
  .auth-layout__footer a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  /* Phone-sized controls: 16px text keeps iOS from zooming into a field. */
  .auth-layout__form :deep(input:not([type="checkbox"]):not([type="radio"])) {
    min-height: 48px;
    font-size: 16px;
  }
  .auth-layout__form :deep(button[type="submit"]),
  .auth-layout__form :deep(form > div > button.w-full),
  .auth-layout__form :deep(button.w-full) {
    min-height: 48px;
    font-size: 16px;
  }
  .auth-layout__form :deep(label) {
    font-size: 15px;
  }
  .auth-layout__form :deep(a[class*="text-xs"]),
  .auth-layout__form :deep(.text-xs a) {
    min-height: 44px;
    font-size: 14px;
  }
}
</style>
