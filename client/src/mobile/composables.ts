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
import { computed } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import type { RouterOutput } from '@/services/server'
import { byPosition } from '@/utils/menuOrder'
import { useGlobalStore, type SelectionItem } from '@/stores/globalStore'

// What the phone screens need to show a file. Every file list from the API
// (collection, search, favorites, product) carries at least this.
export type MobileFile = {
  id: string
  name: string
  mimeType: string
  size: number
  thumbnailURL: string | null
  fileURL: string
  collectionId?: string | null
  license?: { id: string, name: string, details?: string | null } | null
  record?: { id: string, attributes: ({ id: string, displayName: string | null, name: string, value: unknown } | null)[] | null } | null
  metadata?: { label?: string, name?: string, displayName?: string | null, value?: unknown }[] | null
}

// The open preview lives in the address (?preview=<id>), so the phone's Back
// gesture closes it and returns to the same list and scroll position.
export function usePreviewQuery(files: () => MobileFile[]) {
  const route = useRoute()
  const router = useRouter()
  const index = computed(() => files().findIndex((file) => file.id === route.query.preview))
  function open(file: MobileFile) {
    router.push({ query: { ...route.query, preview: file.id } })
  }
  function show(next: number) {
    const file = files()[next]
    if (file) router.replace({ query: { ...route.query, preview: file.id } })
  }
  function close() {
    if (window.history.state?.back) router.back()
    else router.replace({ query: { ...route.query, preview: undefined } })
  }
  return { index, open, show, close }
}

// Selecting is an explicit mode on phones: a tap opens a file unless the
// person chose "Select" first. The selection itself is the shared one.
export function useMobileSelection() {
  const store = useGlobalStore()
  const count = computed(() => store.selection.length)
  const has = (item: SelectionItem) => store.selection.some((current) => current.type === item.type && current.id === item.id)
  function toggle(item: SelectionItem) {
    if (has(item)) store.removeFromSelection(item)
    else store.addToSelection(item)
  }
  return { selection: computed(() => store.selection), count, has, toggle, clear: () => store.clearSelection() }
}

// Where the person is in the menu. The menu is the map everyone knows from the
// computer version, so every phone screen places itself on it.
export type MenuNode = RouterOutput['menuItem']['list'][number]
export type Crumb = { label: string, to?: RouteLocationRaw }

export function menuLabel(item: MenuNode): string {
  return item.collectionName ?? item.pageName ?? item.data?.label ?? item.data?.text ?? ''
}

// The entries from the top of the menu down to the first one that matches.
export function menuPath(items: MenuNode[] | undefined, match: (item: MenuNode) => boolean): MenuNode[] | null {
  for (const item of byPosition(items)) {
    if (match(item)) return [item]
    const below = menuPath(item.children as MenuNode[] | undefined, match)
    if (below) return [item, ...below]
  }
  return null
}

// The menu parents of an entry, as a trail: collections link to themselves,
// section headings and other entries are left out.
export function menuCrumbs(path: MenuNode[]): Crumb[] {
  return path.slice(0, -1)
    .filter((item) => item.type === 'collection' && item.hasAccess)
    .map((item) => ({ label: menuLabel(item), to: { name: 'collection', params: { id: item.collectionId } } }))
}
