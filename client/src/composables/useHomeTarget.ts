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
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { trpc } from '@/services/server'
import { useGlobalStore } from '@/stores/globalStore'

type MenuNode = { home?: boolean, type: string, pageId?: string | null, collectionId?: string | null, children?: MenuNode[] }

// The home item can sit under a section heading, so the whole menu tree is
// searched rather than its first level.
export function findHome<T extends MenuNode>(items: T[] | undefined): T | null {
  for (const item of items ?? []) {
    if (item.home) return item
    const found = findHome(item.children as T[] | undefined)
    if (found) return found
  }
  return null
}

// Where "home" leads: the menu item marked as home, or the first collection a
// guest can open. `null` while loading, `false` when there is nowhere to go.
export function useHomeTarget() {
  const globalStore = useGlobalStore()
  const menu = useQuery({ refetchOnMount: true, queryKey: ['menu-items'], queryFn: () => trpc.menuItem.list.query() })
  const tree = useQuery({ refetchOnMount: true, queryKey: ['collection', 'tree'], queryFn: () => trpc.collection.tree.query() })
  // What home shows: a collection or a page. `null` while the first load runs,
  // `false` when there is nowhere to go. Cached data answers at once.
  const home = computed<{ type: 'collection' | 'page', id: string } | false | null>(() => {
    if (menu.isPending.value || tree.isPending.value) return null
    const homeItem = findHome(menu.data.value)
    if (!homeItem || globalStore.user?.role === 'guest') {
      const first = tree.data.value?.[0]
      return first ? { type: 'collection', id: first.id } : false
    }
    if (homeItem.type === 'page' && homeItem.pageId) return { type: 'page', id: homeItem.pageId }
    if (homeItem.type === 'collection' && homeItem.collectionId) return { type: 'collection', id: homeItem.collectionId }
    return false
  })
  const target = computed<RouteLocationRaw | false | null>(() => home.value ? { name: home.value.type, params: { id: home.value.id } } : home.value)
  return { home, target, menu: menu.data }
}
