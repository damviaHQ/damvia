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
// Regions: the default group of new accounts and the reach of licences.
// See docs/administration/users-and-groups.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeUser, forbidden } = harness
const { Region, License, User } = harness.entities
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const regionRow = id => db.getRepository(Region).findOneBy({ id })

test('regions are managed by an approved, verified admin only', async () => {
    const region = await save(Region, { name: `Guarded ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    for (const user of [null, fixtures.guest, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.region.list())
        await forbidden(as.region.create({ name: 'Refused', defaultGroupId: fixtures.group.id }))
        await forbidden(as.region.update({ id: region.id, name: 'Refused', defaultGroupId: fixtures.group.id }))
        await forbidden(as.region.remove(region.id))
        await forbidden(as.region.moveUsers({ fromRegionId: fixtures.region.id, toRegionId: region.id }))
    }
    assert.equal((await regionRow(region.id)).name, region.name)
    assert.equal(await db.getRepository(Region).countBy({ name: 'Refused' }), 0)
    assert.equal(await db.getRepository(User).countBy({ regionId: region.id }), 0)
})

test('the list counts the users and the licences of each region', async () => {
    const admin = caller(fixtures.admin)
    const created = await admin.region.create({ name: `Counted ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    assert.deepEqual(created, { id: created.id, name: created.name, defaultGroupId: fixtures.group.id, licenseCount: 0, userCount: 0 })
    await makeUser('member', { regionId: created.id })
    await makeUser('manager', { regionId: created.id })
    await save(License, { name: 'Here', scopes: [], allowedRegionIds: [created.id] })
    await save(License, { name: 'Here and there', scopes: [], allowedRegionIds: [fixtures.region.id, created.id] })
    await save(License, { name: 'Elsewhere', scopes: [], allowedRegionIds: [fixtures.region.id] })
    const listed = (await admin.region.list()).find(region => region.id === created.id)
    assert.deepEqual(listed, { ...created, licenseCount: 2, userCount: 2 })
})

test('create and update need an existing group and a name of 1 to 80 characters', async () => {
    const admin = caller(fixtures.admin)
    await assert.rejects(admin.region.create({ name: 'No group', defaultGroupId: randomUUID() }), error => error.code === 'NOT_FOUND')
    for (const name of ['', 'x'.repeat(81)]) {
        await assert.rejects(admin.region.create({ name, defaultGroupId: fixtures.group.id }), error => error.code === 'BAD_REQUEST')
    }
    const created = await admin.region.create({ name: `Before ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    const other = await save(harness.entities.Group, { name: `Other default ${randomUUID()}` })
    assert.equal(await admin.region.update({ id: created.id, name: 'After', defaultGroupId: other.id }), undefined)
    const stored = await regionRow(created.id)
    assert.deepEqual([stored.name, stored.defaultGroupId], ['After', other.id])
    await assert.rejects(admin.region.update({ id: created.id, name: 'After', defaultGroupId: randomUUID() }), error => error.code === 'NOT_FOUND')
    await assert.rejects(admin.region.update({ id: randomUUID(), name: 'Nowhere', defaultGroupId: other.id }), error => error.code === 'NOT_FOUND')
    assert.equal((await regionRow(created.id)).defaultGroupId, other.id)
})

test('moving users needs two existing regions, empties the first, which can then be removed and dropped from its licences', async () => {
    const admin = caller(fixtures.admin)
    const leaving = await admin.region.create({ name: `Leaving ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    const staying = await admin.region.create({ name: `Staying ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    const people = [await makeUser('member', { regionId: leaving.id }), await makeUser('manager', { regionId: leaving.id })]
    const bystander = await makeUser('member', { regionId: staying.id })
    const shared = await save(License, { name: 'Shared', scopes: [], allowedRegionIds: [leaving.id, staying.id] })
    const only = await save(License, { name: 'Only leaving', scopes: [], allowedRegionIds: [leaving.id] })
    await assert.rejects(admin.region.remove(leaving.id), error => error.code === 'BAD_REQUEST' && /has users/.test(error.message))
    await assert.rejects(admin.region.moveUsers({ fromRegionId: leaving.id, toRegionId: randomUUID() }), error => error.code === 'NOT_FOUND')
    await assert.rejects(admin.region.moveUsers({ fromRegionId: randomUUID(), toRegionId: staying.id }), error => error.code === 'NOT_FOUND')
    for (const person of people) assert.equal((await db.getRepository(User).findOneByOrFail({ id: person.id })).regionId, leaving.id)
    assert.equal(await admin.region.moveUsers({ fromRegionId: leaving.id, toRegionId: staying.id }), undefined)
    for (const person of [...people, bystander]) assert.equal((await db.getRepository(User).findOneByOrFail({ id: person.id })).regionId, staying.id)
    assert.deepEqual(await admin.region.remove(leaving.id), { message: 'Region removed successfully.', updatedLicenses: 2 })
    assert.equal(await regionRow(leaving.id), null)
    assert.deepEqual((await db.getRepository(License).findOneByOrFail({ id: shared.id })).allowedRegionIds, [staying.id])
    assert.deepEqual((await db.getRepository(License).findOneByOrFail({ id: only.id })).allowedRegionIds, [])
    await assert.rejects(admin.region.remove(leaving.id), error => error.code === 'NOT_FOUND')
})

test('the last region cannot be removed', async () => {
    const empty = await caller(fixtures.admin).region.create({ name: `Alone ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    // The fixture region holds users and cannot go, so a stubbed count stands in
    // for an instance left with a single region.
    const regions = db.getRepository(Region)
    const count = regions.count
    regions.count = async () => 1
    try {
        await assert.rejects(caller(fixtures.admin).region.remove(empty.id), error => error.code === 'BAD_REQUEST' && /last region/.test(error.message))
    } finally { regions.count = count }
    assert.notEqual(await regionRow(empty.id), null)
    await caller(fixtures.admin).region.remove(empty.id)
    assert.equal(await regionRow(empty.id), null)
})
