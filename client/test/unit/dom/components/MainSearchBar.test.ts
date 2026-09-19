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
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/services/server.ts', () => ({ trpc: { assetType: { list: { query: vi.fn().mockResolvedValue([{ id: 't1', name: 'Packshot', includeInSearchByDefault: true }]) } } } }))

const { default: MainSearchBar } = await import('@/components/layout-main/MainSearchBar.vue')

async function setup(query: Record<string, any> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: ['home', 'search', 'collection'].map((name) => ({ name, path: name === 'home' ? '/' : name === 'search' ? '/search' : '/collections/:id', component: { render: () => h('div') } })) })
  await router.push(Object.keys(query).length ? { name: 'search', query } : { name: 'home' })
  const wrapper = mount(MainSearchBar, { global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]], stubs: { Popover: { template: '<div><slot /></div>' }, PopoverAnchor: { template: '<div><slot /></div>' }, PopoverContent: { template: '<div><slot /></div>' } } } })
  return { router, wrapper }
}

describe('MainSearchBar', () => {
  beforeEach(() => localStorage.clear())

  test('malformed stored options fall back to the defaults instead of breaking the bar', async () => {
    for (const seeded of ['{"assetTypes":{}}', '"text"', '[]', '{"assetTypes":[1,"t1"],"searchScope":5,"exactMatch":"true"}']) {
      localStorage.setItem('damvia_search_options', seeded)
      const { wrapper } = await setup()
      expect(wrapper.find('input').exists()).toBe(true)
      wrapper.unmount()
    }
  })

  test('a repeated q param on the results page keeps the first value as the text', async () => {
    const { wrapper } = await setup({ q: ['red hat', 'other'], search_scope: ['current', 'all'], from_collection: ['c1', 'c2'] })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('red hat')
  })
})
