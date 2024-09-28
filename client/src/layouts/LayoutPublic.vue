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
</script>

<template>
  <div class="public-layout__root">
    <div class="public-layout__container">
      <router-link to="/">
        <Logo class="public-layout__logo" />
      </router-link>
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.public-layout__root {
  min-height: 100vh;
  background-size: cover;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 2rem 0.75rem 0;
}

.public-layout__container {
  background: #fff;
  min-width: 50rem;
  max-width: 50rem;
  padding: 1.25rem;
  border-radius: var(--border-radius);
  width: 100%;
}

.public-layout__logo {
  display: block;
  margin: 0 auto 2rem;
  width: 132px;
  height: auto;
}

.public-layout__back-btn {
  font-size: 18px;
  margin-top: 2em;
  border: 2px solid var(--primary-color15);
  color: var(--primary-color15);
  padding: 1em;
  font-weight: 800;
  text-decoration: none;
  width: max-content;
}

.public-layout__back-btn>a,
a:visited,
a:hover,
a:active {
  color: var(--primary-color15);
  text-decoration: none;
  cursor: pointer;
}
</style>
