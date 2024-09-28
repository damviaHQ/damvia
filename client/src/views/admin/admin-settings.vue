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
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server.ts"
import { onMounted, ref } from 'vue'

const toast = useGlobalToast()
const fileInput = ref<HTMLInputElement | null>(null)
const backgroundImageUrl = ref<string | null>(null)
const isLoading = ref(false)

onMounted(async () => {
  await fetchBackgroundImage()
})

const fetchBackgroundImage = async () => {
  try {
    const result = await trpc.settings.getAuthBackgroundImage.query()
    backgroundImageUrl.value = result.exists ? result.imageUrl : ""
  } catch (error) {
    toast.error("Failed to fetch background image")
  }
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    isLoading.value = true
    try {
      const uploadUrl = await trpc.settings.getAuthBackgroundUploadUrl.query()
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      })

      // After successful upload, trigger the server-side processing
      await trpc.settings.processAuthBackgroundImage.mutate()

      await fetchBackgroundImage() // Refresh the image after upload
      toast.success("Background image uploaded and processed successfully")
    } catch (error) {
      toast.error("Failed to upload or process background image")
    } finally {
      isLoading.value = false
    }
  }
}

const removeBackgroundImage = async () => {
  isLoading.value = true
  try {
    await trpc.settings.removeAuthBackgroundImage.mutate()
    backgroundImageUrl.value = ""
    toast.success("Background image removed successfully")
  } catch (error) {
    toast.error("Failed to remove background image")
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col p-8">
    <div class="flex flex-col gap-5 mb-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Global Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div class="mt-6">
        <h2 class="text-2xl font-bold mb-4">Auth Background Image</h2>

        <div v-if="backgroundImageUrl" class="mb-4">
          <img :src="backgroundImageUrl" alt="Current background" class="max-w-md rounded-lg shadow-md" />
        </div>

        <div class="flex gap-4">
          <input type="file" ref="fileInput" @change="handleFileUpload" accept="image/*" class="hidden" />
          <Button @click="fileInput?.click()" :disabled="isLoading">
            {{ backgroundImageUrl ? 'Change' : 'Upload' }} Background Image
          </Button>
          <Button v-if="backgroundImageUrl" @click="removeBackgroundImage" variant="destructive" :disabled="isLoading">
            Remove Background Image
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
