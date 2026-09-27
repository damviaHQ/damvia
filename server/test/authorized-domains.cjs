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
// Authorised domains: sign-ups from these addresses are approved on arrival.
// See docs/administration/users-and-groups.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, caller, forbidden } = harness
const { AuthorizedDomain, User } = harness.entities
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const domainRow = id => db.getRepository(AuthorizedDomain).findOneBy({ id })
const uniqueDomain = () => `${randomUUID().slice(0, 8)}.example`
const signUp = email => caller(null).user.create({ name: 'Signup', company: 'Test', regionId: fixtures.region.id, email, password: 'a long enough passphrase' })

test('authorised domains are managed by an approved, verified admin only', async () => {
    const domain = await caller(fixtures.admin).authorizedDomain.create({ domain: uniqueDomain(), detail: 'Guarded' })
    for (const user of [null, fixtures.guest, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.authorizedDomain.list())
        await forbidden(as.authorizedDomain.create({ domain: 'refused.example', detail: '' }))
        await forbidden(as.authorizedDomain.remove(domain.id))
    }
    assert.notEqual(await domainRow(domain.id), null)
    assert.equal(await db.getRepository(AuthorizedDomain).countBy({ domain: 'refused.example' }), 0)
})

test('a listed domain approves new sign-ups from it until it is removed', async () => {
    const admin = caller(fixtures.admin)
    const name = uniqueDomain()
    const created = await admin.authorizedDomain.create({ domain: name, detail: 'Partner agency' })
    assert.deepEqual(created, { id: created.id, domain: name, detail: 'Partner agency' })
    assert.deepEqual((await admin.authorizedDomain.list()).find(row => row.id === created.id), created)
    const approvedEmail = `${randomUUID()}@${name}`
    await signUp(approvedEmail)
    assert.equal((await db.getRepository(User).findOneByOrFail({ email: approvedEmail })).approved, true)
    const otherEmail = `${randomUUID()}@not-${name}`
    await signUp(otherEmail)
    assert.equal((await db.getRepository(User).findOneByOrFail({ email: otherEmail })).approved, false)
    assert.equal(await admin.authorizedDomain.remove(created.id), undefined)
    assert.equal(await domainRow(created.id), null)
    assert.equal((await admin.authorizedDomain.list()).some(row => row.id === created.id), false)
    const lateEmail = `${randomUUID()}@${name}`
    await signUp(lateEmail)
    assert.equal((await db.getRepository(User).findOneByOrFail({ email: lateEmail })).approved, false)
    assert.equal((await db.getRepository(User).findOneByOrFail({ email: approvedEmail })).approved, true, 'removal does not revoke earlier approvals')
    await assert.rejects(admin.authorizedDomain.remove(created.id), error => error.code === 'NOT_FOUND')
})

test('a domain needs 1 to 80 characters and a detail of at most 255', async () => {
    const admin = caller(fixtures.admin)
    for (const input of [{ domain: '', detail: '' }, { domain: 'x'.repeat(81), detail: '' }, { domain: uniqueDomain(), detail: 'x'.repeat(256) }, { domain: uniqueDomain() }]) {
        await assert.rejects(admin.authorizedDomain.create(input), error => error.code === 'BAD_REQUEST')
    }
})
