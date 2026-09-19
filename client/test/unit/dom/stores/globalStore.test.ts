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
import Cookie from 'js-cookie'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const push = vi.fn()
const me = vi.fn().mockResolvedValue({ id: 'u1', name: 'Alex', role: 'member' })
vi.mock('vue-router', () => ({ useRouter: () => ({ push, currentRoute: { value: { meta: {} } } }) }))
vi.mock('@/services/server.ts', () => ({ trpc: { user: { me: { query: me } }, env: { query: vi.fn().mockResolvedValue({ appName: 'Damvia' }) } } }))

const { useGlobalStore } = await import('@/stores/globalStore.ts')
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('global store', () => {
  beforeEach(() => {
    Cookie.remove('dam_token')
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    push.mockClear()
    me.mockClear()
    setActivePinia(createPinia())
  })

  test('selection helpers add, remove by type and id, replace and clear', () => {
    const store = useGlobalStore()
    store.setSelection([{ type: 'file', id: '1' }])
    store.addToSelection({ type: 'collection', id: '1' })
    store.addToSelection({ type: 'file', id: '2' })
    expect(store.selection).toEqual([{ type: 'file', id: '1' }, { type: 'collection', id: '1' }, { type: 'file', id: '2' }])
    store.removeFromSelection({ type: 'file', id: '1' })
    expect(store.selection).toEqual([{ type: 'collection', id: '1' }, { type: 'file', id: '2' }])
    store.clearSelection()
    expect(store.selection).toEqual([])
  })

  test('authentication follows the cookie and setAuthToken loads the user', async () => {
    const store = useGlobalStore()
    expect(store.isAuthenticated).toBe(false)
    expect(me).not.toHaveBeenCalled()
    await store.setAuthToken('token-1')
    expect(Cookie.get('dam_token')).toBe('token-1')
    expect(store.isAuthenticated).toBe(true)
    await flush()
    expect(me).toHaveBeenCalled()
    expect(store.user).toMatchObject({ id: 'u1' })
    localStorage.setItem('damvia.recentSearches', '[{"query":"secret sku","exactMatch":false}]')
    localStorage.setItem('damvia_search_options', '{"assetTypes":[],"searchScope":"all","exactMatch":false}')
    store.logout()
    expect(Cookie.get('dam_token')).toBeUndefined()
    expect(localStorage.getItem('damvia.recentSearches')).toBeNull()
    expect(localStorage.getItem('damvia_search_options')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(push).toHaveBeenCalledWith({ name: 'login' })
  })

  test('a dam_token in the URL is persisted as the session cookie', () => {
    window.history.replaceState({}, '', '/collections/c1?dam_token=shared')
    const store = useGlobalStore()
    expect(Cookie.get('dam_token')).toBe('shared')
    expect(store.isAuthenticated).toBe(true)
  })

  test('display preferences persist in localStorage and can be cleared', () => {
    const store = useGlobalStore()
    store.setDisplayPreferences('type-1', 'list')
    expect(JSON.parse(localStorage.getItem('dam_display_preferences') ?? '{}')).toEqual({ 'type-1': 'list' })
    setActivePinia(createPinia())
    const reloaded = useGlobalStore()
    expect(reloaded.displayPreferences).toEqual({ 'type-1': 'list' })
    reloaded.clearDisplayPreferences()
    expect(localStorage.getItem('dam_display_preferences')).toBeNull()
    expect(reloaded.displayPreferences).toEqual({})
  })
})
