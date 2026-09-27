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
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useQuery } from "@tanstack/vue-query"
import { ChevronRight, ExternalLink, FileText, Folder } from "@lucide/vue"
import Loader from "@/components/Loader.vue"
import { trpc, type RouterOutput } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import MobileTopBar from "../components/MobileTopBar.vue"

type MenuItem = RouterOutput["menuItem"]["list"][number]
type Row =
  | { kind: "section", id: string, label: string }
  | { kind: "divider", id: string }
  | { kind: "link", id: string, label: string, icon: "folder" | "page" | "external", to?: object, href?: string, external?: boolean, drill?: string }

const route = useRoute()
const globalStore = useGlobalStore()
const isGuest = computed(() => globalStore.user?.role === "guest")
const itemId = computed(() => (route.params.itemId as string | undefined) || null)

const { data: menu, isLoading: menuLoading } = useQuery({ enabled: computed(() => !isGuest.value), queryKey: ["menu-items"], queryFn: () => trpc.menuItem.list.query() })
const { data: tree, isLoading: treeLoading } = useQuery({ enabled: isGuest, queryKey: ["collection", "tree"], queryFn: () => trpc.collection.tree.query() })

function findItem(items: MenuItem[] | undefined, id: string): MenuItem | null {
  for (const item of items ?? []) {
    if (item.id === id) return item
    const found = findItem(item.children as MenuItem[] | undefined, id)
    if (found) return found
  }
  return null
}
type TreeNode = RouterOutput["collection"]["tree"][number]
function findNode(nodes: TreeNode[] | undefined, id: string): TreeNode | null {
  for (const node of nodes ?? []) {
    if (node.id === id) return node
    const found = findNode(node.children as TreeNode[] | undefined, id)
    if (found) return found
  }
  return null
}

const current = computed(() => {
  if (!itemId.value) return null
  if (isGuest.value) {
    const node = findNode(tree.value, itemId.value)
    return node ? { label: node.name, to: { name: "collection", params: { id: node.id }, query: { from: "library" } } } : null
  }
  const item = findItem(menu.value, itemId.value)
  if (!item) return null
  return { label: item.collectionName ?? item.pageName ?? item.data?.label ?? "Library", to: item.type === "collection" ? { name: "collection", params: { id: item.collectionId }, query: { from: "library" } } : null }
})

function menuRow(item: MenuItem): Row[] {
  if (item.type === "divider") return [{ kind: "divider", id: item.id }]
  if (item.type === "section") return [{ kind: "section", id: item.id, label: item.data?.label ?? "" }, ...(item.children ?? []).flatMap((child: MenuItem) => menuRow(child))]
  if (item.type === "collection") {
    if (!item.hasAccess) return (item.children ?? []).flatMap((child: MenuItem) => menuRow(child))
    return [{ kind: "link", id: item.id, label: item.collectionName ?? "", icon: "folder",
      to: { name: "collection", params: { id: item.collectionId }, query: { from: "library" } },
      drill: item.children?.length ? item.id : undefined }]
  }
  if (item.type === "page") return [{ kind: "link", id: item.id, label: item.pageName ?? "", icon: "page", to: { name: "page", params: { id: item.pageId }, query: { from: "library" } } }]
  if (item.type === "text" && item.data?.url) return [{ kind: "link", id: item.id, label: item.data?.text ?? item.data.url, icon: "external", href: item.data.url, external: !!item.data.external }]
  return []
}

const rows = computed<Row[]>(() => {
  if (isGuest.value) {
    const nodes = itemId.value ? findNode(tree.value, itemId.value)?.children ?? [] : tree.value ?? []
    return (nodes as TreeNode[]).map((node) => ({ kind: "link", id: node.id, label: node.name, icon: "folder",
      to: { name: "collection", params: { id: node.id }, query: { from: "library" } }, drill: node.children?.length ? node.id : undefined }))
  }
  const level = itemId.value ? (findItem(menu.value, itemId.value)?.children ?? []) : (menu.value ?? [])
  return (level as MenuItem[]).flatMap(menuRow)
})
const loading = computed(() => isGuest.value ? treeLoading.value : menuLoading.value)
</script>

<template>
  <MobileTopBar :title="current?.label ?? 'Library'" :back="!!itemId" />
  <Loader v-if="loading" :text="true" />
  <nav v-else aria-label="Library" class="pb-4">
    <router-link v-if="current?.to" :to="current.to" class="mobile-row font-medium">
      <Folder :size="20" aria-hidden="true" /><span class="flex-1">Open {{ current.label }}</span><ChevronRight :size="18" aria-hidden="true" />
    </router-link>
    <template v-for="row in rows" :key="row.id">
      <h2 v-if="row.kind === 'section'" class="px-4 pt-6 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--dv-text-secondary)]">{{ row.label }}</h2>
      <div v-else-if="row.kind === 'divider'" class="h-3" aria-hidden="true" />
      <div v-else class="flex items-stretch border-b border-[var(--dv-color-line)]">
        <a v-if="row.href" :href="row.href" :target="row.external ? '_blank' : undefined" :rel="row.external ? 'noopener' : undefined" class="mobile-row flex-1 border-0">
          <ExternalLink :size="20" aria-hidden="true" /><span class="flex-1 truncate">{{ row.label }}</span>
        </a>
        <router-link v-else-if="row.drill" :to="{ name: 'library', params: { itemId: row.drill } }" class="mobile-row flex-1 border-0">
          <Folder :size="20" aria-hidden="true" /><span class="flex-1 truncate">{{ row.label }}</span><ChevronRight :size="18" aria-hidden="true" />
        </router-link>
        <router-link v-else :to="row.to!" class="mobile-row flex-1 border-0">
          <component :is="row.icon === 'page' ? FileText : Folder" :size="20" aria-hidden="true" /><span class="flex-1 truncate">{{ row.label }}</span>
        </router-link>
      </div>
    </template>
    <p v-if="!rows.length" class="px-4 pt-8 text-center text-[var(--dv-text-secondary)]">Nothing here yet.</p>
  </nav>
</template>

<style scoped>
.mobile-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 16px;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--dv-color-line);
}
</style>
