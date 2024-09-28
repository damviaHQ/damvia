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
import thumbnailPlaceholder from "@/assets/thumbnail-placeholder.svg"
import AdminAssetsLinkTree from "@/components/admin/AdminAssetsLinkTree.vue"
import Loader from "@/components/Loader.vue"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Copyright, FileCog, Folder, GripVertical, Server } from "lucide-vue-next"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"

export type Asset = RouterOutput["asset"]["tree"][number]

const route = useRoute()
const queryClient = useQueryClient()
const toast = useGlobalToast()
const isEditModalOpen = ref(false)
const NO_ASSET_TYPE = "NO_ASSET_TYPE"
const NO_LICENSE = "NO_LICENSE"
const itemsToDisplay = 3
const form = ref<{ assetTypeId: string; licenseId: string }>({
  assetTypeId: NO_ASSET_TYPE,
  licenseId: NO_LICENSE,
})
const { data: assetTypes } = useQuery({
  queryKey: ["asset-types"],
  queryFn: () => trpc.assetType.list.query(),
})
const { data: licenses } = useQuery({
  queryKey: ["licenses"],
  queryFn: () => trpc.license.list.query(),
})
const { data: asset, isPending: isAssetLoading } = useQuery({
  enabled: computed(() => !!route.params.id),
  queryKey: computed(() => ["asset", route.params.id]),
  queryFn: () => trpc.asset.findById.query(route.params.id as string),
})
const { status, data: assets, error } = useQuery({
  queryKey: ["asset", "tree"],
  queryFn: () => trpc.asset.tree.query(),
})

const assetPath = computed(() => {
  if (!asset.value) {
    return []
  }
  const path = [asset.value]
  for (let current = asset.value.parent; current; current = current.parent) {
    path.push(current)
  }
  return path.reverse()
})

watch([asset], () => {
  form.value = {
    assetTypeId: asset.value?.assetTypeId ?? NO_ASSET_TYPE,
    licenseId: asset.value?.licenseId ?? NO_LICENSE,
  }
})

const assetPaths = computed(() => {
  const paths: string[][] = []
  const pushItems = (prefix: string[], assets: Asset[]) =>
    assets?.forEach((asset) => {
      paths.push([...prefix, asset.id])
      if (asset.children) {
        pushItems([...prefix, asset.id], asset.children)
      }
    })
  if (assets.value) {
    pushItems([], assets.value)
  }
  return paths
})
const openAssets = computed(() => {
  if (!(route.name === "admin-assets" && route.params.id)) {
    return []
  }
  return assetPaths.value.find((item) => item[item.length - 1] === route.params.id)
})
const rootAssets = computed(() => assets.value?.filter((asset) => !asset.parentId) ?? [])
const dropdownItems = computed(() => {
  if (assetPath.value.length <= itemsToDisplay) return []
  return assetPath.value.slice(1, -2)
})
const visibleItems = computed(() => {
  if (assetPath.value.length <= itemsToDisplay) return assetPath.value
  return [
    assetPath.value[0],
    { id: "ellipsis", name: "...", isEllipsis: true },
    ...assetPath.value.slice(-2),
  ]
})

function onSubmit() {
  trpc.asset.update
    .mutate({
      id: asset.value.id,
      assetTypeId:
        form.value.assetTypeId === NO_ASSET_TYPE ? null : form.value.assetTypeId,
      licenseId: form.value.licenseId === NO_LICENSE ? null : form.value.licenseId,
    })
    .then(() => queryClient.invalidateQueries({ queryKey: ["asset", route.params.id] }))
    .then(() => {
      toast.success("Asset Types and License settings saved")
      isEditModalOpen.value = false
    })
    .catch((error) => toast.error((error as Error).message))
}

function onAssetTypeChange(value: string) {
  form.value.assetTypeId = value
}

function onLicenseChange(value: string) {
  form.value.licenseId = value
}


function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2)
}
</script>

<template>
  <div v-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" class="alert alert-danger">
    {{ error?.message }}
  </div>
  <ResizablePanelGroup v-else-if="status === 'success'" :key="asset?.id" direction="horizontal"
    class="h-screen max-h-screen">
    <ResizablePanel :default-size="25" class="bg-neutral-100">
      <div class="h-screen max-h-screen overflow-y-auto py-8 px-4">
        <div class="text-neutral-500 text-sm mb-8">OneDrive Folders</div>
        <AdminAssetsLinkTree v-for="asset in assets" :key="asset.id" :asset="asset" :open-items="openAssets ?? []" />
      </div>
    </ResizablePanel>
    <ResizableHandle>
      <GripVertical class="w-4 h-4 text-neutral-400" />
    </ResizableHandle>
    <ResizablePanel :default-size="75">
      <div class="asset__main w-full h-screen max-h-screen overflow-y-auto p-8">
        <div class="menu-items__top flex flex-col gap-5 mb-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink>
                  <router-link :to="{ name: 'admin-assets' }">Assets</router-link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <template v-if="asset">
                <template v-for="(item, index) in visibleItems" :key="item.id">
                  <BreadcrumbItem class="text-neutral-500 hover:text-neutral-800">
                    <template v-if="item.isEllipsis">
                      <DropdownMenu>
                        <DropdownMenuTrigger class="flex items-center gap-1 hover:bg-transparent"
                          aria-label="Toggle menu">
                          <BreadcrumbEllipsis class="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem v-for="dropItem in dropdownItems" :key="dropItem.id">
                            <router-link :to="{ name: 'admin-assets', params: { id: dropItem.id } }">
                              {{ dropItem.name }}
                            </router-link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </template>
                    <template v-else>
                      <BreadcrumbLink v-if="index < visibleItems.length - 1" as-child>
                        <router-link :to="{ name: 'admin-assets', params: { id: item.id } }"
                          class="max-w-20 truncate md:max-w-none">
                          {{ item.name }}
                        </router-link>
                      </BreadcrumbLink>
                      <BreadcrumbPage v-else class="max-w-20 truncate md:max-w-none font-medium text-neutral-800">
                        {{ item.name }}
                      </BreadcrumbPage>
                    </template>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator v-if="index < visibleItems.length - 1" />
                </template>
              </template>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div v-if="isAssetLoading && route.params.id">
          <Loader :text="true" />
        </div>
        <template v-else-if="asset">
          <div class="asset__header flex gap-2 items-end my-8">
            <div class="flex flex-col">
              <div class="flex gap-2 items-center">
                <router-link :to="{ name: 'admin-asset-types' }"
                  class="flex gap-1 items-center hover:text-neutral-800 hover:underline">
                  <FileCog class="w-4 h-4" />
                  Asset Type
                </router-link>
              </div>
              <Select v-model="form.assetTypeId" @update:modelValue="onAssetTypeChange" class="flex flex-col">
                <SelectTrigger class="w-[180px]">
                  <SelectValue placeholder="Select Asset Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NO_ASSET_TYPE">No asset type</SelectItem>
                  <SelectItem v-for="type in assetTypes" :key="type.id" :value="type.id">
                    {{ type.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex flex-col">
              <div class="flex gap-2 items-center">
                <router-link :to="{ name: 'admin-licenses' }"
                  class="flex gap-1 items-center hover:text-neutral-800 hover:underline">
                  <Copyright class="w-4 h-4" />
                  License
                </router-link>
              </div>
              <Select v-model="form.licenseId" @update:modelValue="onLicenseChange">
                <SelectTrigger class="w-[180px]">
                  <SelectValue placeholder="Select License" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NO_LICENSE">No license</SelectItem>
                  <SelectItem v-for="license in licenses" :key="license.id" :value="license.id">
                    {{ license.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" @click="onSubmit">Save</Button>
          </div>
          <div class="asset__folder-container flex flex-wrap gap-5 mb-5">
            <div v-for="folder in asset.children" :key="folder.id" class="asset__folder">
              <router-link :to="{ name: 'admin-assets', params: { id: folder.id } }"
                class="flex flex-col items-center justify-center w-full h-[150px] transition-colors bg-neutral-100 hover:bg-neutral-200">
                <Folder class="w-20 h-20 fill-neutral-600" />
              </router-link>
              <div class="text-neutral-500 truncate w-full mt-1 text-sm">
                {{ folder.name }}
              </div>
            </div>
          </div>
          <div class="asset__file-container flex flex-wrap gap-5">
            <div v-for="file in asset.files" :key="file.id" class="asset__file relative">
              <div class="w-[150px] h-[110px] overflow-hidden bg-neutral-100">
                <img :src="file.thumbnailURL ?? thumbnailPlaceholder" :alt="file.name" class="asset__file-thumbnail" />
                <Badge class="absolute top-1 right-1">
                  {{ getFileExtension(file.name).toUpperCase() }}
                </Badge>
              </div>
              <div class="text-neutral-500 truncate w-full mt-1 text-sm">
                {{ file.name }}
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="flex flex-wrap gap-5 h-auto mt-10">
            <div v-for="folder in rootAssets" :key="folder.id" class="asset__folder">
              <router-link :to="{ name: 'admin-assets', params: { id: folder.id } }"
                class="flex flex-col items-center justify-center w-full transition-colors">
                <Server class="w-20 h-20" />
                <div class="text-neutral-500 truncate w-full mt-1 text-sm">
                  {{ folder.name }}
                </div>
              </router-link>
            </div>
          </div>
        </template>
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
</template>

<style scoped>
.asset__folder-container,
.asset__file-container {
  width: 100%;
}

.asset__folder,
.asset__file {
  width: 150px;
}

.asset__folder {
  height: 190px;
}

.asset__folder-name,
.asset__file-name {
  width: 100%;
  padding: 8px;
  font-size: 14px;
  color: #374151;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset__file-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.asset__file {
  position: relative;
}
</style>

<style>
:deep(.resizable-handle) {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
