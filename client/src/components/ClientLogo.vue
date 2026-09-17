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
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { trpc } from '@/services/server'
import { useGlobalStore } from '@/stores/globalStore'
import defaultLogo from '../../../packages/design-system/src/logo.svg?url'
const props = defineProps<{ admin?: boolean }>()
const store = useGlobalStore()
const failed = ref(false)
const { data: branding } = useQuery({
  queryKey: ['admin-branding'], queryFn: () => trpc.settings.getAdminBranding.query(),
  enabled: computed(() => !!props.admin), refetchInterval: 60_000,
})
const { data: logo } = useQuery({
  queryKey: ['client-logo'], queryFn: () => trpc.settings.getClientLogo.query(),
  enabled: computed(() => !props.admin || branding.value?.useClientLogo === true),
  staleTime: 60_000, refetchInterval: 30 * 60_000,
})
const useUploaded = computed(() => !!logo.value?.imageUrl && !failed.value && (!props.admin || branding.value?.useClientLogo === true))
watch(() => logo.value?.imageUrl, () => { failed.value = false })
</script>
<template>
 <img :src="useUploaded ? logo!.imageUrl! : defaultLogo" :alt="useUploaded ? (store.env?.appName || 'Brand Logo') : 'Damvia'" :class="{ 'client-logo--uploaded': useUploaded, 'client-logo--default': !useUploaded }" class="client-logo" @error="failed = true" />
</template>
<style scoped>
.client-logo { width:140px; height:48px; object-fit:contain; }
</style>
