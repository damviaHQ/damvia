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
import { describe, expect, test, vi } from 'vitest'
import type { RouteLocationNormalized, RouteRecordNormalized, RouteRecordRedirectOption } from 'vue-router'

vi.mock('@/stores/globalStore', () => ({ useGlobalStore: () => ({ whenReady: async () => undefined, isAuthenticated: true, user: { role: 'admin' } }) }))
vi.mock('@/composables/useIsPhone', () => ({ isPhoneNow: () => false }))

const { default: router } = await import('@/router/index')

const routes = router.getRoutes()
const named = (name: string) => routes.find(route => route.name === name)!
const byPath = (path: string) => routes.find(route => route.path === path)!
function redirectOf(record: RouteRecordNormalized, query: Record<string, string> = {}) {
  const redirect = record.redirect as RouteRecordRedirectOption
  const target = typeof redirect === 'function' ? redirect({ path: record.path, query, params: {} } as unknown as RouteLocationNormalized, {} as never) : redirect
  return router.resolve(target as Parameters<typeof router.resolve>[0])
}

describe('routes', () => {
  test('administration screens are for admins, and people for managers too', () => {
    const managers = ['admin-users', 'admin-user']
    for (const name of managers) expect(named(name).meta.roles).toEqual(['admin', 'manager'])
    const admin = routes.filter(route => route.path.startsWith('/admin') && !route.redirect && route.name && !managers.includes(route.name as string))
    expect(admin.length).toBeGreaterThan(20)
    for (const route of admin) expect(route.meta.roles, String(route.name)).toEqual(['admin'])
    // The page editor opened from the admin pages list shares the editor layout
    // with the collection page editor, which owners open without a role.
    expect(named('admin-page').meta.layout).toBe('editor')
    expect(named('collection-edit').meta.roles).toBeUndefined()
  })

  test('reading screens have no role, and the public and sign-in screens have their own layout', () => {
    for (const name of ['home', 'page', 'collection', 'my-collections', 'catalogue', 'product', 'search', 'favorites']) {
      expect(named(name).meta.roles, name).toBeUndefined()
      expect(named(name).meta.layout, name).toBe('main')
    }
    for (const name of ['login', 'sign-up', 'password-reset', 'password-update']) expect(named(name).meta.layout).toBe('auth')
    for (const name of ['privacy-policy', 'legal-information', 'link-expired']) expect(named(name).meta.layout).toBe('public')
  })

  test('only the phone screens are phone-only, and each has a phone view', () => {
    expect(routes.filter(route => route.meta.mobileOnly).map(route => route.name).sort()).toEqual(['downloads'])
    for (const route of routes.filter(route => route.meta.mobileOnly)) expect(route.meta.mobile, String(route.name)).toBeTypeOf('function')
    expect(named('downloads').meta.desktop).toEqual({ name: 'account', params: { section: 'downloads' } })
    expect(named('account').meta.mobile).toBeTypeOf('function')
    // Editing is not offered on a phone.
    for (const name of ['collection-edit', 'admin-page', 'admin-records', 'admin-settings']) expect(named(name).meta.mobile, name).toBeUndefined()
  })

  test('old addresses lead to their screen today', () => {
    expect(redirectOf(named('admin-folder-rules'))).toMatchObject({ name: 'admin-asset-types', query: { tab: 'folder-rules' } })
    expect(redirectOf(byPath('/admin/data-enrichment/fields'))).toMatchObject({ name: 'admin-records', query: { fields: '1' } })
    expect(redirectOf(byPath('/admin/data-enrichment/fields'), { tab: 'metadata' })).toMatchObject({ name: 'admin-file-metadata', query: {} })
    expect(redirectOf(byPath('/admin/data-enrichment/records/attributes'))).toMatchObject({ name: 'admin-records', query: { fields: '1' } })
    expect(redirectOf(byPath('/admin/data-enrichment/settings')).name).toBe('admin-settings')
    // The setup guide and To review are now tabs of Link to products.
    expect(redirectOf(byPath('/admin/data-enrichment'))).toMatchObject({ name: 'admin-matching' })
    expect(redirectOf(byPath('/admin/data-enrichment/unmatched'))).toMatchObject({ name: 'admin-matching', query: { tab: 'review' } })
    expect(redirectOf(byPath('/admin/data-enrichment/unmatched'), { tab: 'manual' })).toMatchObject({ name: 'admin-matching', query: { tab: 'manual' } })
    expect(redirectOf(byPath('/admin/products')).name).toBe('admin-records')
    expect(redirectOf(byPath('/admin/products/import')).name).toBe('admin-record-import')
    // A redirect to another redirect: the attributes page ends on the records.
    const attributes = redirectOf(byPath('/admin/products/attributes'))
    expect(attributes.path).toBe('/admin/data-enrichment/records/attributes')
    expect(redirectOf(byPath(attributes.path))).toMatchObject({ name: 'admin-records', query: { fields: '1' } })
  })

  test('every route has a title', () => {
    for (const route of routes.filter(route => !route.redirect)) expect(route.meta.title, route.path).toBeTruthy()
  })
})
