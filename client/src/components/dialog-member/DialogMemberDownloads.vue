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
import Loader from "@/components/Loader.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server.ts"
import { useDownloadStore } from "@/stores/downloadStore"
import { useQuery } from "@tanstack/vue-query"
import dayjs from "dayjs"
import { Download, Link } from "lucide-vue-next"

const toast = useGlobalToast()
const downloadStore = useDownloadStore()
const { status, data: downloads, error } = useQuery({
  queryKey: ["downloads"],
  queryFn: async () => {
    const result = await trpc.download.list.query()
    return result.sort((a, b) => dayjs(b.createdAt).unix() - dayjs(a.createdAt).unix())
  },
})

async function copyUrlToClipboard(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success("URL copied to clipboard!")
  } catch (err) {
    toast.error("Failed to copy URL")
  }
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <div v-else-if="status === 'success'" class="download__container  flex flex-col gap-4">
    <Table v-if="downloads && downloads.length > 0" class="text-[13px] [&_td]:px-3 [&_td]:py-3 [&_th]:px-3">
      <TableHeader>
        <TableRow>
          <TableHead>Created</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Files</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="download in downloads" :key="download.id"
          :class="{ 'text-neutral-500': download.status === 'expired' }">
          <TableCell class="whitespace-nowrap">{{ dayjs(download.createdAt).format("D MMM YYYY") }}</TableCell>
          <TableCell class="whitespace-nowrap">{{ dayjs(download.expiresAt).format("D MMM YYYY") }}</TableCell>
          <TableCell>
            <Badge v-if="download.status === 'failed'" variant="destructive">Failed</Badge>
            <span v-else>{{ download.status }}</span>
          </TableCell>
          <TableCell>{{ download.fileCount }}</TableCell>
          <TableCell>
            <div class="flex flex-wrap gap-1 items-center">
              <Button v-if="download.url" variant="ghost" size="sm" as-child>
                <a :href="download.url" target="_blank">
                  <Download class="size-4" />
                  Download
                </a>
              </Button>
              <Button v-else variant="ghost" size="sm" :disabled="!download.url">
                <Download class="size-4 opacity-100" />
                Download
              </Button>
              <Button v-if="download.url" variant="ghost" size="sm" @click="copyUrlToClipboard(download.url)">
                <Link class="size-4" />
                Copy URL
              </Button>
              <Button v-else variant="ghost" size="sm" :disabled="!download.url">
                <Link class="size-4" />
                Copy URL
              </Button>
              <Badge v-if="downloadStore?.newDownloads?.some((d) => d.id === download.id)"
                class="bg-green-600 hover:bg-green-700">
                New
              </Badge>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div v-else>
      <p class="text-sm text-neutral-500">You haven't downloaded any files yet. Once you do, they will appear here.</p>
    </div>
  </div>
</template>
