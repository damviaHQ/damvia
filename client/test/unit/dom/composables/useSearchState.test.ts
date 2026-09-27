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
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, test } from 'vitest'
import { useSearchState } from '@/composables/useSearchState'

async function setup(query: Record<string, any>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ name: 'search', path: '/search', component: { render: () => h('div') } }] })
  await router.push({ name: 'search', query })
  let state!: ReturnType<typeof useSearchState>
  const Host = defineComponent({ setup() { state = useSearchState(); return () => h('div') } })
  mount(Host, { global: { plugins: [router] } })
  return { router, state }
}

describe('useSearchState', () => {
  test('derives terms, filters and scope from the route', async () => {
    const { state } = await setup({ q: 'red, hat', from_collection: 'c1', search_scope: 'current', asset_types: 't1', 'attributes[a]': ['x', 'y'] })
    expect(state.terms.value).toEqual(['red', 'hat'])
    expect(state.hasQuery.value).toBe(true)
    expect(state.isScoped.value).toBe(true)
    expect(state.filters.value.map((filter) => filter.value)).toEqual(['t1', 'x', 'y'])
  })

  test('record filters reach the catalogue input and survive navigation', async () => {
    const { router, state } = await setup({ kind: 'products', q: 'red, hat', from_collection: 'c1', search_scope: 'current', page: '3' })
    state.toggleValue('attributes[color]', 'Red')
    await flushPromises()
    expect(state.recordInput.value).toEqual({
      collectionId: 'c1', collectionOnly: true, search: undefined, searchTerms: ['red', 'hat'],
      filters: [{ column: 'color', op: 'has_any', values: ['Red'] }],
    })
    expect(router.currentRoute.value.query.kind).toBe('products')
    expect(state.form.value.page).toBeUndefined()
    state.setExactMatch(true)
    await flushPromises()
    expect(state.recordInput.value.search).toBe('red, hat')
    expect(state.recordInput.value.searchTerms).toBeUndefined()
    state.clearFilters()
    await flushPromises()
    expect(state.recordInput.value.filters).toEqual([])
    expect(router.currentRoute.value.query.kind).toBe('products')
  })

  test('a repeated q param does not break the derived state', async () => {
    const { state } = await setup({ q: ['red hat', 'blue'], exact_match: 'true', page: ['2', '3'] })
    expect(state.terms.value).toEqual(['red hat'])
    expect(state.form.value.page).toBe(2)
    const { state: tokens } = await setup({ q: ['red, hat', 'blue'] })
    expect(tokens.terms.value).toEqual(['red', 'hat'])
  })

  test('exact mode keeps the phrase as one term', async () => {
    const { state } = await setup({ q: ' red hat ', exact_match: 'true' })
    expect(state.terms.value).toEqual(['red hat'])
  })

  test('every change is a route push and resets the page', async () => {
    const { router, state } = await setup({ q: 'a', page: '2', file_types: 'image', 'attributes[a]': 'x' })
    state.toggleValue('file_types', 'video')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'a', file_types: ['image', 'video'], 'attributes[a]': 'x' })
    state.clearFilters()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'a' })
    state.setExactMatch(true)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'a', exact_match: 'true' })
    state.setExactMatch(false)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'a' })
    state.setTerms([])
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    state.setPage(3)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ page: '3' })
  })
})
