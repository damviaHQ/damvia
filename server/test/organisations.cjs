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
// Organisations: the company each person works for, set by an admin.
// See docs/administration/organisations.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, caller, makeUser, forbidden } = harness
const { User } = harness.entities
const { Organisation } = require('../dist/entity/organisation')
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const organisationRow = id => db.getRepository(Organisation).findOneBy({ id })
const userRow = id => db.getRepository(User).findOneByOrFail({ id })
const edit = (user, extra) => ({ id: user.id, name: user.name, company: user.company, regionId: user.regionId, email: user.email, role: user.role, groupIds: [], ...extra })

test('an approved manager lists organisations; only an approved, verified admin changes them', async () => {
    const organisation = await caller(fixtures.admin).organisation.create({ name: `Guarded ${randomUUID()}` })
    assert((await caller(fixtures.manager).organisation.list()).some(row => row.id === organisation.id))
    for (const user of [null, fixtures.guest, fixtures.member, { ...fixtures.manager, approved: false }]) {
        await forbidden(caller(user).organisation.list())
    }
    for (const user of [null, fixtures.guest, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.organisation.create({ name: 'Refused' }))
        await forbidden(as.organisation.update({ id: organisation.id, name: 'Refused' }))
        await forbidden(as.organisation.remove(organisation.id))
    }
    assert.equal((await organisationRow(organisation.id)).name, organisation.name)
    assert.equal(await db.getRepository(Organisation).countBy({ name: 'Refused' }), 0)
})

test('names are trimmed, 1 to 80 characters, and unique whatever their case', async () => {
    const admin = caller(fixtures.admin)
    const name = `Brandfolio ${randomUUID()}`
    const created = await admin.organisation.create({ name: `  ${name} ` })
    assert.deepEqual(created, { id: created.id, name, userCount: 0 })
    for (const refused of ['', '   ', 'x'.repeat(81)]) {
        await assert.rejects(admin.organisation.create({ name: refused }), error => error.code === 'BAD_REQUEST')
    }
    await assert.rejects(admin.organisation.create({ name: name.toUpperCase() }), error => error.code === 'CONFLICT')
    const other = await admin.organisation.create({ name: `Other ${randomUUID()}` })
    await assert.rejects(admin.organisation.update({ id: other.id, name: name.toLowerCase() }), error => error.code === 'CONFLICT')
    assert.equal(await admin.organisation.update({ id: created.id, name: name.toUpperCase() }), undefined)
    assert.equal((await organisationRow(created.id)).name, name.toUpperCase())
    await assert.rejects(admin.organisation.update({ id: randomUUID(), name: 'Nowhere' }), error => error.code === 'NOT_FOUND')
})

test('an admin sets or clears the organisation of a user, which the list counts and shows', async () => {
    const admin = caller(fixtures.admin)
    const organisation = await admin.organisation.create({ name: `Germany ${randomUUID()}` })
    const people = [await makeUser('member'), await makeUser('guest')]
    for (const person of people) await admin.user.update(edit(person, { organisationId: organisation.id }))
    assert.deepEqual((await admin.organisation.list()).find(row => row.id === organisation.id), { ...organisation, userCount: 2 })
    const listed = (await admin.user.list()).find(user => user.id === people[0].id)
    assert.deepEqual([listed.organisationId, listed.organisation], [organisation.id, organisation.name])
    assert.equal((await caller(await userRow(people[0].id)).user.me()).organisationId, organisation.id)
    await admin.user.update(edit(people[0], {}))
    assert.equal((await userRow(people[0].id)).organisationId, organisation.id, 'left out, the organisation is kept')
    await admin.user.update(edit(people[0], { organisationId: null }))
    assert.equal((await userRow(people[0].id)).organisationId, null)
    await assert.rejects(admin.user.update(edit(people[1], { organisationId: randomUUID() })), error => error.code === 'NOT_FOUND')
    assert.equal((await userRow(people[1].id)).organisationId, organisation.id)
    const csv = await admin.user.accessReview()
    assert(csv.split('\r\n').find(line => line.startsWith(people[1].email)).includes(`,${organisation.name},`))
})

test('a manager moves the members and guests of their region between organisations, and nobody else', async () => {
    const admin = caller(fixtures.admin)
    const manager = caller(fixtures.manager)
    const [first, second] = [await admin.organisation.create({ name: `First ${randomUUID()}` }), await admin.organisation.create({ name: `Second ${randomUUID()}` })]
    const person = await makeUser('member')
    await manager.user.update(edit(person, { organisationId: first.id }))
    assert.equal((await userRow(person.id)).organisationId, first.id)
    await manager.user.update(edit(person, { organisationId: second.id }))
    assert.equal((await userRow(person.id)).organisationId, second.id)
    await assert.rejects(manager.user.update(edit(person, { organisationId: randomUUID() })), error => error.code === 'NOT_FOUND')
    await manager.user.update(edit(person, { organisationId: null }))
    assert.equal((await userRow(person.id)).organisationId, null)
    const otherManager = await makeUser('manager')
    await forbidden(manager.user.update(edit(otherManager, { organisationId: first.id })))
    const region = await harness.save(harness.entities.Region, { name: `Elsewhere ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    const outsider = await makeUser('member', { regionId: region.id })
    await assert.rejects(manager.user.update(edit(outsider, { organisationId: first.id })), error => error.code === 'NOT_FOUND')
    for (const user of [otherManager, outsider]) assert.equal((await userRow(user.id)).organisationId, null)
    await manager.user.update(edit(fixtures.manager, { organisationId: first.id }))
    assert.equal((await userRow(fixtures.manager.id)).organisationId, null, 'a manager does not change their own')
})

test('removing an organisation keeps its members, without an organisation', async () => {
    const admin = caller(fixtures.admin)
    const organisation = await admin.organisation.create({ name: `Closing ${randomUUID()}` })
    const person = await makeUser('member')
    await admin.user.update(edit(person, { organisationId: organisation.id }))
    assert.deepEqual(await admin.organisation.remove(organisation.id), { unassignedUsers: 1 })
    assert.equal(await organisationRow(organisation.id), null)
    assert.equal((await userRow(person.id)).organisationId, null)
    await assert.rejects(admin.organisation.remove(organisation.id), error => error.code === 'NOT_FOUND')
})
