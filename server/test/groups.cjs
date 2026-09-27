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
// User groups: who manages them, the default group and merging.
// See docs/administration/users-and-groups.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeUser, makeCollection, collectionRow, forbidden } = harness
const { Group, Region, UserGroup } = harness.entities
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const groupRow = id => db.getRepository(Group).findOneBy({ id })
const defaults = async () => (await db.getRepository(Group).findBy({ default: true })).map(group => group.id)

test('managers and admins list groups; only an approved, verified admin changes them', async () => {
    const group = await save(Group, { name: `Listed ${randomUUID()}` })
    for (const user of [null, fixtures.guest, fixtures.member, { ...fixtures.manager, approved: false }]) {
        await forbidden(caller(user).group.list())
    }
    const listed = await caller(fixtures.manager).group.list()
    assert.deepEqual(listed.find(row => row.id === group.id), { id: group.id, name: group.name, isDefault: false })
    assert.deepEqual((await caller(fixtures.admin).group.list()).map(row => row.id).sort(), listed.map(row => row.id).sort())
    for (const user of [null, fixtures.guest, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.group.create({ name: 'Refused' }))
        await forbidden(as.group.update({ id: group.id, name: 'Refused' }))
        await forbidden(as.group.setDefault(group.id))
        await forbidden(as.group.remove(group.id))
        await forbidden(as.group.moveUsersAndRegions({ fromGroupId: group.id, toGroupId: fixtures.group.id }))
    }
    assert.equal((await groupRow(group.id)).name, group.name)
    assert.equal(await db.getRepository(Group).countBy({ name: 'Refused' }), 0)
})

test('a created group is returned as listed and renamed in place', async () => {
    const admin = caller(fixtures.admin)
    const name = `Created ${randomUUID()}`
    const created = await admin.group.create({ name })
    assert.deepEqual(created, { id: created.id, name, isDefault: false })
    assert.deepEqual((await admin.group.list()).find(row => row.id === created.id), created)
    assert.equal(await admin.group.update({ id: created.id, name: `${name} renamed` }), undefined)
    assert.equal((await groupRow(created.id)).name, `${name} renamed`)
    await assert.rejects(admin.group.update({ id: randomUUID(), name: 'Nobody' }), error => error.code === 'NOT_FOUND')
    await assert.rejects(admin.group.create({ name: '' }), error => error.code === 'BAD_REQUEST')
    await assert.rejects(admin.group.create({ name: 'x'.repeat(81) }), error => error.code === 'BAD_REQUEST')
})

test('one group at most is the default, and setting it again changes nothing', async () => {
    const admin = caller(fixtures.admin)
    const first = await admin.group.create({ name: `Default one ${randomUUID()}` })
    const second = await admin.group.create({ name: `Default two ${randomUUID()}` })
    await admin.group.setDefault(first.id)
    assert.deepEqual(await defaults(), [first.id])
    await admin.group.setDefault(second.id)
    assert.deepEqual(await defaults(), [second.id])
    await admin.group.setDefault(second.id)
    assert.deepEqual(await defaults(), [second.id])
    assert.equal((await admin.group.list()).find(row => row.id === second.id).isDefault, true)
    await assert.rejects(admin.group.setDefault(randomUUID()), error => error.code === 'NOT_FOUND')
    assert.deepEqual(await defaults(), [second.id])
})

test('a group is removed only when nothing depends on it', async () => {
    const admin = caller(fixtures.admin)
    const standing = await admin.group.create({ name: `Standing default ${randomUUID()}` })
    await admin.group.setDefault(standing.id)
    await assert.rejects(admin.group.remove(standing.id), error => error.code === 'BAD_REQUEST' && /default group/.test(error.message))
    const withUsers = await admin.group.create({ name: `With users ${randomUUID()}` })
    await save(UserGroup, { userId: (await makeUser()).id, groupId: withUsers.id })
    await assert.rejects(admin.group.remove(withUsers.id), error => error.code === 'BAD_REQUEST' && /has users/.test(error.message))
    const forRegion = await admin.group.create({ name: `For a region ${randomUUID()}` })
    await save(Region, { name: randomUUID(), defaultGroupId: forRegion.id })
    await assert.rejects(admin.group.remove(forRegion.id), error => error.code === 'BAD_REQUEST' && /default for regions/.test(error.message))
    const inActionBar = await admin.group.create({ name: `In an action bar ${randomUUID()}` })
    await makeCollection({ actionBar: { share: { mode: 'only', roles: [], groupIds: [inActionBar.id], userIds: [] } } })
    await assert.rejects(admin.group.remove(inActionBar.id), error => error.code === 'BAD_REQUEST' && /collections or their tools/.test(error.message))
    const unused = await admin.group.create({ name: `Unused ${randomUUID()}` })
    assert.equal(await admin.group.remove(unused.id), undefined)
    assert.equal(await groupRow(unused.id), null)
    await assert.rejects(admin.group.remove(unused.id), error => error.code === 'NOT_FOUND')
    for (const kept of [standing, withUsers, forRegion, inActionBar]) assert.notEqual(await groupRow(kept.id), null)
})

test('A2: merging groups carries collection restrictions; removal is refused while a collection uses the group', async () => {
    const admin = caller(fixtures.admin)
    const from = await save(Group, { name: 'Merge from' })
    const to = await save(Group, { name: 'Merge into' })
    const limited = await makeCollection({ name: 'Merge target', limitedToGroupIds: [from.id] })
    await assert.rejects(admin.group.remove(from.id), e => e.code === 'BAD_REQUEST')
    const user = await makeUser()
    await save(UserGroup, { userId: user.id, groupId: from.id })
    await save(UserGroup, { userId: user.id, groupId: to.id })
    await admin.group.moveUsersAndRegions({ fromGroupId: from.id, toGroupId: to.id })
    assert.deepEqual((await collectionRow(limited.id)).limitedToGroupIds, [to.id])
    assert.equal(await db.getRepository(UserGroup).countBy({ userId: user.id }), 1)
    await admin.group.remove(from.id)
})

test('merging moves members and region defaults, keeps one membership each, and ignores a merge into itself', async () => {
    const admin = caller(fixtures.admin)
    const from = await save(Group, { name: `Merge source ${randomUUID()}` })
    const to = await save(Group, { name: `Merge target ${randomUUID()}` })
    const onlyFrom = await makeUser()
    const both = await makeUser()
    await save(UserGroup, { userId: onlyFrom.id, groupId: from.id })
    await save(UserGroup, { userId: both.id, groupId: from.id })
    await save(UserGroup, { userId: both.id, groupId: to.id })
    const region = await save(Region, { name: randomUUID(), defaultGroupId: from.id })
    const toolbar = await makeCollection({ actionBar: { share: { mode: 'only', roles: [], groupIds: [from.id], userIds: [] } } })
    await admin.group.moveUsersAndRegions({ fromGroupId: from.id, toGroupId: from.id })
    assert.equal(await db.getRepository(UserGroup).countBy({ groupId: from.id }), 2)
    await admin.group.moveUsersAndRegions({ fromGroupId: from.id, toGroupId: to.id })
    const memberships = await db.getRepository(UserGroup).findBy({ userId: onlyFrom.id })
    assert.deepEqual(memberships.map(row => row.groupId), [to.id])
    assert.deepEqual((await db.getRepository(UserGroup).findBy({ userId: both.id })).map(row => row.groupId), [to.id])
    assert.equal(await db.getRepository(UserGroup).countBy({ groupId: from.id }), 0)
    assert.equal((await db.getRepository(Region).findOneByOrFail({ id: region.id })).defaultGroupId, to.id)
    assert.deepEqual((await collectionRow(toolbar.id)).actionBar.share.groupIds, [to.id])
    await assert.rejects(admin.group.moveUsersAndRegions({ fromGroupId: from.id, toGroupId: randomUUID() }), error => error.code === 'NOT_FOUND')
    await admin.group.remove(from.id)
    assert.equal(await groupRow(from.id), null)
})
