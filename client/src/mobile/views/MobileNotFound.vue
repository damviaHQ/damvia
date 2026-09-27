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
import MobileTopBar from "../components/MobileTopBar.vue"
</script>

<template>
  <MobileTopBar title="Not found" back />
  <section class="grid gap-3 px-4 pt-10 text-center">
    <h1 class="text-lg font-semibold">This collection is not available</h1>
    <p class="text-[var(--dv-text-secondary)]">It may have been removed, or it is not shared with you.</p>
    <router-link :to="{ name: 'home' }" class="min-h-11 inline-flex items-center justify-center underline">Back to home</router-link>
  </section>
</template>
