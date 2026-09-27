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
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/services/server', () => ({ trpc: { user: { me: { query: vi.fn().mockResolvedValue({ id: 'u1', role: 'member' }) } }, env: { query: vi.fn().mockResolvedValue({ appName: 'Damvia' }) } }, upgradeLegacyToken: vi.fn() }))

const { useMobileSelection, usePreviewQuery } = await import('@/mobile/composables')
type MobileFile = import('@/mobile/composables').MobileFile

const file = (id: string) => ({ id, name: `${id}.jpg`, mimeType: 'image/jpeg', size: 1, thumbnailURL: null, fileURL: '' }) as MobileFile
const files = [file('a'), file('b'), file('c')]

async function preview(query: Record<string, string> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ name: 'collection', path: '/collections/:id', component: { render: () => h('div') } }] })
  await router.push({ name: 'collection', params: { id: 'c1' }, query })
  let state!: ReturnType<typeof usePreviewQuery>
  mount(defineComponent({ setup() { state = usePreviewQuery(() => files); return () => h('div') } }), { global: { plugins: [router] } })
  return { router, state }
}

describe('phone preview in the address', () => {
  beforeEach(() => window.history.replaceState({}, ''))

  test('the open file is read from the address', async () => {
    expect((await preview()).state.index.value).toBe(-1)
    expect((await preview({ preview: 'b' })).state.index.value).toBe(1)
    expect((await preview({ preview: 'gone' })).state.index.value).toBe(-1)
  })

  test('opening pushes a history entry, moving replaces it, and other params stay', async () => {
    const { router, state } = await preview({ sort: 'name' })
    const push = vi.spyOn(router, 'push')
    const replace = vi.spyOn(router, 'replace')
    state.open(files[0])
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'name', preview: 'a' })
    expect(state.index.value).toBe(0)
    expect(push).toHaveBeenCalledTimes(1)
    state.show(2)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'name', preview: 'c' })
    state.show(9)
    await flushPromises()
    expect(router.currentRoute.value.query.preview).toBe('c')
    expect(push).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledTimes(1)
  })

  test('closing goes back when the preview was opened here, and clears the param otherwise', async () => {
    const opened = await preview({ sort: 'name' })
    const back = vi.spyOn(opened.router, 'back')
    window.history.replaceState({ back: '/collections/c1?sort=name' }, '')
    opened.state.close()
    expect(back).toHaveBeenCalled()

    const shared = await preview({ sort: 'name', preview: 'b' })
    window.history.replaceState({}, '')
    shared.state.close()
    await flushPromises()
    expect(shared.router.currentRoute.value.query).toEqual({ sort: 'name' })
  })
})

describe('phone selection', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function selection() {
    let state!: ReturnType<typeof useMobileSelection>
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => h('div') } }] })
    mount(defineComponent({ setup() { state = useMobileSelection(); return () => h('div') } }), { global: { plugins: [router] } })
    return state
  }

  test('a tap toggles an item of the shared selection, told apart by type and id', () => {
    const state = selection()
    state.toggle({ type: 'file', id: '1' })
    state.toggle({ type: 'collection', id: '1' })
    expect(state.count.value).toBe(2)
    expect(state.has({ type: 'file', id: '1' })).toBe(true)
    expect(state.has({ type: 'record', id: '1' })).toBe(false)
    state.toggle({ type: 'file', id: '1' })
    expect(state.selection.value).toEqual([{ type: 'collection', id: '1' }])
    state.clear()
    expect(state.count.value).toBe(0)
  })
})
