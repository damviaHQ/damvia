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
import { computed, watch, type Ref, type WatchSource } from 'vue'
import { providePageListings } from '@/composables/usePageListings'
import { providePageFilter } from '@/composables/usePageFilter'
import { useGlobalStore, type SelectionItem } from '@/stores/globalStore'

type ListingBlock = { type: string; data?: object | null }

// Both standalone pages and collection layouts select what their renderers
// announce, including blocks that list another collection's content.
export function usePageContent(options: {
  filterEnabled: Ref<boolean>
  pageKey: WatchSource
  blocks: Ref<ListingBlock[]>
}) {
  const store = useGlobalStore()
  const { files: shownFiles, collections: shownCollections, products: shownProducts } = providePageListings()
  const pageFilter = providePageFilter(options.filterEnabled)
  watch(options.pageKey, () => pageFilter.clear())
  const filterable = computed(() => [...shownFiles.value, ...shownProducts.value])
  const selectable = computed(() => {
    const items: SelectionItem[] = [
      ...pageFilter.filterFiles(shownFiles.value).map(item => ({ type: 'file' as const, id: item.id })),
      ...pageFilter.filterCollections(shownCollections.value).map(item => ({ type: 'collection' as const, id: item.id })),
      ...pageFilter.filterFiles(shownProducts.value).map(item => ({ type: 'record' as const, id: item.id })),
    ]
    return [...new Map(items.map(item => [`${item.type}:${item.id}`, item])).values()]
  })
  const selection = computed(() => selectable.value.filter(item =>
    store.selection.some(other => other.type === item.type && other.id === item.id)
  ))
  const layoutLocked = computed(() => options.blocks.value.some(block =>
    ['collections', 'files', 'last_files', 'products'].includes(block.type) && !!block.data && 'layout' in block.data && !!block.data.layout
  ))

  function toggleSelection() {
    if (selection.value.length === selectable.value.length) {
      selection.value.forEach(item => store.removeFromSelection(item))
    } else {
      const selected = new Set(selection.value.map(item => `${item.type}:${item.id}`))
      selectable.value.filter(item => !selected.has(`${item.type}:${item.id}`)).forEach(item => store.addToSelection(item))
    }
  }

  return { shownFiles, shownCollections, shownProducts, filterable, pageFilter, selectable, selection, layoutLocked, toggleSelection }
}
