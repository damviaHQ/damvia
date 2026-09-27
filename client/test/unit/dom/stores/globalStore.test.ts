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
const me = vi.fn()
const logoutMutation = vi.fn().mockResolvedValue(undefined)
const upgradeLegacyToken = vi.fn().mockResolvedValue(undefined)
vi.mock('vue-router', () => ({ useRouter: () => ({ push, currentRoute: { value: { meta: {} } } }) }))
vi.mock('@/services/server', () => ({
  upgradeLegacyToken,
  trpc: {
    user: { me: { query: me } },
    auth: { logout: { mutate: logoutMutation } },
    env: { query: vi.fn().mockResolvedValue({ appName: 'Damvia' }) },
  },
}))

const { useGlobalStore } = await import('@/stores/globalStore')
const { queryClient } = await import('@/services/queryClient')

describe('global store', () => {
  beforeEach(() => {
    Cookie.remove('dam_token')
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    push.mockClear()
    me.mockReset()
    me.mockResolvedValue({ id: 'u1', name: 'Alex', role: 'member' })
    logoutMutation.mockClear()
    upgradeLegacyToken.mockClear()
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

  test('the session is known once user.me has answered, and logout ends it on the server', async () => {
    const store = useGlobalStore()
    expect(store.authChecked).toBe(false)
    await store.whenReady()
    expect(store.authChecked).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toMatchObject({ id: 'u1' })
    localStorage.setItem('damvia.recentSearches', '[{"query":"secret sku","exactMatch":false}]')
    localStorage.setItem('damvia_search_options', '{"assetTypes":[],"searchScope":"all","exactMatch":false}')
    store.setSelection([{ type: 'file', id: 'secret' }])
    await store.logout()
    expect(logoutMutation).toHaveBeenCalled()
    expect(store.selection).toEqual([])
    expect(localStorage.getItem('damvia.recentSearches')).toBeNull()
    expect(localStorage.getItem('damvia_search_options')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(push).toHaveBeenCalledWith({ name: 'login' })
  })

  test('an unauthenticated answer leaves the store signed out without redirecting', async () => {
    const { TRPCClientError } = await import('@trpc/client')
    const unauthorized = Object.assign(new TRPCClientError('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED' } })
    me.mockReset()
    me.mockRejectedValue(unauthorized)
    const store = useGlobalStore()
    await store.whenReady()
    expect(store.authChecked).toBe(true)
    expect(store.isAuthenticated).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  test('a legacy dam_token is traded for a session once and never kept', async () => {
    window.history.replaceState({}, '', '/collections/c1?dam_token=shared&tab=files')
    Cookie.set('dam_token', 'cookie-token')
    const store = useGlobalStore()
    await store.whenReady()
    expect(upgradeLegacyToken).toHaveBeenCalledWith('shared')
    expect(Cookie.get('dam_token')).toBeUndefined()
    expect(window.location.search).toBe('?tab=files')
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

  test('variants are grouped until the reader switches it off, and clearing turns it back on', () => {
    const store = useGlobalStore()
    expect(store.groupVariants).toBe(true)
    store.setGroupVariants(false)
    setActivePinia(createPinia())
    const reloaded = useGlobalStore()
    expect(reloaded.groupVariants).toBe(false)
    reloaded.clearDisplayPreferences()
    expect(reloaded.groupVariants).toBe(true)
    expect(localStorage.getItem('dam_group_variants')).toBeNull()
  })

  test('a stored masonry size survives a reload and an unknown one is dropped', () => {
    localStorage.setItem('dam_display_details', JSON.stringify({
      'type-1': { masonrySize: 4, columns: ['size'] },
      'type-2': { masonrySize: 9 },
      'type-3': { masonrySize: 'large' },
    }))
    const store = useGlobalStore()
    expect(store.displayDetails['type-1']).toEqual({ masonrySize: 4, columns: ['size'] })
    expect(store.displayDetails['type-2']).toEqual({})
    expect(store.displayDetails['type-3']).toEqual({})
  })

  test('the page filters are saved only on Save, and a bad or foreign entry is dropped', () => {
    const store = useGlobalStore()
    expect(store.pageFilters).toEqual([])
    store.togglePageFilter('assetTypes')
    store.togglePageFilter('extensions')
    expect(store.pageFiltersChanged).toBe(true)
    expect(localStorage.getItem('dam_page_filters')).toBeNull()
    store.savePageFilters()
    expect(store.pageFiltersChanged).toBe(false)
    store.togglePageFilter('extensions')
    expect(store.pageFilters).toEqual(['assetTypes'])
    expect(store.pageFiltersChanged).toBe(true)
    setActivePinia(createPinia())
    expect(useGlobalStore().pageFilters).toEqual(['assetTypes', 'extensions'])
    useGlobalStore().clearPageFilters()
    expect(useGlobalStore().pageFilters).toEqual([])

    // The name filter is always on the bar, so it is never stored as one.
    localStorage.setItem('dam_page_filters', JSON.stringify(['name', 'orientations', 3, null]))
    setActivePinia(createPinia())
    expect(useGlobalStore().pageFilters).toEqual(['orientations'])
    for (const stored of ['{broken', '{"assetTypes":true}', '"assetTypes"']) {
      localStorage.setItem('dam_page_filters', stored)
      setActivePinia(createPinia())
      expect(useGlobalStore().pageFilters).toEqual([])
    }
  })

  test('display details merge per type, and a reset forgets the view and the details of that type only', () => {
    const store = useGlobalStore()
    store.setDisplayPreferences('photo', 'masonry')
    store.setDisplayPreferences('video', 'list')
    store.setDisplayDetails('photo', { columns: ['size'] })
    store.setDisplayDetails('photo', { masonrySize: 2 })
    store.setDisplayDetails('video', { columns: ['format'] })
    expect(store.displayDetails.photo).toEqual({ columns: ['size'], masonrySize: 2 })
    expect(JSON.parse(localStorage.getItem('dam_display_details')!)).toEqual({ photo: { columns: ['size'], masonrySize: 2 }, video: { columns: ['format'] } })
    store.resetDisplayPreference('photo')
    expect(store.displayPreferences).toEqual({ video: 'list' })
    expect(store.displayDetails).toEqual({ video: { columns: ['format'] } })
    setActivePinia(createPinia())
    const reloaded = useGlobalStore()
    expect(reloaded.displayPreferences).toEqual({ video: 'list' })
    expect(reloaded.displayDetails).toEqual({ video: { columns: ['format'] } })
  })

  test('ending a session empties the query cache for the next person', async () => {
    const clear = vi.spyOn(queryClient, 'clear')
    const store = useGlobalStore()
    await store.whenReady()
    expect(clear).not.toHaveBeenCalled()
    await store.logout()
    expect(clear).toHaveBeenCalledTimes(1)
    clear.mockRestore()
  })

  test('a session that expires while signed in is cleared and sent to sign in', async () => {
    const { TRPCClientError } = await import('@trpc/client')
    const clear = vi.spyOn(queryClient, 'clear')
    const store = useGlobalStore()
    await store.whenReady()
    store.setSelection([{ type: 'file', id: 'f1' }])
    me.mockRejectedValue(Object.assign(new TRPCClientError('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED' } }))
    await store.fetchUser()
    expect(store.isAuthenticated).toBe(false)
    expect(store.selection).toEqual([])
    expect(clear).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ name: 'login' })
    clear.mockRestore()
  })
})
