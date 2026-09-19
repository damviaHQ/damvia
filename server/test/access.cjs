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
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, state, save, makeUser, makeCollection, makeFolder, makeFile } = harness
const { User, Group, UserGroup, Collection, CollectionFile, CollectionInvitation } = harness.entities
const { userCollectionsQuery, userCollectionFilesQuery } = harness.services.collections
let fixtures, users, rows
const day = 86400000
async function mirrored(extra = {}) {
    const folder = await makeFolder()
    const collection = await makeCollection({ assetFolderId: folder.id, ...extra })
    const file = await makeFile(folder)
    await save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })
    return collection
}
async function visible(user, collection) {
    const seesCollection = await userCollectionsQuery(user).andWhere('collection.id = :id', { id: collection.id }).getExists()
    const seesFiles = await userCollectionFilesQuery(user).andWhere('collection.id = :id', { id: collection.id }).getExists()
    assert.equal(seesCollection, seesFiles, `collection and file visibility disagree for ${user.name} on ${collection.name}`)
    return seesCollection
}
before(async () => {
    fixtures = await harness.setup()
    const group = await save(Group, { name: 'Restricted' })
    const insider = await makeUser('member', { name: 'insider' })
    await save(UserGroup, { userId: insider.id, groupId: group.id })
    const owner = await makeUser('member', { name: 'owner' })
    const invitee = await makeUser('guest', { name: 'invitee' })
    users = { admin: fixtures.admin, manager: fixtures.manager, member: fixtures.member, insider, guest: fixtures.guest, invitee, owner }
    const invited = await mirrored({ name: 'invited', public: false })
    await save(CollectionInvitation, { collectionId: invited.id, email: invitee.email, userId: invitee.id, expiresAt: new Date(Date.now() + day) })
    const invitedExpired = await mirrored({ name: 'invitedExpired', public: false })
    await save(CollectionInvitation, { collectionId: invitedExpired.id, email: invitee.email, userId: invitee.id, expiresAt: new Date(Date.now() - day) })
    rows = {
        pub: await mirrored({ name: 'pub' }),
        pubDraft: await mirrored({ name: 'pubDraft', draft: true, ownerId: owner.id }),
        limited: await mirrored({ name: 'limited', limitedToGroupIds: [group.id] }),
        privateOwned: await mirrored({ name: 'privateOwned', public: false, ownerId: owner.id }),
        invited,
        invitedExpired,
        ancestorInvited: await mirrored({ name: 'ancestorInvited', public: false, parent: invited }),
    }
    users.group = group
})
after(() => harness.teardown())

test('both query builders agree on the visibility matrix for every role and collection state', async () => {
    const expected = {
        pub: { admin: true, manager: true, member: true, insider: true, guest: false, invitee: false, owner: true },
        pubDraft: { admin: true, manager: false, member: false, insider: false, guest: false, invitee: false, owner: true },
        limited: { admin: true, manager: false, member: false, insider: true, guest: false, invitee: false, owner: false },
        privateOwned: { admin: false, manager: false, member: false, insider: false, guest: false, invitee: false, owner: true },
        invited: { admin: false, manager: false, member: false, insider: false, guest: false, invitee: true, owner: false },
        invitedExpired: { admin: false, manager: false, member: false, insider: false, guest: false, invitee: false, owner: false },
        ancestorInvited: { admin: false, manager: false, member: false, insider: false, guest: false, invitee: true, owner: false },
    }
    const actual = {}
    for (const [name, collection] of Object.entries(rows)) {
        actual[name] = {}
        for (const role of Object.keys(expected[name])) actual[name][role] = await visible(users[role], collection)
    }
    assert.deepEqual(actual, expected)
})

test('an invitation stops granting the subtree once it expires', async () => {
    await db.getRepository(CollectionInvitation).update({ collectionId: rows.invited.id }, { expiresAt: new Date(Date.now() - day) })
    assert.equal(await visible(users.invitee, rows.invited), false)
    assert.equal(await visible(users.invitee, rows.ancestorInvited), false)
    await db.getRepository(CollectionInvitation).update({ collectionId: rows.invited.id }, { expiresAt: new Date(Date.now() + day) })
    assert.equal(await visible(users.invitee, rows.ancestorInvited), true)
})

test('joining or leaving a group changes access to group-limited collections immediately', async () => {
    assert.equal(await visible(users.member, rows.limited), false)
    await save(UserGroup, { userId: users.member.id, groupId: users.group.id })
    assert.equal(await visible(users.member, rows.limited), true)
    await db.getRepository(UserGroup).delete({ userId: users.member.id, groupId: users.group.id })
    assert.equal(await visible(users.member, rows.limited), false)
})

test('publishing a draft exposes it to members and unpublishing hides it again', async () => {
    assert.equal(await visible(users.member, rows.pubDraft), false)
    await db.getRepository(Collection).update(rows.pubDraft.id, { draft: false })
    assert.equal(await visible(users.member, rows.pubDraft), true)
    await db.getRepository(Collection).update(rows.pubDraft.id, { public: false })
    assert.equal(await visible(users.member, rows.pubDraft), false)
    assert.equal(await visible(users.owner, rows.pubDraft), true)
    await db.getRepository(Collection).update(rows.pubDraft.id, { public: true, draft: true })
})

test('guests never see public collections without a group or an invitation', async () => {
    const guest = await makeUser('guest')
    for (const collection of [rows.pub, rows.limited, rows.pubDraft]) assert.equal(await visible(guest, collection), false)
    await save(UserGroup, { userId: guest.id, groupId: users.group.id })
    assert.equal(await visible(guest, rows.limited), true)
    assert.equal(await visible(guest, rows.pub), false)
    assert.equal(await db.getRepository(User).countBy({ id: guest.id }), 1)
})
