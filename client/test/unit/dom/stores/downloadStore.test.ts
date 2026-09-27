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
import { afterEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

const list = vi.hoisted(() => vi.fn())
vi.mock('@/services/server', () => ({ trpc: { download: { list: { query: list } } } }))

const { useDownloadStore } = await import('@/stores/downloadStore')

const download = (id: string, status: string, downloadType = 'email') => ({ id, status, downloadType, url: null, expiresAt: '', createdAt: '', updatedAt: '', fileCount: 1 })
const unmount: (() => void)[] = []
afterEach(() => {
  unmount.splice(0).forEach(done => done())
  list.mockReset()
})

async function setup(downloads: unknown[]) {
  list.mockResolvedValue(downloads)
  let store!: ReturnType<typeof useDownloadStore>
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = mount(defineComponent({ setup() { store = useDownloadStore(); return () => h('div') } }), {
    global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient: client }]] },
  })
  unmount.push(() => { wrapper.unmount(); client.clear() })
  await flushPromises()
  return store
}

describe('download store', () => {
  test('downloads already there when the app opens are not announced as new', async () => {
    const store = await setup([download('old', 'ready')])
    await store.fetchInitialDownloads()
    list.mockResolvedValue([download('old', 'ready'), download('new', 'ready'), download('pending', 'preparing')])
    store.startRefetch()
    await flushPromises()
    expect(store.newDownloads?.map(item => item.id)).toEqual(['new'])
    store.markDownloadsAsSeen()
    expect(store.newDownloads).toEqual([])
  })

  test('the initial list is read once', async () => {
    const store = await setup([])
    const calls = list.mock.calls.length
    await store.fetchInitialDownloads()
    await store.fetchInitialDownloads()
    expect(list.mock.calls.length).toBe(calls + 1)
  })

  test('polling runs while an emailed download is being prepared, and stops after', async () => {
    const store = await setup([])
    expect(store.refetchInterval).toBe(false)
    list.mockResolvedValue([download('zip', 'preparing')])
    store.startRefetch()
    expect(store.refetchInterval).toBe(500)
    await flushPromises()
    expect(store.hasPreparingDownloads).toBe(true)
    list.mockResolvedValue([download('zip', 'ready')])
    store.startRefetch()
    await flushPromises()
    await nextTick()
    expect(store.hasPreparingDownloads).toBe(false)
    expect(store.refetchInterval).toBe(false)
  })

  test('a direct download being prepared does not keep polling', async () => {
    const store = await setup([download('zip', 'preparing', 'direct')])
    expect(store.hasPreparingDownloads).toBe(false)
  })

  test('requests being prepared are counted and never go below zero', async () => {
    const store = await setup([])
    store.startPreparing()
    store.startPreparing()
    expect(store.activeDownloadRequests).toBe(2)
    store.finishPreparing()
    store.finishPreparing()
    store.finishPreparing()
    expect(store.activeDownloadRequests).toBe(0)
  })
})
