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
import { TooltipProvider } from "@/components/ui/tooltip"
</script>

<!-- Editing is its own screen: no navigation tree, no topbar, so the page
     being edited is the only thing on screen. -->
<template>
  <TooltipProvider :delay-duration="0" :disable-hoverable-content="true">
    <main id="main-content" tabindex="-1" class="editor-workspace h-dvh overflow-hidden focus:outline-none">
      <slot />
    </main>
  </TooltipProvider>
</template>
