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
import { computed, watchEffect } from 'vue'
import { CircleHelp } from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import type { RouterOutput } from '@/services/server'

type File = RouterOutput['collection']['getFiles']['files'][number]
const props = withDefaults(defineProps<{ files: File[], directLimit?: number }>(), { directLimit: 2_000_000_000 })
const imageFormat = defineModel<'original' | 'jpg' | 'png' | 'webp'>('imageFormat', { default: 'original' })
const imageResolution = defineModel<'high' | 'medium' | 'low'>('imageResolution', { default: 'medium' })
const videoFormat = defineModel<'original' | 'mp4' | 'webm'>('videoFormat', { default: 'original' })
const videoResolution = defineModel<'high' | 'medium' | 'low'>('videoResolution', { default: 'medium' })
const delivery = defineModel<'direct' | 'email'>('delivery', { default: 'direct' })
const accepted = defineModel<boolean>('accepted', { default: false })
const imageCount = computed(() => props.files.filter(file => file.mimeType.startsWith('image/')).length)
const hasVideo = computed(() => props.files.some(file => file.mimeType.startsWith('video/')))
const directAllowed = computed(() => props.files.reduce((sum, file) => sum + Number(file.size), 0) <= props.directLimit && imageCount.value <= 300)
const licenses = computed(() => [...new Map(props.files.flatMap(file => file.license ? [[file.license.id, file.license] as const] : [])).values()])
watchEffect(() => {
  if (!directAllowed.value) delivery.value = 'email'
  if (imageCount.value > 300) imageFormat.value = 'original'
})
</script>

<template>
  <div class="file-options">
    <label v-if="imageCount" class="select-field">Image format<select v-model="imageFormat"><option value="original">Original</option><option v-for="value in ['jpg', 'png', 'webp']" :key="value" :value="value" :disabled="imageCount > 300">{{ value.toUpperCase() }}</option></select></label>
    <label v-if="imageCount && imageFormat !== 'original'" class="select-field">Image quality<select v-model="imageResolution"><option value="high">High · Print</option><option value="medium">Medium · Web</option><option value="low">Small · Preview</option></select></label>
    <label v-if="hasVideo" class="select-field">Video format<select v-model="videoFormat"><option value="original">Original</option><option value="mp4">MP4</option><option value="webm">WebM</option></select></label>
    <label v-if="hasVideo && videoFormat !== 'original'" class="select-field">Video quality<select v-model="videoResolution"><option value="high">High</option><option value="medium">Medium · 1080p</option><option value="low">Small · 720p</option></select></label>
    <fieldset><legend>Delivery</legend><div class="delivery-options">
      <label><input v-model="delivery" type="radio" value="direct" name="download-delivery" :disabled="!directAllowed" />Download now</label>
      <label><input v-model="delivery" type="radio" value="email" name="download-delivery" />Email me a link</label>
    </div><p v-if="!directAllowed" class="caption">Large downloads are sent by email.</p></fieldset>
    <div v-if="licenses.length" class="licenses">
      <h3>Usage terms</h3>
      <div v-for="license in licenses" :key="license.id">
        <Dialog v-if="license.details"><DialogTrigger as-child><button type="button" class="license-link">{{ license.name }}<CircleHelp :size="14" /></button></DialogTrigger><DialogContent class="sm:max-w-[640px]"><DialogHeader><DialogTitle>{{ license.name }}</DialogTitle><DialogDescription>Usage terms</DialogDescription></DialogHeader><div class="text-sm leading-relaxed" v-html="license.details" /></DialogContent></Dialog>
        <span v-else>{{ license.name }}</span>
      </div>
      <label class="accept-terms"><input v-model="accepted" type="checkbox" />I agree to the usage terms</label>
    </div>
  </div>
</template>

<style scoped>
.file-options { display:flex; flex-direction:column; gap:22px; }
h3, legend, .select-field { font-size:13px; font-weight:600; }
legend { margin-bottom:10px; }
.select-field { display:flex; flex-direction:column; gap:8px; }
select { width:100%; padding:9px; border:1px solid hsl(var(--input)); background:white; font-size:14px; font-weight:400; }
input { width:16px; height:16px; accent-color:hsl(var(--primary)); flex-shrink:0; }
button:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid hsl(var(--ring)); outline-offset:3px; }
.delivery-options, .licenses { display:flex; flex-direction:column; gap:10px; }
.delivery-options label, .accept-terms { display:flex; align-items:center; gap:9px; font-size:13px; cursor:pointer; }
.licenses { font-size:13px; }
.license-link { display:flex; align-items:center; gap:6px; text-align:left; text-decoration:underline; text-underline-offset:3px; }
.caption { color:hsl(var(--muted-foreground)); font-size:12px; margin-top:8px; }
</style>
