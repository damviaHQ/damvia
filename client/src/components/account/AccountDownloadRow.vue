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
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useRecordLabel } from "@/composables/useRecordLabel"
import type { Download } from "@/stores/downloadStore"
import dayjs from "dayjs"
import AccountDownloadContents from "@/components/account/AccountDownloadContents.vue"
import { ChevronRight, Download as DownloadIcon, Files, Link, LoaderCircle } from "@lucide/vue"
import { computed, ref } from "vue"

const props = defineProps<{ download: Download, isNew?: boolean, compact?: boolean }>()

const toast = useGlobalToast()
const expanded = ref(false)
// An expired archive is gone, so its contents are not offered.
const expandable = computed(() => !props.compact && props.download.status !== "expired")
const recordLabel = useRecordLabel()

const contents = computed(() => {
  const { fileCount, recordCount } = props.download
  const parts = []
  if (fileCount || !recordCount) parts.push(`${fileCount} ${fileCount === 1 ? "file" : "files"}`)
  if (recordCount) parts.push(`${recordCount} ${recordCount === 1 ? recordLabel.lower.value : recordLabel.lowerPlural.value}`)
  return parts.join(" · ")
})

const expiry = computed(() => {
  const expiresAt = dayjs(props.download.expiresAt)
  if (props.download.status === "expired") return `Expired ${expiresAt.format("D MMM")}`
  const days = expiresAt.startOf("day").diff(dayjs().startOf("day"), "day")
  if (days <= 0) return "Expires today"
  if (days === 1) return "Expires tomorrow"
  return `Expires in ${days} days`
})

const requested = computed(() => `Requested ${dayjs(props.download.createdAt).format("D MMM, HH:mm")}`)

async function copyLink() {
  if (!props.download.url) return
  try {
    await navigator.clipboard.writeText(props.download.url)
    toast.success("Download link copied")
  } catch {
    toast.error("The link could not be copied")
  }
}
</script>

<template>
  <li data-download-row :data-status="download.status">
    <div class="flex items-center gap-3" :class="compact ? 'py-2.5' : 'py-2'">
      <component :is="expandable ? 'button' : 'div'" :type="expandable ? 'button' : undefined"
        class="flex min-w-0 flex-1 items-center gap-3 text-left"
        :class="[!compact && '-mx-2 px-2 py-1.5', expandable && 'hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-ring']"
        :aria-expanded="expandable ? expanded : undefined" @click="expandable && (expanded = !expanded)">
        <ChevronRight v-if="expandable" class="size-4 shrink-0 text-neutral-400 transition-transform motion-reduce:transition-none"
          :class="expanded && 'rotate-90'" aria-hidden="true" />
        <span v-if="!compact && !expandable" class="size-4 shrink-0" aria-hidden="true" />
        <span class="relative grid shrink-0 place-items-center bg-neutral-100 text-neutral-500"
          :class="[compact ? 'size-8' : 'size-10', download.status === 'expired' && 'opacity-60']" aria-hidden="true">
          <Files :class="compact ? 'size-4' : 'size-5'" stroke-width="1.75" />
          <span v-if="isNew" class="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-green-600 ring-2 ring-white" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-body font-medium" :class="download.status === 'expired' ? 'text-neutral-500' : 'text-neutral-900'">
            {{ contents }}<span v-if="isNew" class="sr-only"> (new)</span>
          </span>
          <span class="block truncate text-caption text-neutral-500">
            <template v-if="download.status === 'preparing'">
              <LoaderCircle class="mr-1 inline size-3 animate-spin align-[-2px] motion-reduce:animate-none" aria-hidden="true" />Preparing… we'll email you the link too
            </template>
            <template v-else-if="download.status === 'failed'">
              <span class="font-medium text-destructive">Failed</span> · start it again from the collection
            </template>
            <template v-else-if="compact">{{ expiry }}</template>
            <template v-else>{{ requested }} · {{ expiry }}</template>
          </span>
        </span>
      </component>
      <div v-if="download.status === 'ready' && download.url" class="flex shrink-0 items-center gap-1">
        <!-- In the top-bar popover the first control takes focus, and a tooltip there would swallow Escape. -->
        <Button v-if="compact" type="button" variant="ghost" size="icon-sm" aria-label="Copy download link" title="Copy link" @click="copyLink">
          <Link />
        </Button>
        <TooltipProvider v-else :delay-duration="300">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Copy download link" @click="copyLink">
                <Link />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy link</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="outline" :size="compact ? 'sm' : 'default'" as-child>
          <a :href="download.url" target="_blank" rel="noopener"><DownloadIcon class="size-4" aria-hidden="true" />Download</a>
        </Button>
      </div>
    </div>
    <AccountDownloadContents v-if="expandable && expanded" :id="download.id" class="mb-3 ml-7" />
  </li>
</template>
