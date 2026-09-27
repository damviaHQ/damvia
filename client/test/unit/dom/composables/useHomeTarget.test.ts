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
import { afterEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

const api = vi.hoisted(() => ({ menu: vi.fn(), tree: vi.fn() }))
const store = vi.hoisted(() => ({ user: { role: 'member' } as { role: string } | undefined }))
vi.mock('@/services/server', () => ({ trpc: { menuItem: { list: { query: api.menu } }, collection: { tree: { query: api.tree } } } }))
vi.mock('@/stores/globalStore', () => ({ useGlobalStore: () => store }))

const { findHome, useHomeTarget } = await import('@/composables/useHomeTarget')

const unmount: (() => void)[] = []
afterEach(() => {
  unmount.splice(0).forEach(done => done())
  vi.resetAllMocks()
  store.user = { role: 'member' }
})

async function target(menu: unknown[], tree: unknown[]) {
  api.menu.mockResolvedValue(menu)
  api.tree.mockResolvedValue(tree)
  let home!: ReturnType<typeof useHomeTarget>
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = mount(defineComponent({ setup() { home = useHomeTarget(); return () => h('div') } }), { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } })
  unmount.push(() => { wrapper.unmount(); client.clear() })
  expect(home.target.value).toBeNull()
  await flushPromises()
  return home.target.value
}

describe('home target', () => {
  test('the home item is found at any depth, the first one winning', () => {
    const nested = { type: 'page', pageId: 'p2', home: true }
    const items = [
      { type: 'section', children: [{ type: 'collection', collectionId: 'c1' }, { type: 'section', children: [nested] }] },
      { type: 'page', pageId: 'p3', home: true },
    ]
    expect(findHome(items)).toBe(nested)
    expect(findHome([{ type: 'page', pageId: 'p1' }])).toBeNull()
    expect(findHome(undefined)).toBeNull()
  })

  test('home leads to the page or collection marked as home', async () => {
    expect(await target([{ type: 'page', pageId: 'welcome', home: true }], [{ id: 'first' }])).toEqual({ name: 'page', params: { id: 'welcome' } })
    expect(await target([{ type: 'section', children: [{ type: 'collection', collectionId: 'c9', home: true }] }], [{ id: 'first' }])).toEqual({ name: 'collection', params: { id: 'c9' } })
  })

  test('without a home item, or for a guest, home is the first collection', async () => {
    expect(await target([{ type: 'page', pageId: 'welcome' }], [{ id: 'first' }, { id: 'second' }])).toEqual({ name: 'collection', params: { id: 'first' } })
    store.user = { role: 'guest' }
    expect(await target([{ type: 'page', pageId: 'welcome', home: true }], [{ id: 'shared' }])).toEqual({ name: 'collection', params: { id: 'shared' } })
  })

  test('there is nowhere to go when nothing can be opened', async () => {
    expect(await target([], [])).toBe(false)
    // A home item that points at nothing does not fall back to a collection.
    expect(await target([{ type: 'page', pageId: null, home: true }], [{ id: 'first' }])).toBe(false)
  })
})
