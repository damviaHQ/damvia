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
import { computed } from "vue"
import type { MobileFile } from "../composables"
import { usePreviewQuery } from "../composables"
import MobileFileGrid from "./MobileFileGrid.vue"
import MobilePreview from "./MobilePreview.vue"

// Stands in for the desktop file grid inside page blocks shown on a phone.
const props = defineProps<{ collection?: { files?: MobileFile[] | null } | null, files?: MobileFile[] | null }>()
const list = computed<MobileFile[]>(() => props.files ?? props.collection?.files ?? [])
const preview = usePreviewQuery(() => list.value)
</script>

<template>
  <div class="-mx-4">
    <MobileFileGrid :files="list" @open="preview.open" />
    <MobilePreview v-if="preview.index.value >= 0" :files="list" :index="preview.index.value" @close="preview.close" @show="preview.show" />
  </div>
</template>
