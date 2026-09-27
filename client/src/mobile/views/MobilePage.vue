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
import { computed, provide } from "vue"
import { useRoute } from "vue-router"
import { useQuery } from "@tanstack/vue-query"
import Loader from "@/components/Loader.vue"
import PageRenderer from "@/components/page-renderer/PageRenderer.vue"
import { PAGE_FILES_RENDERER } from "@/components/page-renderer/filesRenderer"
import { trpc } from "@/services/server"
import MobileTopBar from "../components/MobileTopBar.vue"
import MobilePageFiles from "../components/MobilePageFiles.vue"
import { menuCrumbs, menuPath, type Crumb, type MenuNode } from "../composables"

provide(PAGE_FILES_RENDERER, MobilePageFiles)
const route = useRoute()
// Home shows its collection or page in place, at "/", under the client logo.
const props = defineProps<{ homeId?: string }>()
const id = computed(() => props.homeId ?? (route.params.id as string))
const { data: menu } = useQuery({ queryKey: ["menu-items"], queryFn: () => trpc.menuItem.list.query() })
const trail = computed<Crumb[]>(() => {
  const path = menuPath(menu.value as MenuNode[] | undefined, (item) => item.type === "page" && item.pageId === id.value)
  return path ? menuCrumbs(path) : []
})
const { data: page, isLoading, error } = useQuery({
  queryKey: computed(() => ["page", id.value]),
  queryFn: () => trpc.page.findById.query(id.value),
})
</script>

<template>
  <MobileTopBar :title="page?.name ?? 'Page'" :back="!homeId" :logo="!!homeId" :trail="homeId ? undefined : trail" />
  <Loader v-if="isLoading" :text="true" />
  <p v-else-if="error" role="alert" class="px-4 pt-8 text-center text-[var(--dv-text-secondary)]">This page is not available to you.</p>
  <div v-else-if="page" class="px-4 pt-4 pb-24">
    <PageRenderer stacked :blocks="(page.blocks ?? []) as any" :assets="page.assets"
      :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
  </div>
</template>
