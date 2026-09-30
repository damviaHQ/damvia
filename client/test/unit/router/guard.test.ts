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
import { describe, expect, test } from 'vitest'
import { authRoutes, guardNavigation, publicRoutes } from '@/router/guard'

describe('navigation guard', () => {
  test('public routes are always allowed', () => {
    for (const name of publicRoutes) {
      expect(guardNavigation({ name, query: {} }, false)).toBe(true)
      expect(guardNavigation({ name, query: {} }, true)).toBe(true)
    }
  })

  test('anonymous visitors are sent to login with their query preserved', () => {
    expect(guardNavigation({ name: 'collection', query: { dam_token: 'abc' } }, false)).toEqual({ name: 'login', query: { dam_token: 'abc' } })
    for (const name of authRoutes) expect(guardNavigation({ name, query: {} }, false)).toBeUndefined()
  })

  test('authenticated users skip the auth screens and reach everything else', () => {
    for (const name of authRoutes) expect(guardNavigation({ name, query: {} }, true)).toEqual({ name: 'home' })
    expect(guardNavigation({ name: 'home', query: {} }, true)).toBeUndefined()
    expect(guardNavigation({ name: 'admin-users', query: {} }, true)).toBeUndefined()
  })

  test('role-restricted screens send other roles home', () => {
    const users = { name: 'admin-users', query: {}, meta: { roles: ['admin', 'manager'] } }
    expect(guardNavigation(users, true, 'manager')).toBeUndefined()
    expect(guardNavigation(users, true, 'member')).toEqual({ name: 'home' })
    expect(guardNavigation({ name: 'admin-groups', query: {}, meta: { roles: ['admin'] } }, true, 'manager')).toEqual({ name: 'home' })
    expect(guardNavigation(users, false, undefined)).toEqual({ name: 'login', query: {} })
  })

  test('phone-only screens send computers home', () => {
    const library = { name: 'library', query: {}, meta: { mobileOnly: true } }
    expect(guardNavigation(library, true, 'member', true)).toBeUndefined()
    expect(guardNavigation(library, true, 'member', false)).toEqual({ name: 'home' })
    const downloads = { name: 'downloads', query: {}, meta: { mobileOnly: true, desktop: { name: 'account', params: { section: 'downloads' } } } }
    expect(guardNavigation(downloads, true, 'member', false)).toEqual({ name: 'account', params: { section: 'downloads' } })
  })

  test('phones open account downloads on their own screen', () => {
    const account = { name: 'account', query: {}, params: { section: 'downloads' }, meta: {} }
    expect(guardNavigation(account, true, 'member', true)).toEqual({ name: 'downloads' })
    expect(guardNavigation(account, true, 'member', false)).toBeUndefined()
    expect(guardNavigation({ ...account, params: { section: 'profile' } }, true, 'member', true)).toBeUndefined()
  })
})
