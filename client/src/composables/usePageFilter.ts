/* Damvia - Open Source Digital Asset Manager
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
along with this program. If not, see <https://www.gnu.org/licenses/>. */
import {
  emptyPageFilter,
  isPageFilterActive,
  matchesCollection,
  matchesFile,
  type FilterableCollection,
  type FilterableFile,
  type PageFilterState,
} from '@/utils/pageFilter'
import { computed, inject, provide, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'

export type PageFilter = {
  state: Ref<PageFilterState>
  isActive: ComputedRef<boolean>
  setName: (name: string) => void
  toggleValue: (key: string, value: string) => void
  clearDimension: (key: string) => void
  clear: () => void
  filterFiles: <T extends FilterableFile>(files: T[]) => T[]
  filterCollections: <T extends FilterableCollection>(collections: T[]) => T[]
}

const key = Symbol('page-filter') as InjectionKey<PageFilter>

// The reader narrows what a page draws without leaving for the search: the state
// lives in the view, the renderers ask for it. Deliberately shaped like
// usePageListings, so a page has one idiom rather than two.
export function providePageFilter(): PageFilter {
  const state = ref<PageFilterState>(emptyPageFilter())
  const isActive = computed(() => isPageFilterActive(state.value))

  function setName(name: string) {
    state.value = { ...state.value, name }
  }

  // One entry point for every dimension, so a chip is removed the same way it
  // was added, whatever it holds.
  function toggleValue(key: string, value: string) {
    if (key === 'name') {
      setName('')
      return
    }
    if (key.startsWith('attribute:')) {
      const attributeId = key.slice('attribute:'.length)
      const values = state.value.attributes[attributeId] ?? []
      const next = values.includes(value) ? values.filter(current => current !== value) : [...values, value]
      const attributes = { ...state.value.attributes }
      if (next.length) attributes[attributeId] = next
      else delete attributes[attributeId]
      state.value = { ...state.value, attributes }
      return
    }
    if (key === 'assetTypes' || key === 'fileTypes' || key === 'extensions') {
      const values = state.value[key]
      state.value = {
        ...state.value,
        [key]: values.includes(value) ? values.filter(current => current !== value) : [...values, value],
      }
    }
  }

  // Taking a filter off the bar takes its values with it: a filter nobody can
  // see must not keep narrowing the page.
  function clearDimension(key: string) {
    if (key === 'name') {
      setName('')
      return
    }
    if (key.startsWith('attribute:')) {
      const attributes = { ...state.value.attributes }
      delete attributes[key.slice('attribute:'.length)]
      state.value = { ...state.value, attributes }
      return
    }
    if (key === 'assetTypes' || key === 'fileTypes' || key === 'extensions') {
      state.value = { ...state.value, [key]: [] }
    }
  }

  function clear() {
    state.value = emptyPageFilter()
  }

  const filter: PageFilter = {
    state,
    isActive,
    setName,
    toggleValue,
    clearDimension,
    clear,
    filterFiles: files => isActive.value ? files.filter(file => matchesFile(file, state.value)) : files,
    filterCollections: collections => isActive.value ? collections.filter(collection => matchesCollection(collection, state.value)) : collections,
  }
  provide(key, filter)
  return filter
}

// Nothing narrows a listing outside a page or a collection, where no one is
// asking: the renderers stay usable on their own.
export function usePageFilter(): PageFilter {
  return inject(key, null) ?? {
    state: ref(emptyPageFilter()),
    isActive: computed(() => false),
    setName: () => {},
    toggleValue: () => {},
    clearDimension: () => {},
    clear: () => {},
    filterFiles: files => files,
    filterCollections: collections => collections,
  }
}
