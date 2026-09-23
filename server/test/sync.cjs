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
const { Collection, CollectionFile, AssetFolder, AssetFile, AssetType, License } = harness.entities
const { upsertFolder, upsertFile, deleteFolder, deleteFile } = harness.services.assets
const { synchronizeCollection } = harness.services.collections
let fixtures
const queuedSyncs = () => state.queued.filter(job => job.name === 'collectionSynchronizationQueue').map(job => job.collectionId).sort()
const queuedContent = () => state.queued.filter(job => job.name === 'assetUpdateContentQueue').map(job => job.assetFileId)
const folderRow = externalId => db.getRepository(AssetFolder).findOneByOrFail({ externalId })
const fileRow = externalId => db.getRepository(AssetFile).findOneByOrFail({ externalId })
const collectionIdsOf = assetFileId => db.getRepository(CollectionFile).findBy({ assetFileId }).then(rows => rows.map(row => row.collectionId).filter(Boolean).sort())
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

test('a new folder inherits its parent licence and asset type and queues one sync per parent collection', async () => {
    const license = await save(License, { name: 'Parent licence', scopes: [], allowedRegionIds: [] })
    const assetType = await save(AssetType, { name: 'Parent type', defaultDisplay: 'grid', listDisplayItems: [] })
    const parent = await makeFolder({ licenseId: license.id, assetTypeId: assetType.id })
    const mirrors = [await makeCollection({ assetFolderId: parent.id }), await makeCollection({ assetFolderId: parent.id })]
    state.queued.length = 0
    const externalId = randomUUID()
    await upsertFolder({ externalId, parentExternalId: parent.externalId, name: 'Child' })
    const folder = await folderRow(externalId)
    assert.equal(folder.parentId, parent.id)
    assert.equal(folder.licenseId, license.id)
    assert.equal(folder.assetTypeId, assetType.id)
    assert.equal(folder.status, 'up_to_date')
    assert.deepEqual(queuedSyncs(), mirrors.map(c => c.id).sort())
    state.queued.length = 0
    await upsertFolder({ externalId, parentExternalId: parent.externalId, name: 'Child' })
    assert.deepEqual(state.queued, [])
})

test('renaming a folder queues its own and its parent collections once each', async () => {
    const parent = await makeFolder()
    const parentMirror = await makeCollection({ assetFolderId: parent.id })
    const externalId = randomUUID()
    await upsertFolder({ externalId, parentExternalId: parent.externalId, name: 'Before' })
    const own = await makeCollection({ assetFolderId: (await folderRow(externalId)).id })
    state.queued.length = 0
    await upsertFolder({ externalId, parentExternalId: parent.externalId, name: 'After' })
    assert.equal((await folderRow(externalId)).name, 'After')
    assert.deepEqual(queuedSyncs(), [own.id, parentMirror.id].sort())
})

test('reparenting re-inherits from the new parent and queues the old parent, the new parent and the folder itself', async () => {
    const oldLicense = await save(License, { name: 'Old', scopes: [], allowedRegionIds: [] })
    const newLicense = await save(License, { name: 'New', scopes: [], allowedRegionIds: [] })
    const oldParent = await makeFolder({ licenseId: oldLicense.id })
    const newParent = await makeFolder({ licenseId: newLicense.id })
    const oldMirror = await makeCollection({ assetFolderId: oldParent.id })
    const newMirror = await makeCollection({ assetFolderId: newParent.id })
    const externalId = randomUUID()
    await upsertFolder({ externalId, parentExternalId: oldParent.externalId, name: 'Moving' })
    const own = await makeCollection({ assetFolderId: (await folderRow(externalId)).id })
    assert.equal((await folderRow(externalId)).licenseId, oldLicense.id)
    state.queued.length = 0
    await upsertFolder({ externalId, parentExternalId: newParent.externalId, name: 'Moving' })
    const folder = await folderRow(externalId)
    assert.equal(folder.parentId, newParent.id)
    assert.equal(folder.licenseId, newLicense.id)
    assert.deepEqual(queuedSyncs(), [own.id, oldMirror.id, newMirror.id].sort())
})

test('a licence set by hand on a folder survives syncs that do not move it', async () => {
    const parent = await makeFolder()
    const manual = await save(License, { name: 'Manual', scopes: [], allowedRegionIds: [] })
    const externalId = randomUUID()
    await upsertFolder({ externalId, parentExternalId: parent.externalId, name: 'Manual' })
    await db.getRepository(AssetFolder).update({ externalId }, { licenseId: manual.id })
    state.queued.length = 0
    await upsertFolder({ externalId, parentExternalId: parent.externalId, name: 'Manual' })
    assert.equal((await folderRow(externalId)).licenseId, manual.id)
    assert.deepEqual(state.queued, [])
})

test('a new file starts in creating status, queues one content update and is mirrored into every collection of its folder', async () => {
    const license = await save(License, { name: 'Folder licence', scopes: [], allowedRegionIds: [] })
    const folder = await makeFolder({ licenseId: license.id })
    const mirrors = [await makeCollection({ assetFolderId: folder.id }), await makeCollection({ assetFolderId: folder.id })]
    state.queued.length = 0
    const externalId = randomUUID()
    await upsertFile({ externalId, externalChecksum: 'a', folderExternalId: folder.externalId, name: 'a.png', size: 10, mimeType: 'image/png' })
    const file = await fileRow(externalId)
    assert.equal(file.status, 'creating')
    assert.equal(file.size, '10')
    assert.equal(file.licenseId, license.id)
    assert.deepEqual(queuedContent(), [file.id])
    assert.deepEqual(await collectionIdsOf(file.id), mirrors.map(c => c.id).sort())
})

test('a changed checksum marks an up-to-date file outdated and queues exactly one refresh', async () => {
    const folder = await makeFolder()
    await makeCollection({ assetFolderId: folder.id })
    const externalId = randomUUID()
    const input = { externalId, externalChecksum: 'a', folderExternalId: folder.externalId, name: 'a.png', size: 10, mimeType: 'image/png' }
    await upsertFile(input)
    await db.getRepository(AssetFile).update({ externalId }, { status: 'up_to_date' })
    state.queued.length = 0
    await upsertFile({ ...input, externalChecksum: 'b' })
    assert.equal((await fileRow(externalId)).status, 'outdated')
    assert.equal(queuedContent().length, 1)
    state.queued.length = 0
    await upsertFile({ ...input, externalChecksum: 'b' })
    assert.equal((await fileRow(externalId)).status, 'outdated')
    assert.deepEqual(state.queued, [])
})

test('moving a file to another folder replaces its collection memberships and re-inherits the folder licence', async () => {
    const manual = await save(License, { name: 'Manual file licence', scopes: [], allowedRegionIds: [] })
    const folderLicense = await save(License, { name: 'Target licence', scopes: [], allowedRegionIds: [] })
    const source = await makeFolder()
    const target = await makeFolder({ licenseId: folderLicense.id })
    await makeCollection({ assetFolderId: source.id })
    const targetMirror = await makeCollection({ assetFolderId: target.id })
    const externalId = randomUUID()
    const input = { externalId, externalChecksum: 'a', folderExternalId: source.externalId, name: 'a.png', size: 10, mimeType: 'image/png' }
    await upsertFile(input)
    await db.getRepository(AssetFile).update({ externalId }, { status: 'up_to_date', licenseId: manual.id })
    state.queued.length = 0
    await upsertFile({ ...input, folderExternalId: target.externalId })
    const file = await fileRow(externalId)
    assert.equal((await db.getRepository(CollectionFile).findBy({ assetFileId: file.id })).filter(row => row.collectionId === null).length, 1, 'moving a picture preserves its record access identity')
    assert.equal(file.folderId, target.id)
    assert.equal(file.licenseId, folderLicense.id)
    assert.equal(file.status, 'up_to_date')
    assert.deepEqual(await collectionIdsOf(file.id), [targetMirror.id])
    assert.deepEqual(state.queued, [])
})

test('deleting a folder removes the subtree, its files, mirrored collections and storage objects', async () => {
    const root = await makeFolder()
    const child = await makeFolder({ parent: root })
    const rootMirror = await makeCollection({ assetFolderId: root.id })
    const childMirror = await makeCollection({ assetFolderId: child.id, parent: rootMirror })
    const rootFile = await makeFile(root)
    const childFile = await makeFile(child)
    await save(CollectionFile, { collectionId: rootMirror.id, assetFileId: rootFile.id })
    await save(CollectionFile, { collectionId: childMirror.id, assetFileId: childFile.id })
    state.removedKeys.length = 0
    await deleteFolder(root.id)
    assert.equal(await db.getRepository(AssetFolder).countBy({ id: root.id }), 0)
    assert.equal(await db.getRepository(AssetFolder).countBy({ id: child.id }), 0)
    assert.equal(await db.getRepository(AssetFile).countBy({ folderId: child.id }), 0)
    assert.equal(await db.getRepository(Collection).countBy({ id: rootMirror.id }), 0)
    assert.equal(await db.getRepository(Collection).countBy({ id: childMirror.id }), 0)
    assert.equal(await db.getRepository(CollectionFile).countBy({ assetFileId: rootFile.id }), 0)
    assert.deepEqual(state.removedKeys.sort(), [rootFile, childFile].flatMap(f => [f.originalStorageKey, f.thumbnailStorageKey]).sort())
    await deleteFolder(randomUUID())
})

test('synchronizing a collection mirrors child folders with the same owner and flags and queues the children', async () => {
    const root = await makeFolder({ name: 'Campaign' })
    const childA = await makeFolder({ name: 'A', parent: root })
    const childB = await makeFolder({ name: 'B', parent: root })
    const file = await makeFile(root)
    const collection = await makeCollection({ name: 'stale name', assetFolderId: root.id, public: false, draft: true, ownerId: fixtures.manager.id })
    state.queued.length = 0
    await synchronizeCollection(db.manager, collection.id)
    const parent = await db.getRepository(Collection).findOneByOrFail({ id: collection.id })
    assert.equal(parent.name, 'Campaign')
    assert.deepEqual(await collectionIdsOf(file.id), [collection.id])
    const children = await db.getRepository(Collection).findBy({ parentId: collection.id })
    assert.equal(children.length, 2)
    assert.deepEqual(children.map(c => c.assetFolderId).sort(), [childA.id, childB.id].sort())
    for (const child of children) {
        assert.equal(child.public, false)
        assert.equal(child.draft, true)
        assert.equal(child.ownerId, fixtures.manager.id)
        assert.equal(child.path, `${parent.path}${child.id}.`)
    }
    assert.deepEqual(queuedSyncs(), children.map(c => c.id).sort())
    const [keptId] = children.filter(c => c.assetFolderId === childA.id).map(c => c.id)
    await deleteFolder(childB.id)
    const secondFile = await makeFile(root)
    await deleteFile(file.id)
    state.queued.length = 0
    await synchronizeCollection(db.manager, collection.id)
    const after = await db.getRepository(Collection).findBy({ parentId: collection.id })
    assert.deepEqual(after.map(c => c.id), [keptId])
    assert.deepEqual(await collectionIdsOf(secondFile.id), [collection.id])
    assert.equal(await db.getRepository(CollectionFile).countBy({ collectionId: collection.id }), 1)
    assert.deepEqual(queuedSyncs(), [keptId])
    await synchronizeCollection(db.manager, randomUUID())
})
