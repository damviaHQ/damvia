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
// The collection trees each role sees, the latest files and removing files
// from a hand-made collection. See docs/administration/collections.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeUser, makeCollection, makeFolder, makeFile, forbidden } = harness
const { Group, CollectionFile } = harness.entities
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children)])
const idsOf = nodes => flatten(nodes).map(node => node.id)
const nodeOf = (nodes, id) => flatten(nodes).find(node => node.id === id)
async function withFile(collection, extra = {}) {
    const file = await makeFile(await makeFolder(), extra)
    return save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })
}

test('the tree nests what a reader may see, and the admin tree holds every public collection', async () => {
    const member = await makeUser()
    const group = await save(Group, { name: `Closed ${randomUUID()}` })
    const root = await makeCollection({ name: 'Tree root' })
    const child = await makeCollection({ name: 'Tree child', parent: root })
    const draft = await makeCollection({ name: 'Tree draft', parent: child, draft: true })
    const closed = await makeCollection({ name: 'Tree closed', limitedToGroupIds: [group.id] })
    const mine = await makeCollection({ name: 'Tree mine', public: false, ownerId: member.id })
    const theirs = await makeCollection({ name: 'Tree theirs', public: false, ownerId: fixtures.member.id })
    const tree = await caller(member).collection.tree()
    const seen = idsOf(tree)
    assert.ok(tree.some(node => node.id === root.id), 'a root collection is at the top')
    assert.deepEqual(nodeOf(tree, root.id).children.map(node => node.id), [child.id])
    assert.deepEqual(nodeOf(tree, child.id).children, [])
    assert.deepEqual([seen.includes(mine.id), seen.includes(draft.id), seen.includes(closed.id), seen.includes(theirs.id)], [true, false, false, false])
    assert.deepEqual([nodeOf(tree, mine.id).canEdit, nodeOf(tree, root.id).canEdit], [true, false])
    const adminTree = await caller(fixtures.admin).collection.treeAdmin()
    const adminSeen = idsOf(adminTree)
    for (const id of [root.id, child.id, draft.id, closed.id]) assert.ok(adminSeen.includes(id), id)
    assert.deepEqual([adminSeen.includes(mine.id), adminSeen.includes(theirs.id)], [false, false])
    assert.deepEqual(nodeOf(adminTree, child.id).children.map(node => node.id), [draft.id])
    for (const user of [null, { ...member, approved: false }, { ...member, emailVerified: false }]) {
        await forbidden(caller(user).collection.tree())
    }
    for (const user of [null, member, fixtures.manager, { ...fixtures.admin, approved: false }]) {
        await forbidden(caller(user).collection.treeAdmin())
    }
})

test('a member lists their own private collections as a tree, and nothing else', async () => {
    const member = await makeUser()
    const top = await makeCollection({ name: 'Private top', public: false, ownerId: member.id })
    const nested = await makeCollection({ name: 'Private nested', public: false, ownerId: member.id, parent: top })
    await makeCollection({ name: 'Someone else', public: false, ownerId: fixtures.member.id })
    await makeCollection({ name: 'Public', ownerId: member.id })
    const tree = await caller(member).collection.ListPrivateCollections()
    assert.deepEqual(tree.map(node => node.id), [top.id])
    assert.deepEqual(tree[0].children.map(node => node.id), [nested.id])
    assert.deepEqual(idsOf(tree).sort(), [top.id, nested.id].sort())
    assert.deepEqual(await caller(await makeUser()).collection.ListPrivateCollections(), [])
    for (const user of [null, fixtures.guest, { ...member, approved: false }]) {
        await forbidden(caller(user).collection.ListPrivateCollections())
    }
})

test('the latest files are the ten newest a reader may see, in a subtree or across published collections', async () => {
    const member = await makeUser()
    const root = await makeCollection({ name: 'Latest root' })
    const child = await makeCollection({ name: 'Latest child', parent: root })
    const added = []
    for (let i = 0; i < 12; i++) added.push(await withFile(i % 2 ? child : root, { name: `latest-${String(i).padStart(2, '0')}.png` }))
    const other = await withFile(await makeCollection({ name: 'Latest elsewhere' }), { name: 'elsewhere.png' })
    const draftFile = await withFile(await makeCollection({ name: 'Latest draft', draft: true }), { name: 'draft.png' })
    const privateFile = await withFile(await makeCollection({ name: 'Latest private', public: false, ownerId: member.id }), { name: 'private.png' })
    const scoped = await caller(member).collection.lastAddedFiles({ collectionId: root.id })
    assert.deepEqual(scoped.map(file => file.id), added.slice(2).reverse().map(file => file.id))
    assert.deepEqual((await caller(member).collection.lastAddedFiles({ collectionId: child.id })).map(file => file.name), ['latest-11.png', 'latest-09.png', 'latest-07.png', 'latest-05.png', 'latest-03.png', 'latest-01.png'])
    const published = await caller(member).collection.lastAddedFiles({})
    assert.equal(published.length, 10)
    assert.deepEqual(published.slice(0, 2).map(file => file.id), [other.id, added[11].id])
    assert.ok(!published.some(file => [draftFile.id, privateFile.id].includes(file.id)))
    assert.deepEqual((await caller(member).collection.lastAddedFiles({ collectionId: privateFile.collectionId })).map(file => file.id), [privateFile.id])
    assert.deepEqual(await caller(fixtures.member).collection.lastAddedFiles({ collectionId: privateFile.collectionId }), [])
    await forbidden(caller(null).collection.lastAddedFiles({}))
    await forbidden(caller({ ...member, approved: false }).collection.lastAddedFiles({}))
})

test('files leave a hand-made collection only at the hand of someone who can edit it, and all or none go', async () => {
    const owner = await makeUser()
    const own = await makeCollection({ name: 'Hand-made', public: false, ownerId: owner.id })
    const [first, second, third] = [await withFile(own), await withFile(own), await withFile(own)]
    const folder = await makeFolder()
    const synced = await makeCollection({ name: 'Synced', public: false, ownerId: owner.id, assetFolderId: folder.id })
    const syncedFile = await save(CollectionFile, { collectionId: synced.id, assetFileId: (await makeFile(folder)).id })
    const shared = await withFile(await makeCollection({ name: 'Shared, not owned' }))
    const hidden = await withFile(await makeCollection({ name: 'Hidden', public: false, ownerId: fixtures.member.id }))
    const remaining = () => db.getRepository(CollectionFile).findBy({ collectionId: own.id }).then(rows => rows.map(row => row.id).sort())
    await assert.rejects(caller(owner).collection.removeFiles([first.id, hidden.id]), error => error.code === 'NOT_FOUND')
    await assert.rejects(caller(owner).collection.removeFiles([first.id, randomUUID()]), error => error.code === 'NOT_FOUND')
    await assert.rejects(caller(owner).collection.removeFiles([first.id, syncedFile.id]), error => error.code === 'BAD_REQUEST')
    await assert.rejects(caller(owner).collection.removeFiles([first.id, shared.id]), error => error.code === 'FORBIDDEN')
    for (const user of [null, fixtures.guest, { ...owner, approved: false }]) await forbidden(caller(user).collection.removeFiles([first.id]))
    assert.deepEqual(await remaining(), [first.id, second.id, third.id].sort())
    assert.equal(await caller(owner).collection.removeFiles([first.id, second.id]), undefined)
    assert.deepEqual(await remaining(), [third.id])
    await caller(fixtures.admin).collection.removeFiles([shared.id])
    assert.equal(await db.getRepository(CollectionFile).countBy({ id: shared.id }), 0)
    assert.equal(await db.getRepository(CollectionFile).countBy({ id: syncedFile.id }), 1)
})
