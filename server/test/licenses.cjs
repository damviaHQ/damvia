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
// Licences: their terms, dates, scopes and regions, and what removing one frees.
// See docs/administration/licenses.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, caller, makeFolder, makeFile, forbidden } = harness
const { License, AssetFolder, AssetFile } = harness.entities
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const licenseRow = id => db.getRepository(License).findOneBy({ id })
const input = extra => ({ name: 'Campaign 2030', scopes: ['print'], allowedRegionIds: [fixtures.region.id], ...extra })

test('licences are managed by an approved, verified admin only', async () => {
    const license = await caller(fixtures.admin).license.create(input())
    for (const user of [null, fixtures.guest, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.license.list())
        await forbidden(as.license.create(input({ name: 'Refused' })))
        await forbidden(as.license.update({ id: license.id, ...input({ name: 'Refused' }) }))
        await forbidden(as.license.remove(license.id))
    }
    assert.equal((await licenseRow(license.id)).name, 'Campaign 2030')
    assert.equal(await db.getRepository(License).countBy({ name: 'Refused' }), 0)
})

test('a created licence keeps its dates, scopes and regions, and its terms lose anything that can execute', async () => {
    const admin = caller(fixtures.admin)
    const created = await admin.license.create(input({
        details: '<p>Print only</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
        usageFrom: '2030-01-01', usageTo: '2030-12-31', scopes: ['print', 'digital'],
    }))
    assert.equal(created.details, '<p>Print only</p><a rel="noopener noreferrer">x</a>')
    const stored = await licenseRow(created.id)
    assert.deepEqual([stored.name, stored.details, stored.scopes, stored.allowedRegionIds], ['Campaign 2030', '<p>Print only</p><a rel="noopener noreferrer">x</a>', ['print', 'digital'], [fixtures.region.id]])
    assert.deepEqual([String(stored.usageFrom), String(stored.usageTo)], ['2030-01-01', '2030-12-31'])
    const listed = (await admin.license.list()).find(license => license.id === created.id)
    assert.deepEqual(Object.keys(listed).sort(), ['allowedRegionIds', 'details', 'id', 'name', 'scopes', 'usageFrom', 'usageTo'])
    assert.equal(listed.details, '<p>Print only</p><a rel="noopener noreferrer">x</a>')
    const unnamed = await admin.license.create({ scopes: [], allowedRegionIds: [] })
    assert.deepEqual([unnamed.name, unnamed.details, unnamed.usageFrom, unnamed.usageTo], ['', null, null, null])
    for (const invalid of [input({ scopes: ['broadcast'] }), input({ allowedRegionIds: ['not-a-uuid'] }), input({ name: 'x'.repeat(51) })]) {
        await assert.rejects(admin.license.create(invalid), error => error.code === 'BAD_REQUEST')
    }
})

test('an update replaces the terms and dates, and keeps the name when none is given', async () => {
    const admin = caller(fixtures.admin)
    const created = await admin.license.create(input({ details: '<p>Old terms</p>', usageFrom: '2030-01-01', usageTo: '2030-06-30' }))
    const updated = await admin.license.update({ id: created.id, scopes: ['digital'], allowedRegionIds: [], usageTo: '2031-01-31' })
    assert.deepEqual([updated.name, updated.details, updated.usageFrom, updated.scopes, updated.allowedRegionIds], ['Campaign 2030', null, null, ['digital'], []])
    const stored = await licenseRow(created.id)
    assert.deepEqual([stored.name, stored.details, stored.usageFrom, String(stored.usageTo)], ['Campaign 2030', null, null, '2031-01-31'])
    await admin.license.update({ id: created.id, name: 'Renamed', details: '<p>New</p>', scopes: [], allowedRegionIds: [fixtures.region.id] })
    assert.deepEqual([(await licenseRow(created.id)).name, (await licenseRow(created.id)).details], ['Renamed', '<p>New</p>'])
    await assert.rejects(admin.license.update({ id: randomUUID(), ...input() }), error => error.code === 'NOT_FOUND')
})

test('removing a licence frees the folders and files it covered', async () => {
    const admin = caller(fixtures.admin)
    const license = await admin.license.create(input())
    const other = await admin.license.create(input({ name: 'Kept' }))
    const folder = await makeFolder({ licenseId: license.id })
    const file = await makeFile(folder, { licenseId: license.id })
    const elsewhere = await makeFile(await makeFolder({ licenseId: other.id }), { licenseId: other.id })
    assert.equal(await admin.license.remove(license.id), undefined)
    assert.equal(await licenseRow(license.id), null)
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ id: folder.id })).licenseId, null)
    assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: file.id })).licenseId, null)
    assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: elsewhere.id })).licenseId, other.id)
    await assert.rejects(admin.license.remove(license.id), error => error.code === 'NOT_FOUND')
})
