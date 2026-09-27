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
// Invitations to a collection: who removes them and who sees them listed.
// See docs/administration/collections.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, caller, makeUser, makeCollection, forbidden } = harness
const { CollectionInvitation } = harness.entities
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const tomorrow = () => new Date(Date.now() + 86400000)
async function invite(user, collection, email = `${randomUUID()}@example.test`) {
    await caller(user).collection.invitation.create({ collectionId: collection.id, email, expiresAt: tomorrow() })
    return db.getRepository(CollectionInvitation).findOneByOrFail({ collectionId: collection.id, email })
}

test('an invitation is removed by whoever can edit its collection, and the removal is recorded', async () => {
    const owner = await makeUser()
    const own = await makeCollection({ name: 'Invitations', public: false, ownerId: owner.id })
    const invitation = await invite(owner, own)
    for (const user of [await makeUser(), fixtures.manager]) {
        await assert.rejects(caller(user).collection.invitation.remove({ id: invitation.id }), error => error.code === 'FORBIDDEN')
    }
    for (const user of [null, fixtures.guest, { ...owner, approved: false }]) await forbidden(caller(user).collection.invitation.remove({ id: invitation.id }))
    assert.equal(await db.getRepository(CollectionInvitation).countBy({ id: invitation.id }), 1)
    assert.equal(await caller(owner).collection.invitation.remove({ id: invitation.id }), undefined)
    assert.equal(await db.getRepository(CollectionInvitation).countBy({ id: invitation.id }), 0)
    const [removed] = await db.query(`SELECT actor_id, target_id, before FROM audit_log WHERE action = 'invitation.removed' AND before->>'invitationId' = $1`, [invitation.id])
    assert.deepEqual([removed.actor_id, removed.target_id, removed.before.email], [owner.id, own.id, invitation.email])
    await assert.rejects(caller(owner).collection.invitation.remove({ id: invitation.id }), error => error.code === 'NOT_FOUND')
    const public_ = await makeCollection({ name: 'Public invitations' })
    const byAdmin = await invite(fixtures.admin, public_)
    await caller(fixtures.admin).collection.invitation.remove({ id: byAdmin.id })
    assert.equal(await db.getRepository(CollectionInvitation).countBy({ id: byAdmin.id }), 0)
})

test('a person lists the invitations of their own collections, and an admin also those of public collections', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const own = await makeCollection({ name: 'Mine to share', public: false, ownerId: owner.id })
    const theirs = await makeCollection({ name: 'Theirs to share', public: false, ownerId: other.id })
    const public_ = await makeCollection({ name: 'Everyone to share' })
    const mine = await invite(owner, own)
    const notMine = await invite(other, theirs)
    const onPublic = await invite(fixtures.admin, public_)
    const listed = await caller(owner).collection.invitation.getUserInvitations()
    assert.deepEqual(listed, [{
        id: mine.id, email: mine.email, expiresAt: mine.expiresAt, createdAt: mine.createdAt,
        collection: { id: own.id, name: own.name, public: false, isOwnedByUser: true },
    }])
    const adminListed = await caller(fixtures.admin).collection.invitation.getUserInvitations()
    const adminIds = adminListed.map(row => row.id)
    assert.ok(adminIds.includes(onPublic.id))
    assert.deepEqual([adminIds.includes(mine.id), adminIds.includes(notMine.id)], [false, false])
    assert.equal(adminListed.find(row => row.id === onPublic.id).collection.isOwnedByUser, false)
    assert.deepEqual((await caller(fixtures.manager).collection.invitation.getUserInvitations()).filter(row => row.id === onPublic.id), [])
    await assert.rejects(caller(null).collection.invitation.getUserInvitations(), error => error.code === 'UNAUTHORIZED')
})
