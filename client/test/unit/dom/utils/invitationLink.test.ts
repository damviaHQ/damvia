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
import { invitationLink } from '@/utils/invitationLink'

describe('invitation link', () => {
  test('opens the collection with the invited address and no credential', () => {
    const link = new URL(invitationLink('https://library.example.test', '/collections/c1', { email: 'guest@example.test', collectionId: 'c1', collectionName: 'Autumn' }))
    expect(link.origin).toBe('https://library.example.test')
    expect(link.pathname).toBe('/collections/c1')
    expect([...link.searchParams.keys()]).toEqual(['auth_params'])
    const params = JSON.parse(window.atob(link.searchParams.get('auth_params')!))
    expect(params).toEqual({ magicLink: true, email: 'guest@example.test', collectionName: 'Autumn', collectionId: 'c1' })
    expect(JSON.stringify(params)).not.toMatch(/token|password|code/i)
  })

  test('drops the query and hash of the page it was copied from', () => {
    const link = new URL(invitationLink('https://library.example.test', '/collections/c1?tab=files#top', { email: 'a@example.test', collectionId: 'c1', collectionName: 'A' }))
    expect(link.hash).toBe('')
    expect(link.searchParams.has('tab')).toBe(false)
  })
})
