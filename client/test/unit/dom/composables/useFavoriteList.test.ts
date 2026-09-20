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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { computed, defineComponent, h } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { useFavoriteList } from '@/composables/useFavoriteList'

const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/composables/useGlobalToast', () => ({ useGlobalToast: () => toast }))

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const wrappers: VueWrapper[] = []
const clients: QueryClient[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  clients.splice(0).forEach(client => client.clear())
  vi.clearAllMocks()
})
function fixture(initial = [{ id: 'a' }, { id: 'b' }]) {
  let saved = [...initial]
  const writes = new Map<string, ReturnType<typeof deferred>>()
  const list = vi.fn(async () => [...saved])
  const remove = vi.fn(async (id: string) => {
    const write = deferred()
    writes.set(id, write)
    await write.promise
    saved = saved.filter(item => item.id !== id)
  })
  const add = vi.fn(async (id: string) => {
    const write = deferred()
    writes.set(id, write)
    await write.promise
    saved.push({ id })
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  function observe() {
    let favorites!: ReturnType<typeof useFavoriteList<{ id: string }>>
    const wrapper = mount(defineComponent({
      setup() {
        favorites = useFavoriteList({ queryKey: computed(() => ['favorites', 'user']), enabled: computed(() => true), list, add, remove })
        return () => h('div')
      },
    }), { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } })
    wrappers.push(wrapper)
    return favorites
  }
  return { observe, writes, list, add, remove, client }
}

describe('shared favorite updates', () => {
  it('updates every observer immediately and prevents duplicate writes for the same item', async () => {
    const f = fixture()
    const first = f.observe()
    const second = f.observe()
    await vi.waitFor(() => expect(second.isFavorite('a')).toBe(true))
    first.toggle({ id: 'a' })
    await vi.waitFor(() => expect(second.isFavorite('a')).toBe(false))
    expect(second.isSaving('a')).toBe(true)
    second.toggle({ id: 'a' })
    expect(f.remove).toHaveBeenCalledTimes(1)
    expect(f.add).not.toHaveBeenCalled()
    f.writes.get('a')!.resolve()
    await vi.waitFor(() => expect(second.isSaving('a')).toBe(false))
    await vi.waitFor(() => expect(f.list).toHaveBeenCalledTimes(2))
    expect(second.isFavorite('a')).toBe(false)
  })

  it('keeps pending removals when another view mounts or invalidates the list', async () => {
    const f = fixture()
    const first = f.observe()
    await vi.waitFor(() => expect(first.isSuccess.value).toBe(true))
    first.toggle({ id: 'a' })
    await vi.waitFor(() => expect(f.remove).toHaveBeenCalledTimes(1))
    const second = f.observe()
    await f.client.invalidateQueries({ queryKey: ['favorites'] })
    expect(f.list).toHaveBeenCalledTimes(1)
    expect(second.isFavorite('a')).toBe(false)
    f.writes.get('a')!.resolve()
    await vi.waitFor(() => expect(f.list).toHaveBeenCalledTimes(2))
    expect(second.isFavorite('a')).toBe(false)
  })

  it('rolls back only the failed removal while another removal is still saving', async () => {
    const f = fixture()
    const first = f.observe()
    const second = f.observe()
    await vi.waitFor(() => expect(first.isSuccess.value).toBe(true))
    first.toggle({ id: 'a' })
    second.toggle({ id: 'b' })
    await vi.waitFor(() => expect(f.remove).toHaveBeenCalledTimes(2))
    expect(first.data.value).toEqual([])
    f.writes.get('a')!.reject(new Error('Unable to save'))
    await vi.waitFor(() => expect(first.isSaving('a')).toBe(false))
    expect(first.data.value).toEqual([{ id: 'a' }])
    expect(first.isSaving('b')).toBe(true)
    expect(f.list).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Unable to save')
    f.writes.get('b')!.resolve()
    await vi.waitFor(() => expect(f.list).toHaveBeenCalledTimes(2))
    expect(first.data.value).toEqual([{ id: 'a' }])
  })

  it('adds immediately and restores the previous state when saving fails', async () => {
    const f = fixture([])
    const first = f.observe()
    const second = f.observe()
    await vi.waitFor(() => expect(first.isSuccess.value).toBe(true))
    first.toggle({ id: 'a' })
    await vi.waitFor(() => expect(second.isFavorite('a')).toBe(true))
    f.writes.get('a')!.reject(new Error('Unable to save'))
    await vi.waitFor(() => expect(second.isSaving('a')).toBe(false))
    expect(second.isFavorite('a')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Unable to save')
  })
})
