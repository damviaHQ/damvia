<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2026 Arnaud DE SAINT JEAN
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
import { CheckCircle2, X } from 'lucide-vue-next'
import { onUnmounted, ref } from 'vue'
import logo from '../assets/logo.svg?url'
import Foundations from './Foundations.vue'
import ProductionControls from './ProductionControls.vue'

const notice = ref('')
const neutral = ref(false)
let noticeTimer: ReturnType<typeof setTimeout>

function notify(message: string) {
  notice.value = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => notice.value = '', 4500)
}

onUnmounted(() => clearTimeout(noticeTimer))
</script>

<template>
  <div class="dv-theme design-reference" :class="{ 'dv-neutral': neutral }">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="reference-header">
      <div class="reference-header__brand"><img :src="logo" alt="Damvia" /><span>Design system</span></div>
      <div class="reference-header__meta"><button class="dv-button" :aria-pressed="neutral" @click="neutral = !neutral">{{ neutral ? 'Neutral client theme' : 'Damvia brand theme' }}</button><span>Local reference</span><strong>0.1</strong></div>
    </header>
    <main id="main-content" tabindex="-1">
      <ProductionControls :key="String(neutral)" :neutral="neutral" />
      <Foundations @notify="notify" />
    </main>
    <footer class="reference-footer"><span>Damvia design system</span><span>One component system. Damvia and neutral client themes.</span></footer>
    <div v-if="notice" class="dv-toast dv-toast--success preview-toast" role="status">
      <CheckCircle2 class="dv-toast__icon" />
      <strong class="dv-toast__title">{{ notice }}</strong>
      <button class="dv-toast__close" aria-label="Dismiss notification" @click="notice = ''"><X /></button>
    </div>
  </div>
</template>
