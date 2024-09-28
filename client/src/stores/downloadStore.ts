/* Damvia - Open Source Digital Asset Manager
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { trpc } from "@/services/server"
import { useQuery } from "@tanstack/vue-query"
import { defineStore } from "pinia"
import type { DownloadStatus, DownloadType } from "server/src/entity/download"
import { computed, ref, watch } from "vue"

interface Download {
  url: string | null
  status: DownloadStatus
  id: string
  expiresAt: string
  createdAt: string
  updatedAt: string
  downloadType: DownloadType
  fileCount: number
  size?: number
}

export const useDownloadStore = defineStore("download", () => {
  const refetchInterval = ref<number | false>(false)
  const seenDownloads = ref<string[]>([])

  const { status, data: downloads, refetch } = useQuery<Download[]>({
    queryKey: ["downloads"],
    queryFn: async (): Promise<Download[]> => {
      const result = await trpc.download.list.query()
      return result
    },
    refetchInterval,
  })

  const newDownloads = computed(() => {
    return downloads?.value?.filter(
      (download) =>
        !seenDownloads.value.includes(download.id) &&
        download.downloadType === "email" &&
        download.status === "ready"
    )
  })

  const hasPreparingDownloads = computed(() => {
    return downloads?.value?.some(
      (download) => download.status === "preparing" && download.downloadType === "email"
    )
  })

  async function fetchInitialDownloads() {
    const result = await trpc.download.list.query()
    seenDownloads.value = result.map((download) => download.id)
  }

  function startRefetch() {
    refetchInterval.value = 500
    refetch()
  }

  function stopRefetch() {
    refetchInterval.value = false
  }

  function markDownloadsAsSeen() {
    seenDownloads.value = downloads?.value?.map((download) => download.id) ?? []
  }

  watch(hasPreparingDownloads, (newValue) => {
    if (!newValue) {
      stopRefetch()
    }
  })

  return {
    startRefetch,
    stopRefetch,
    markDownloadsAsSeen,
    fetchInitialDownloads,
    downloads,
    newDownloads,
    refetchInterval,
    hasPreparingDownloads,
    status,
  }
})
