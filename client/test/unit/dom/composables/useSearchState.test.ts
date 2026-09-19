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
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, test } from 'vitest'
import { useSearchState } from '@/composables/useSearchState.ts'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

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

  test('exact mode keeps the phrase as one term', async () => {
    const { state } = await setup({ q: ' red hat ', exact_match: 'true' })
    expect(state.terms.value).toEqual(['red hat'])
  })

  test('every change is a route push and resets the page', async () => {
    const { router, state } = await setup({ q: 'a', page: '2', file_types: 'image', 'attributes[a]': 'x' })
    state.toggleValue('file_types', 'video')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ q: 'a', file_types: ['image', 'video'], 'attributes[a]': 'x' })
    state.clearFilters()
    await settle()
    expect(router.currentRoute.value.query).toEqual({ q: 'a' })
    state.setExactMatch(true)
    await settle()
    expect(router.currentRoute.value.query).toEqual({ q: 'a', exact_match: 'true' })
    state.setExactMatch(false)
    await settle()
    expect(router.currentRoute.value.query).toEqual({ q: 'a' })
    state.setTerms([])
    await settle()
    expect(router.currentRoute.value.query).toEqual({})
    state.setPage(3)
    await settle()
    expect(router.currentRoute.value.query).toEqual({ page: '3' })
  })
})
