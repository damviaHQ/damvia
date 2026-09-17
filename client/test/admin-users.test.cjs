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
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const Module = require('node:module')
const path = require('node:path')
const sourcePath = path.join(__dirname, '../src/utils/adminUsers.ts')
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const helperModule = new Module(sourcePath, module)
helperModule._compile(compiled, sourcePath)
const { filterUsers, userState, canEditUser, canDeleteUser, canApproveUser, csvCell, usersCsv } = helperModule.exports
const base = { name: 'Alex', company: 'Studio', email: 'alex@example.test', regionId: 'eu', region: 'Europe', role: 'member', groups: [], approved: true, emailVerified: true, createdAt: '2026-09-01T00:00:00Z' }
const users = [
 { ...base, id: '1', name: 'Zoe', groups: [{ id: 'a', name: 'Retail' }] },
 { ...base, id: '2', name: 'Alex', approved: false, createdAt: '2026-09-03T00:00:00Z', groups: [{ id: 'a', name: 'Retail' }] },
 { ...base, id: '3', name: 'Jamie', emailVerified: false, regionId: 'us', region: 'USA', role: 'guest' },
]
const filters = { search: '', view: 'all', role: 'all', region: 'all', group: 'all' }
test('search, status, role, region and group filters combine and do not mutate the source', () => {
 assert.deepEqual(filterUsers(users, { ...filters, search: '  STUDIO ', view: 'pending', role: 'member', region: 'eu', group: 'a' }, 'name', true).map(u => u.id), ['2'])
 assert.equal(filterUsers(users, { ...filters, search: 'missing' }, 'name', true).length, 0)
 assert.deepEqual(filterUsers(users, { ...filters, role: 'no-guests' }, 'createdAt', false).map(u => u.id), ['2', '1'])
 assert.deepEqual(users.map(u => u.id), ['1', '2', '3'])
})
test('verification takes precedence over approval status', () => {
 assert.equal(userState(users[2]), 'unverified')
 assert.equal(userState(users[1]), 'pending')
 assert.equal(userState(users[0]), 'active')
})
test('manager actions respect region and elevated roles; self deletion is unavailable', () => {
 const manager = { id: 'manager', role: 'manager', regionId: 'eu' }
 const admin = { id: 'admin', role: 'admin', regionId: 'us' }
 assert(canApproveUser(manager, users[1]))
 assert(!canApproveUser(manager, { ...users[1], role: 'manager' }))
 assert(!canApproveUser(manager, { ...users[1], regionId: 'us' }))
 assert(!canApproveUser(admin, users[2]))
 assert(!canEditUser(manager, { ...users[0], role: 'admin' }))
 assert(canEditUser(manager, { ...users[0], id: manager.id, role: 'manager' }))
 assert(!canDeleteUser(manager, { ...users[0], id: manager.id, role: 'manager' }))
 assert(!canDeleteUser(admin, { ...users[0], id: admin.id, role: 'admin' }))
 assert(canDeleteUser(admin, users[0]))
 assert(!canEditUser(undefined, users[0]))
})
test('CSV preserves quotes and newlines while neutralising spreadsheet formulas', () => {
 assert.equal(csvCell('A, "B"'), '"A, ""B"""')
 for (const value of ['=1+1', '  =1+1', '+SUM(A1)', '-1', '@SUM(A1)', '\tvalue', '\rvalue']) assert(csvCell(value).startsWith('"\''))
 const csv = usersCsv([{ ...users[0], name: 'Line 1\nLine 2', company: '=HYPERLINK("bad")' }])
 assert(csv.startsWith('\uFEFF"Name","Email"'))
 assert(csv.includes('"Line 1\nLine 2"'))
 assert(csv.includes('"\'=HYPERLINK(""bad"")"'))
 assert(csv.includes('"Retail"'))
 assert(!csv.includes('maintenanceContact'))
})
