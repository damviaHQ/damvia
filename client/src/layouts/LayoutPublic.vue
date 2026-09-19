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
</script>

<template>
  <div class="public-layout__root min-h-screen [background-size:cover] flex flex-col items-center m-0 [padding:2rem_0.75rem_0]">
    <main id="main-content" tabindex="-1" class="public-layout__container [background:#fff] [min-width:50rem] [max-width:50rem] p-5 [border-radius:var(--dv-radius-control)] w-full focus:outline-none">
      <router-link to="/">
        <Logo class="public-layout__logo block [margin:0_auto_2rem] [width:132px] h-auto" />
      </router-link>
      <slot></slot>
    </main>
  </div>
</template>
