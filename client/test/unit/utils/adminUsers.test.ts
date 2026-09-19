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
import { canApproveUser, canDeleteUser, canEditUser, csvCell, filterUsers, userState, usersCsv, type AdminUser, type UserFilters } from '@/utils/adminUsers.ts'

const base = { name: 'Alex', company: 'Studio', email: 'alex@example.test', regionId: 'eu', region: 'Europe', role: 'member', groups: [], approved: true, emailVerified: true, createdAt: '2026-09-01T00:00:00Z' }
const users = [
  { ...base, id: '1', name: 'Zoe', groups: [{ id: 'a', name: 'Retail' }] },
  { ...base, id: '2', name: 'Alex', approved: false, createdAt: '2026-09-03T00:00:00Z', groups: [{ id: 'a', name: 'Retail' }] },
  { ...base, id: '3', name: 'Jamie', emailVerified: false, regionId: 'us', region: 'USA', role: 'guest' },
] as unknown as AdminUser[]
const filters: UserFilters = { search: '', view: 'all', role: 'all', region: 'all', group: 'all' }
const viewer = (value: object) => value as unknown as Parameters<typeof canEditUser>[0]
const role = (value: string) => value as AdminUser['role']

describe('admin user helpers', () => {
  test('search, status, role, region and group filters combine and do not mutate the source', () => {
    expect(filterUsers(users, { ...filters, search: '  STUDIO ', view: 'pending', role: 'member', region: 'eu', group: 'a' }, 'name', true).map(u => u.id)).toEqual(['2'])
    expect(filterUsers(users, { ...filters, search: 'missing' }, 'name', true)).toHaveLength(0)
    expect(filterUsers(users, { ...filters, role: 'no-guests' }, 'createdAt', false).map(u => u.id)).toEqual(['2', '1'])
    expect(users.map(u => u.id)).toEqual(['1', '2', '3'])
  })

  test('verification takes precedence over approval status', () => {
    expect(userState(users[2])).toBe('unverified')
    expect(userState(users[1])).toBe('pending')
    expect(userState(users[0])).toBe('active')
  })

  test('manager actions respect region and elevated roles; self deletion is unavailable', () => {
    const manager = viewer({ id: 'manager', role: 'manager', regionId: 'eu' })
    const admin = viewer({ id: 'admin', role: 'admin', regionId: 'us' })
    expect(canApproveUser(manager, users[1])).toBe(true)
    expect(canApproveUser(manager, { ...users[1], role: role('manager') })).toBe(false)
    expect(canApproveUser(manager, { ...users[1], regionId: 'us' })).toBe(false)
    expect(canApproveUser(admin, users[2])).toBe(false)
    expect(canEditUser(manager, { ...users[0], role: role('admin') })).toBe(false)
    expect(canEditUser(manager, { ...users[0], id: 'manager', role: role('manager') })).toBe(true)
    expect(canDeleteUser(manager, { ...users[0], id: 'manager', role: role('manager') })).toBe(false)
    expect(canDeleteUser(admin, { ...users[0], id: 'admin', role: role('admin') })).toBe(false)
    expect(canDeleteUser(admin, users[0])).toBe(true)
    expect(canEditUser(undefined, users[0])).toBe(false)
  })

  test('CSV preserves quotes and newlines while neutralising spreadsheet formulas', () => {
    expect(csvCell('A, "B"')).toBe('"A, ""B"""')
    for (const value of ['=1+1', '  =1+1', '+SUM(A1)', '-1', '@SUM(A1)', '\tvalue', '\rvalue']) expect(csvCell(value).startsWith('"\'')).toBe(true)
    const csv = usersCsv([{ ...users[0], name: 'Line 1\nLine 2', company: '=HYPERLINK("bad")' }])
    expect(csv.startsWith('﻿"Name","Email"')).toBe(true)
    expect(csv).toContain('"Line 1\nLine 2"')
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"')
    expect(csv).toContain('"Retail"')
    expect(csv).not.toContain('maintenanceContact')
  })
})
