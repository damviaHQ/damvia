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
import { Button } from '@/components/ui/button'
import { useGlobalToast } from '@/composables/useGlobalToast'
import { RotateCcw } from "lucide-vue-next"
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  onResend: () => Promise<void>
}>()
const toast = useGlobalToast()
const cooldownTime = ref(0)
const isCooldown = ref(false)

watch(isCooldown, (newValue) => {
  if (newValue) {
    cooldownTime.value = 60
    localStorage.setItem('resendEmailCooldownEnd', (Date.now() + 60000).toString())
    startCooldownTimer()
  }
})

function startCooldownTimer() {
  const interval = setInterval(() => {
    cooldownTime.value--
    if (cooldownTime.value <= 0) {
      clearInterval(interval)
      isCooldown.value = false
      localStorage.removeItem('resendEmailCooldownEnd')
    }
  }, 1000)
}

async function resendEmail() {
  if (isCooldown.value) return

  try {
    await props.onResend()
    toast.success("Email has been resent. Please check your inbox.")
    isCooldown.value = true
  } catch (error) {
    toast.error(error.message || "Failed to resend email. Please try again.")
  }
}

onMounted(() => {
  const storedCooldownEnd = localStorage.getItem('resendEmailCooldownEnd')
  if (storedCooldownEnd) {
    const remainingTime = Math.max(0, parseInt(storedCooldownEnd) - Date.now())
    if (remainingTime > 0) {
      cooldownTime.value = Math.ceil(remainingTime / 1000)
      isCooldown.value = true
      startCooldownTimer()
    }
  }
})
</script>

<template>
  <div class="inline-flex items-center gap-1">
    <RotateCcw v-if="!isCooldown" class="w-4 h-4 text-neutral-400" />
    <Button variant="link" class="p-0 text-neutral-500" @click="resendEmail" :disabled="isCooldown">
      {{ isCooldown ? `Wait ${cooldownTime}s before resending` : 'resend the email' }}
    </Button>
  </div>
</template>