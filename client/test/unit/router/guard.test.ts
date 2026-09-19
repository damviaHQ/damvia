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
import { authRoutes, guardNavigation, publicRoutes } from '@/router/guard.ts'

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
})
