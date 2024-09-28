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
import { Button } from "@/components/ui/button"
import LayoutDialogMember from "@/layouts/LayoutDialogMember.vue"
import { useDownloadStore } from "@/stores/downloadStore"
import { FolderDown } from "lucide-vue-next"
import { storeToRefs } from "pinia"
import { onMounted, ref } from "vue"

const { status, hasPreparingDownloads, newDownloads } = storeToRefs(useDownloadStore())
const downloadStore = useDownloadStore()
const showMemberDialog = ref(false)

function toggleMemberDialog() {
  showMemberDialog.value = !showMemberDialog.value
}

onMounted(async () => {
  await downloadStore.fetchInitialDownloads()
})
</script>

<template>
  <div v-if="status === 'success'">
    <Button variant="ghost" disabled class="flex items-center gap-2" v-if="hasPreparingDownloads">
      Preparing files
      <span class="loader-animation"></span>
    </Button>
    <Button variant="ghost" v-else-if="newDownloads && newDownloads.length > 0" @click="toggleMemberDialog"
      class="flex items-center gap-2 text-neutral-500 hover:text-neutral-800">
      Download ready
      <FolderDown class="w-6 h-6" />
    </Button>
    <LayoutDialogMember v-model:open="showMemberDialog" initial-tab="downloads" />
  </div>
</template>

<style scoped>
.loader-animation {
  @apply w-5 h-5 border-2 border-dashed rounded-[50%] border-neutral-500 inline-block relative box-border animate-spin;
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
</style>
