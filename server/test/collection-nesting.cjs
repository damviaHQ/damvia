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
// Custom collections and pages nested inside a synchronized tree survive folder
// renames, moves and deletions. See docs/administration/collections-and-sharing.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, state, env, save, caller, makeCollection, makeFolder, makeFile, forbidden } = harness
const { Collection, CollectionFile, CollectionInvitation, AssetFolder } = harness.entities
const { Page } = require('../dist/entity/page')
const { MenuItem } = require('../dist/entity/menu-item')
const { upsertFolder, deleteFolder } = harness.services.assets
const { synchronizeCollection, reparentSubtree, destroySynchronizedCollections, userCollectionsQuery } = harness.services.collections
let fixtures
before(async () => {
    fixtures = await harness.setup()
    env.mainS3 = () => ({ presignedGetObject: async () => 'https://example.test/fixture', removeObjects: async (_bucket, keys) => { state.removedKeys.push(...keys) }, listObjects: () => require('node:stream').Readable.from([]) })
})
after(() => harness.teardown())

const row = id => db.getRepository(Collection).findOneByOrFail({ id })
const childOf = (parentId, assetFolderId) => db.getRepository(Collection).findOneByOrFail({ parentId, assetFolderId })
const sync = id => db.transaction(em => synchronizeCollection(em, id))
const menuItemsOf = collectionId => db.getRepository(MenuItem).findBy({ collectionId })
async function assertTreesConsistent() {
    for (const table of ['collections', 'menu_items', 'asset_folders']) {
        const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM ${table} f LEFT JOIN ${table} p ON p.id = f.parent_id WHERE f.mpath IS DISTINCT FROM coalesce(p.mpath, '') || f.id::text || '.'`)
        assert.equal(count, 0, `${table} paths`)
    }
    const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM collections c WHERE c.number_of_files <> (SELECT count(*) FROM collection_files cf INNER JOIN collections d ON d.id = cf.collection_id WHERE d.mpath LIKE c.mpath || '%')`)
    assert.equal(count, 0, 'number_of_files')
}

// A mirrored tree: root folder with two subfolders, one of which holds a file
// and a deeper folder. Every folder is synchronized into the collection tree.
async function mirroredTree(extra = {}) {
    const root = await upsertFolder({ externalId: randomUUID(), parentExternalId: '', name: 'Root' })
    const a = await upsertFolder({ externalId: randomUUID(), parentExternalId: root.externalId, name: 'A' })
    const b = await upsertFolder({ externalId: randomUUID(), parentExternalId: root.externalId, name: 'B' })
    const x = await upsertFolder({ externalId: randomUUID(), parentExternalId: a.externalId, name: 'X' })
    const file = await makeFile(x)
    const collection = await makeCollection({ name: 'stale', assetFolderId: root.id, ...extra })
    await sync(collection.id)
    const ca = await childOf(collection.id, a.id)
    const cb = await childOf(collection.id, b.id)
    await sync(ca.id)
    await sync(cb.id)
    const cx = await childOf(ca.id, x.id)
    await sync(cx.id)
    state.queued.length = 0
    return { root, a, b, x, file, collection, ca, cb, cx }
}

test('renaming a folder keeps the collection, its page, its invitation and its custom child', async () => {
    const { a, collection, ca } = await mirroredTree()
    const page = await save(Page, { collectionId: ca.id, name: null })
    const custom = await makeCollection({ parent: ca, name: 'Brief' })
    await save(CollectionInvitation, { collectionId: ca.id, email: fixtures.guest.email, userId: fixtures.guest.id, expiresAt: new Date(Date.now() + 86400000) })
    await upsertFolder({ externalId: a.externalId, parentExternalId: (await db.getRepository(AssetFolder).findOneByOrFail({ id: a.parentId })).externalId, name: 'Renamed' })
    await sync(collection.id)
    await sync(ca.id)
    const after = await row(ca.id)
    assert.equal(after.name, 'Renamed')
    assert.equal((await db.getRepository(Collection).countBy({ parentId: collection.id })), 2)
    assert.equal((await db.getRepository(Page).findOneByOrFail({ id: page.id })).collectionId, ca.id)
    assert.equal((await row(custom.id)).parentId, ca.id)
    assert.equal(await db.getRepository(CollectionInvitation).countBy({ collectionId: ca.id }), 1)
    await assertTreesConsistent()
})

test('a custom child named like an incoming folder coexists with it instead of being adopted', async () => {
    const root = await makeFolder({ name: 'Root' })
    await makeFolder({ name: 'Twin', parent: root })
    const collection = await makeCollection({ assetFolderId: root.id })
    const custom = await makeCollection({ parent: collection, name: 'Twin' })
    await sync(collection.id)
    await sync(collection.id)
    const children = await db.getRepository(Collection).findBy({ parentId: collection.id })
    assert.equal(children.length, 2)
    assert.equal((await row(custom.id)).assetFolderId, null)
    assert.ok(children.some(child => child.assetFolderId && child.name === 'Twin'))
    await assertTreesConsistent()
})

test('a collection whose folder is gone is skipped by the sync instead of failing forever', async () => {
    const collection = await makeCollection({ assetFolderId: null })
    await sync(collection.id)
    await sync(randomUUID())
})

test('moving a folder re-parents its collection, descendants, custom children, menu items and counters', async () => {
    const { b, x, collection, ca, cb, cx } = await mirroredTree()
    const custom = await makeCollection({ parent: cx, name: 'Notes' })
    const cbItem = (await menuItemsOf(cb.id))[0]
    const cxItem = (await menuItemsOf(cx.id))[0]
    assert.equal((await row(ca.id)).numberOfFiles, 1)
    await upsertFolder({ externalId: x.externalId, parentExternalId: b.externalId, name: 'X' })
    const moved = await row(cx.id)
    assert.equal(moved.parentId, cb.id)
    assert.equal(moved.path, `${cb.path}${cx.id}.`)
    assert.equal((await row(custom.id)).path, `${moved.path}${custom.id}.`)
    assert.equal((await row(ca.id)).numberOfFiles, 0)
    assert.equal((await row(cb.id)).numberOfFiles, 1)
    assert.equal((await row(collection.id)).numberOfFiles, 1)
    assert.equal((await db.getRepository(MenuItem).findOneByOrFail({ id: cxItem.id })).parentId, cbItem.id)
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ id: x.id })).parentId, b.id)
    state.queued.length = 0
    await upsertFolder({ externalId: x.externalId, parentExternalId: b.externalId, name: 'X' })
    assert.deepEqual(state.queued, [])
    assert.equal((await row(cx.id)).parentId, cb.id)
    await assertTreesConsistent()
})

test('a move re-derives draft, owner and group restrictions from the new parent, and stops on a public mismatch', async () => {
    const { b, x, cb, cx } = await mirroredTree()
    const deep = await makeCollection({ parent: cx, name: 'Deep' })
    await db.getRepository(Collection).update(cb.id, { draft: true, limitedToGroupIds: [fixtures.group.id] })
    await upsertFolder({ externalId: x.externalId, parentExternalId: b.externalId, name: 'X' })
    const moved = await row(cx.id)
    assert.equal(moved.parentId, cb.id)
    assert.equal(moved.draft, true)
    assert.deepEqual(moved.limitedToGroupIds, [fixtures.group.id])
    assert.equal(moved.canEditLimitedToGroupIds, false)
    assert.deepEqual((await row(deep.id)).limitedToGroupIds, [fixtures.group.id])
    assert.equal((await row(deep.id)).draft, true)
    const other = await mirroredTree()
    await db.getRepository(Collection).update(other.cb.id, { public: false, ownerId: fixtures.member.id })
    await upsertFolder({ externalId: other.x.externalId, parentExternalId: other.b.externalId, name: 'X' })
    const stuck = await row(other.cx.id)
    assert.equal(stuck.parentId, other.ca.id)
    assert.equal(stuck.orphanedReason, 'ambiguous_move')
    await assertTreesConsistent()
})

test('a move out of the mirrored scope flags the collection in place, and moving back heals it', async () => {
    const { a, x, ca, cx } = await mirroredTree()
    const outside = await upsertFolder({ externalId: randomUUID(), parentExternalId: '', name: 'Outside' })
    await upsertFolder({ externalId: x.externalId, parentExternalId: outside.externalId, name: 'X' })
    const flagged = await row(cx.id)
    assert.equal(flagged.parentId, ca.id)
    assert.equal(flagged.orphanedReason, 'parent_unmirrored')
    assert.equal(flagged.orphanedFromName, 'A')
    assert.equal(flagged.assetFolderId, x.id)
    await upsertFolder({ externalId: x.externalId, parentExternalId: a.externalId, name: 'X' })
    const healed = await row(cx.id)
    assert.equal(healed.parentId, ca.id)
    assert.equal(healed.orphanedAt, null)
    await assertTreesConsistent()
})

test('two collections mirroring one folder inside the same tree are both flagged and neither moves', async () => {
    const { a, b, collection, ca, cb } = await mirroredTree()
    const second = await makeCollection({ assetFolderId: a.id, parent: cb })
    await upsertFolder({ externalId: a.externalId, parentExternalId: b.externalId, name: 'A' })
    assert.equal((await row(ca.id)).parentId, collection.id)
    assert.equal((await row(ca.id)).orphanedReason, 'ambiguous_move')
    assert.equal((await row(second.id)).parentId, cb.id)
    assert.equal((await row(second.id)).orphanedReason, 'ambiguous_move')
    await assertTreesConsistent()
})

test('a root collection linked by hand stays a root when its folder moves', async () => {
    const { b, x, cx } = await mirroredTree()
    const linked = await makeCollection({ assetFolderId: x.id })
    await upsertFolder({ externalId: x.externalId, parentExternalId: b.externalId, name: 'X' })
    assert.equal((await row(linked.id)).parentId, null)
    assert.equal((await row(linked.id)).orphanedAt, null)
    assert.equal((await row(cx.id)).assetFolderId, x.id)
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ id: x.id })).parentId, b.id)
    await assertTreesConsistent()
})

test('a child listed before its parent is not moved to the root', async () => {
    const { x, a, cx, ca } = await mirroredTree()
    state.queued.length = 0
    await upsertFolder({ externalId: x.externalId, parentExternalId: randomUUID(), name: 'X' })
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ id: x.id })).parentId, a.id)
    assert.equal((await row(cx.id)).parentId, ca.id)
    assert.deepEqual(state.queued, [])
    await assertTreesConsistent()
})

test('a move into its own descendant is refused and nothing changes', async () => {
    const { collection, cx } = await mirroredTree()
    const before = await row(collection.id)
    await assert.rejects(db.transaction(em => reparentSubtree(em, { table: 'collections', nodeId: collection.id, newParentId: cx.id })), /inside itself/)
    await assert.rejects(db.transaction(em => reparentSubtree(em, { table: 'collections', nodeId: collection.id, newParentId: collection.id })), /inside itself/)
    assert.deepEqual(await row(collection.id), before)
    await assertTreesConsistent()
})

test('a synchronization never deletes children any more; only the folder cleanup does', async () => {
    const { x, ca, cx } = await mirroredTree()
    await db.getRepository(AssetFolder).update(x.id, { status: 'pending_deletion' })
    await sync(ca.id)
    assert.ok(await db.getRepository(Collection).findOneBy({ id: cx.id }))
    const stray = await makeCollection({ assetFolderId: (await makeFolder()).id, parent: ca })
    await sync(ca.id)
    assert.ok(await db.getRepository(Collection).findOneBy({ id: stray.id }))
    await deleteFolder(x.id)
    assert.equal(await db.getRepository(Collection).countBy({ id: cx.id }), 0)
    await assertTreesConsistent()
})

test('deleting a folder re-homes the custom child under the nearest surviving ancestor, with its page and menu item', async () => {
    const { x, collection, ca, cx } = await mirroredTree()
    const custom = await makeCollection({ parent: cx, name: 'Brief' })
    const page = await save(Page, { collectionId: custom.id, name: null })
    await db.transaction(em => harness.services.collections.syncCollectionMenuItems(em, custom))
    const caItem = (await menuItemsOf(ca.id))[0]
    const customItem = (await menuItemsOf(custom.id))[0]
    await deleteFolder(x.id)
    const rescued = await row(custom.id)
    assert.equal(rescued.parentId, ca.id)
    assert.equal(rescued.draft, false)
    assert.equal(rescued.orphanedReason, 'folder_deleted')
    assert.equal(rescued.orphanedFromName, 'X')
    assert.equal(rescued.path, `${ca.path}${custom.id}.`)
    assert.ok(await db.getRepository(Page).findOneBy({ id: page.id }))
    assert.equal(await db.getRepository(Collection).countBy({ id: cx.id }), 0)
    assert.equal((await db.getRepository(MenuItem).findOneByOrFail({ id: customItem.id })).parentId, caItem.id)
    assert.equal((await menuItemsOf(cx.id)).length, 0)
    assert.equal((await row(ca.id)).numberOfFiles, 0)
    await assertTreesConsistent()
})

test('deleting a whole tree lands custom collections at the root as drafts, keeps hand-placed menu items and lists the orphans', async () => {
    const { root, collection, ca } = await mirroredTree()
    const custom = await makeCollection({ parent: ca, name: 'Campaign', hasThumbnail: true })
    const grandChild = await makeCollection({ parent: custom, name: 'Assets' })
    await db.transaction(em => harness.services.collections.syncCollectionMenuItems(em, custom, true))
    const collectionItem = (await menuItemsOf(collection.id))[0]
    const divider = await caller(fixtures.admin).menuItem.create({ type: 'divider', parentId: collectionItem.id, data: { border: true } })
    assert.equal((await menuItemsOf(custom.id)).length, 1)
    assert.equal((await menuItemsOf(grandChild.id)).length, 1)
    state.removedKeys.length = 0
    await db.getRepository(Collection).update(collection.id, { hasThumbnail: true })
    await deleteFolder(root.id)
    const rescued = await row(custom.id)
    assert.equal(rescued.parentId, null)
    assert.equal(rescued.draft, true)
    assert.equal(rescued.path, `${custom.id}.`)
    assert.equal(rescued.orphanedFromName, 'A')
    assert.equal((await row(grandChild.id)).draft, true)
    assert.equal((await row(grandChild.id)).path, `${custom.id}.${grandChild.id}.`)
    assert.equal(await db.getRepository(Collection).countBy({ id: collection.id }), 0)
    assert.equal((await menuItemsOf(custom.id)).length, 0)
    assert.equal((await menuItemsOf(grandChild.id)).length, 0)
    const survivor = await db.getRepository(MenuItem).findOneByOrFail({ id: divider.id })
    assert.equal(survivor.parentId, null)
    assert.deepEqual(state.removedKeys.filter(key => key.startsWith('collections/')), [collection.thumbnailStorageKey])
    const orphan = (await caller(fixtures.admin).collection.listOrphaned()).find(o => o.id === custom.id)
    assert.equal(orphan.orphanedReason, 'folder_deleted')
    assert.equal(orphan.orphanedFromName, 'A')
    await caller(fixtures.admin).collection.dismissOrphan(custom.id)
    assert.equal((await row(custom.id)).orphanedAt, null)
    await assertTreesConsistent()
})

test('a rolled back deletion removes no storage object and keeps every row', async () => {
    const { x, cx } = await mirroredTree()
    await db.getRepository(Collection).update(cx.id, { hasThumbnail: true })
    state.removedKeys.length = 0
    await assert.rejects(db.transaction(async em => {
        await destroySynchronizedCollections(em, [x.id])
        throw new Error('boom')
    }), /boom/)
    assert.deepEqual(state.removedKeys, [])
    assert.ok(await db.getRepository(Collection).findOneBy({ id: cx.id }))
    await assertTreesConsistent()
})

test('two workers synchronizing the same collection at once produce one child per folder', async () => {
    const root = await makeFolder({ name: 'Root' })
    await makeFolder({ name: 'A', parent: root })
    await makeFolder({ name: 'B', parent: root })
    const collection = await makeCollection({ assetFolderId: root.id })
    await Promise.all([sync(collection.id), sync(collection.id), sync(collection.id)])
    assert.equal(await db.getRepository(Collection).countBy({ parentId: collection.id }), 2)
    await assertTreesConsistent()
})

test('an invitation on an ancestor stops covering a collection that moves out of it', async () => {
    const { b, x, ca, cx } = await mirroredTree()
    await save(CollectionInvitation, { collectionId: ca.id, email: fixtures.guest.email, userId: fixtures.guest.id, expiresAt: new Date(Date.now() + 86400000) })
    const visible = async () => (await userCollectionsQuery(fixtures.guest).getMany()).map(c => c.id)
    assert.ok((await visible()).includes(cx.id))
    await upsertFolder({ externalId: x.externalId, parentExternalId: b.externalId, name: 'X' })
    assert.ok(!(await visible()).includes(cx.id))
    assert.ok((await visible()).includes(ca.id))
})

test('a custom collection created under a synchronized parent survives the next synchronization', async () => {
    const { collection, ca } = await mirroredTree()
    const created = await caller(fixtures.admin).collection.create({ name: 'Guidelines', parentId: ca.id })
    await sync(collection.id)
    await sync(ca.id)
    const stored = await row(created.id)
    assert.equal(stored.parentId, ca.id)
    assert.equal(stored.assetFolderId, null)
    await assert.rejects(caller(fixtures.admin).collection.create({ name: 'Guidelines', parentId: ca.id }), { code: 'BAD_REQUEST' })
    await assert.rejects(caller(fixtures.admin).collection.rename({ id: created.id, name: 'X' }), { code: 'BAD_REQUEST' })
    await caller(fixtures.admin).collection.rename({ id: created.id, name: 'Guidelines' })
    await assertTreesConsistent()
})

test('delete guards: custom children and roots go, synchronized children stay unless orphaned, folders never link under a synchronized parent', async () => {
    const { a, collection, ca, cx } = await mirroredTree()
    const custom = await makeCollection({ parent: ca, name: 'Brief' })
    await caller(fixtures.admin).collection.remove(custom.id)
    assert.equal(await db.getRepository(Collection).countBy({ id: custom.id }), 0)
    await assert.rejects(caller(fixtures.admin).collection.remove(cx.id), { code: 'BAD_REQUEST' })
    await db.getRepository(Collection).update(cx.id, { orphanedAt: new Date(), orphanedReason: 'ambiguous_move' })
    await caller(fixtures.admin).collection.remove(cx.id)
    assert.equal(await db.getRepository(Collection).countBy({ id: cx.id }), 0)
    await assert.rejects(caller(fixtures.admin).collection.dismissOrphan(ca.id), { code: 'BAD_REQUEST' })
    await assert.rejects(caller(fixtures.admin).collection.createFromAsset({ assetFolderId: a.id, parentId: ca.id }), { code: 'BAD_REQUEST' })
    await caller(fixtures.admin).collection.remove(collection.id)
    assert.equal(await db.getRepository(Collection).countBy({ id: ca.id }), 0)
    await assertTreesConsistent()
})

test('the integrity check repairs drifted counters and previews', async () => {
    const { collection, cx, file } = await mirroredTree()
    await db.query('UPDATE collections SET number_of_files = 42, sample_file_ids = ARRAY[]::uuid[] WHERE id = $1', [collection.id])
    await db.getRepository(harness.entities.AssetFile).update(file.id, { hasThumbnail: true })
    await harness.services.collections.recomputeCollectionRollups(db.manager)
    const repaired = await row(collection.id)
    assert.equal(repaired.numberOfFiles, 1)
    assert.deepEqual(repaired.sampleFileIds, [(await db.getRepository(CollectionFile).findOneByOrFail({ collectionId: cx.id })).id])
    await assertTreesConsistent()
})

test('the upgrade merges duplicate mirrors of one folder and keeps every custom collection under them', async () => {
    const root = await makeFolder({ name: 'Root' })
    const twin = await makeFolder({ name: 'Twin', parent: root })
    const deeper = await makeFolder({ name: 'Deeper', parent: twin })
    await db.undoLastMigration()
    const insert = async (name, assetFolderId, parentId) => (await db.query(
        `INSERT INTO collections(name, public, draft, asset_folder_id, parent_id) VALUES ($1, true, false, $2, $3) RETURNING id`, [name, assetFolderId, parentId]
    ))[0]
    const collection = await insert('Root', root.id, null)
    const kept = await insert('Twin', twin.id, collection.id)
    const loser = await insert('Twin (old)', twin.id, collection.id)
    const loserChild = await insert('Deeper', deeper.id, loser.id)
    const direct = await insert('Brief', null, loser.id)
    const nested = await insert('Notes', null, loserChild.id)
    await db.runMigrations()
    assert.equal(await db.getRepository(Collection).countBy({ id: loser.id }), 0)
    assert.equal(await db.getRepository(Collection).countBy({ id: loserChild.id }), 0)
    assert.equal((await row(kept.id)).parentId, collection.id)
    assert.equal((await row(direct.id)).parentId, kept.id)
    assert.equal((await row(direct.id)).orphanedAt, null)
    assert.equal((await row(nested.id)).parentId, kept.id)
    assert.equal((await row(nested.id)).orphanedReason, 'duplicate_mirror')
    assert.equal((await row(nested.id)).orphanedFromName, 'Deeper')
    assert.equal((await row(nested.id)).path, `${collection.id}.${kept.id}.${nested.id}.`)
    await assertTreesConsistent()
})

test('an admin moves a custom collection to another collection, with its subtree, its menu item and its counters', async () => {
    const { file, collection, ca, cb } = await mirroredTree()
    const custom = await makeCollection({ parent: ca, name: 'Brief' })
    const inside = await makeCollection({ parent: custom, name: 'Notes' })
    await save(CollectionFile, { collectionId: custom.id, assetFileId: file.id })
    await db.transaction(em => harness.services.collections.syncCollectionMenuItems(em, custom))
    const customItem = (await menuItemsOf(custom.id))[0]
    const cbItem = (await menuItemsOf(cb.id))[0]
    assert.equal((await row(ca.id)).numberOfFiles, 2)
    assert.equal((await row(cb.id)).numberOfFiles, 0)
    await db.getRepository(Collection).update(cb.id, { draft: true, limitedToGroupIds: [fixtures.group.id] })

    await caller(fixtures.admin).collection.move({ id: custom.id, parentId: cb.id })

    const moved = await row(custom.id)
    assert.equal(moved.parentId, cb.id)
    assert.equal(moved.path, `${cb.path}${custom.id}.`)
    assert.equal((await row(inside.id)).path, `${moved.path}${inside.id}.`)
    assert.equal(moved.draft, true)
    assert.deepEqual(moved.limitedToGroupIds, [fixtures.group.id])
    assert.deepEqual((await row(inside.id)).limitedToGroupIds, [fixtures.group.id])
    assert.equal((await row(ca.id)).numberOfFiles, 1)
    assert.equal((await row(cb.id)).numberOfFiles, 1)
    assert.equal((await row(collection.id)).numberOfFiles, 2)
    assert.equal((await db.getRepository(MenuItem).findOneByOrFail({ id: customItem.id })).parentId, cbItem.id)
    await assertTreesConsistent()
})

test('a custom collection moved to the top level leaves the tree and gets its own menu item', async () => {
    const { ca } = await mirroredTree()
    const custom = await makeCollection({ parent: ca, name: 'Brief' })
    await db.transaction(em => harness.services.collections.syncCollectionMenuItems(em, custom))
    await caller(fixtures.admin).collection.move({ id: custom.id, parentId: null })
    const moved = await row(custom.id)
    assert.equal(moved.parentId, null)
    assert.equal(moved.path, `${custom.id}.`)
    const items = await menuItemsOf(custom.id)
    assert.equal(items.length, 1)
    assert.equal(items[0].parentId, null)
    await assertTreesConsistent()
})

test('a move is refused on a synchronized child, into its own subtree, across visibility and onto a taken name', async () => {
    const { collection, ca, cb, cx } = await mirroredTree()
    const custom = await makeCollection({ parent: ca, name: 'Brief' })
    const inside = await makeCollection({ parent: custom, name: 'Notes' })
    await assert.rejects(caller(fixtures.admin).collection.move({ id: cx.id, parentId: cb.id }), { code: 'BAD_REQUEST' })
    assert.equal((await row(cx.id)).parentId, ca.id)
    await assert.rejects(caller(fixtures.admin).collection.move({ id: custom.id, parentId: inside.id }), { code: 'BAD_REQUEST' })
    await assert.rejects(caller(fixtures.admin).collection.move({ id: custom.id, parentId: custom.id }), { code: 'BAD_REQUEST' })
    assert.equal((await row(custom.id)).parentId, ca.id)
    const private_ = await makeCollection({ name: 'Mine', public: false, owner: fixtures.admin })
    await assert.rejects(caller(fixtures.admin).collection.move({ id: private_.id, parentId: collection.id }), { code: 'BAD_REQUEST' })
    assert.equal((await row(private_.id)).parentId, null)
    await makeCollection({ parent: cb, name: 'Brief' })
    await assert.rejects(caller(fixtures.admin).collection.move({ id: custom.id, parentId: cb.id }), { code: 'BAD_REQUEST' })
    assert.equal((await row(custom.id)).parentId, ca.id)
    await assertTreesConsistent()
})

test('a member moves only their own collections, and only under their own', async () => {
    const { ca } = await mirroredTree()
    const mine = await makeCollection({ name: 'Mine', public: false, owner: fixtures.member })
    const target = await makeCollection({ name: 'Target', public: false, owner: fixtures.member })
    const someoneElse = await makeCollection({ name: 'Theirs', public: false, owner: fixtures.manager })
    await assert.rejects(caller(fixtures.member).collection.move({ id: someoneElse.id, parentId: target.id }), { code: 'NOT_FOUND' })
    await assert.rejects(caller(fixtures.member).collection.move({ id: mine.id, parentId: ca.id }), { code: 'NOT_FOUND' })
    await assert.rejects(caller(fixtures.member).collection.move({ id: mine.id, parentId: someoneElse.id }), { code: 'NOT_FOUND' })
    await caller(fixtures.member).collection.move({ id: mine.id, parentId: target.id })
    assert.equal((await row(mine.id)).parentId, target.id)
    await assertTreesConsistent()
})
