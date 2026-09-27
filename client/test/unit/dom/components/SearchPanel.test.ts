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
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, test, vi } from 'vitest'

vi.mock('@/composables/useGlobalToast', () => ({ useGlobalToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

const { facets } = vi.hoisted(() => ({ facets: vi.fn().mockResolvedValue({
  total: 2, attributes: [{ id: 'color', label: 'Color', options: [{ id: 'Red', label: 'Red', count: 2 }] }],
}) }))
vi.mock('@/services/server', () => ({ trpc: {
  env: { query: vi.fn().mockResolvedValue({}) },
  catalogue: { facets: { query: facets } },
} }))
const { default: SearchPanel } = await import('@/components/search/SearchPanel.vue')
const { default: SearchFacetGroup } = await import('@/components/search/SearchFacetGroup.vue')

test('record search displays field facets and refetches counts when a value is toggled', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { name: 'search', path: '/search', component: { render: () => h('div') } },
    { name: 'home', path: '/', component: { render: () => h('div') } },
  ] })
  await router.push({ name: 'search', query: { kind: 'products', q: 'hat', page: '3' } })
  const wrapper = mount(SearchPanel, { global: {
    plugins: [router, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]],
  } })
  await flushPromises()
  const group = wrapper.findComponent(SearchFacetGroup)
  expect(group.props('title')).toBe('Color')
  expect(group.props('options')).toEqual([{ id: 'Red', label: 'Red', count: 2 }])
  group.vm.$emit('toggle', 'Red')
  await flushPromises()
  expect(router.currentRoute.value.query['attributes[color]']).toEqual(['Red'])
  expect(router.currentRoute.value.query.page).toBeUndefined()
  expect(facets).toHaveBeenLastCalledWith(expect.objectContaining({
    searchTerms: ['hat'], filters: [{ column: 'color', op: 'has_any', values: ['Red'] }],
  }))
  expect(wrapper.text()).toContain('Clear all filters (1)')
  const clear = wrapper.findAll('button').find(button => button.text() === 'Clear all filters (1)')!
  await clear.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ kind: 'products', q: 'hat' })
  wrapper.unmount()
})
