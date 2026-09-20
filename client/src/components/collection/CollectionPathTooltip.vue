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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

defineProps<{ path?: string }>()
</script>

<template>
  <TooltipProvider v-if="path" :delay-duration="600" :disable-hoverable-content="true">
    <Tooltip>
      <TooltipTrigger as-child><slot /></TooltipTrigger>
      <TooltipContent side="top" align="start" :side-offset="6"
        class="pointer-events-none max-w-[min(32rem,calc(100vw-2rem))] whitespace-normal [overflow-wrap:anywhere] bg-white text-neutral-900 text-body border-neutral-200">
        {{ path }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <slot v-else />
</template>
