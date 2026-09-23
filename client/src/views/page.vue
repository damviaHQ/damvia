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
import PageSelectionContext from "@/components/PageSelectionContext.vue"
import MainPageTools from "@/components/layout-main/MainPageTools.vue"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Settings, FilePenLine } from "@lucide/vue"
import { useGlobalStore } from "@/stores/globalStore"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import Loader from "@/components/Loader.vue"
import PageFilterBar from "@/components/PageFilterBar.vue"
import PageFilterToggle from "@/components/PageFilterToggle.vue"
import PageRenderer from "@/components/page-renderer/PageRenderer.vue"
import { usePageContent } from "@/composables/usePageContent"
import { trpc } from "@/services/server.ts"
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const globalStore = useGlobalStore()
const { status, data: page, error } = useQuery({
  queryKey: computed(() => ["pages", route.params.id]),
  queryFn: () => trpc.page.findById.query(route.params.id as string),
})

const showsBar = computed(() => page.value?.showActionBar ?? true)
const { shownFiles, shownCollections, shownProducts, filterable, selectable, selection, layoutLocked, toggleSelection } = usePageContent({
  filterEnabled: showsBar,
  pageKey: () => route.params.id,
  blocks: computed(() => page.value?.blocks ?? []),
})
</script>

<template>
  <div v-if="page" class="page__container">
    <MainPageTools area="actions">
      <template v-if="showsBar">
      <PageFilterToggle :files="filterable" />
      <DisplayPreferences :files="shownFiles" :collections="shownCollections" :products="shownProducts.length ? shownProducts : undefined" :layout-locked="layoutLocked" />
      </template>
      <DropdownMenu v-if="globalStore.user?.role === 'admin'">
        <DropdownMenuTrigger as-child><Button aria-label="Page actions" title="Page actions" variant="ghost" size="icon-sm"><Settings /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" :collision-padding="12">
          <DropdownMenuItem as-child><router-link :to="{ name: 'admin-page', params: { id: page.id } }"><FilePenLine class="size-4" />Edit page</router-link></DropdownMenuItem>
          <DropdownMenuItem as-child><router-link :to="{ name: 'admin-pages' }"><Settings class="size-4" />Manage pages</router-link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MainPageTools>
    <MainPageTools area="context">
      <PageSelectionContext :items="[{ id: page.id, label: page.name ?? 'Page' }]" :selected-count="selection.length"
        :selectable-count="selectable.length" selection-label="Select all items on this page" @toggle="toggleSelection" />
    </MainPageTools>
    <MainPageTools area="filters"><PageFilterBar :show-summary="false" v-if="showsBar" :files="filterable" :collections="shownCollections" /></MainPageTools>
    <PageRenderer :blocks="page.blocks ?? []" :assets="page.assets"
      :generate-route="(c) => ({ name: 'collection', params: { id: c.id } })" />
  </div>
  <div v-else-if="status === 'pending'">
    <Loader :text="true" />
  </div>
  <div v-else-if="status === 'error'" role="alert" class="alert alert-danger">
    {{ error?.message }}
  </div>
</template>
