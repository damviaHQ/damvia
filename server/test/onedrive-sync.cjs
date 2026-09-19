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
// These tests lock the OneDrive sync behaviour that production depends on.
// See docs/integrations/onedrive.md, section "Guarantees the tests lock".
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readdir } = require('node:fs/promises')
const { Readable } = require('node:stream')
const harness = require('./lib/helpers.cjs')
const { db, state, makeCollection } = harness
const { AssetFolder, AssetFile } = harness.entities
const { upsertFolder, upsertFile, tmpDir, adoptUnassignedAssets } = harness.services.assets
const OneDriveAssetUpdater = require('../dist/asset-updater/one-drive').default
before(async () => { await harness.setup() })
after(() => harness.teardown())

const ref = (id) => ({ driveId: 'drive', id })
const updaterFor = (pages) => {
    const updater = new OneDriveAssetUpdater({ key: 'onedrive' }, 'tenant', 'client', 'secret', 'user@example.test', 'root')
    const queue = pages.map((value, i) => ({ value, '@odata.nextLink': i < pages.length - 1 ? `/next/${i + 1}` : undefined }))
    updater.graphClient = { api: () => ({ get: async () => queue.shift() }) }
    return updater
}
const snapshot = async () => ({
    folders: (await db.getRepository(AssetFolder).find({ order: { externalId: 'ASC' } })).map(f => [f.externalId, f.parentId, f.status, f.name]),
    files: (await db.getRepository(AssetFile).find({ order: { externalId: 'ASC' } })).map(f => [f.externalId, f.folderId, f.status, f.externalChecksum]),
})

// A library as production wrote it: the drive root saved as a top-level folder,
// everything else keyed by its Graph parent id, eTag as checksum.
async function seedProdLibrary() {
    await db.query('TRUNCATE asset_folders CASCADE')
    const ids = { root: `root-${randomUUID()}`, top: `top-${randomUUID()}`, nested: `nested-${randomUUID()}`, rootFile: `rf-${randomUUID()}`, nestedFile: `nf-${randomUUID()}` }
    await upsertFolder({ externalId: ids.root, parentExternalId: undefined, name: 'root' })
    await upsertFolder({ externalId: ids.top, parentExternalId: ids.root, name: 'Top' })
    await upsertFolder({ externalId: ids.nested, parentExternalId: ids.top, name: 'Nested' })
    await upsertFile({ externalId: ids.rootFile, externalChecksum: '"e-root"', folderExternalId: ids.root, name: 'cover.jpg', size: 10, mimeType: 'image/jpeg' })
    await upsertFile({ externalId: ids.nestedFile, externalChecksum: '"e-nested"', folderExternalId: ids.nested, name: 'photo.jpg', size: 20, mimeType: 'image/jpeg' })
    await db.query("UPDATE asset_files SET status = 'up_to_date'")
    await adoptUnassignedAssets('onedrive')
    const rootRow = await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.root })
    const mirror = await makeCollection({ assetFolderId: rootRow.id })
    state.queued.length = 0
    return { ids, mirror }
}

const feedFor = (ids) => [
    { id: ids.root, name: 'root', root: {}, folder: { childCount: 2 }, size: 30, parentReference: { driveId: 'drive' } },
    { id: ids.top, name: 'Top', folder: { childCount: 1 }, size: 20, parentReference: ref(ids.root) },
    { id: ids.rootFile, name: 'cover.jpg', file: { mimeType: 'image/jpeg' }, size: 10, eTag: '"e-root"', cTag: '"c-root"', parentReference: ref(ids.root) },
    { id: ids.nested, name: 'Nested', folder: { childCount: 1 }, size: 20, parentReference: ref(ids.top) },
    { id: ids.nestedFile, name: 'photo.jpg', file: { mimeType: 'image/jpeg' }, size: 20, eTag: '"e-nested"', cTag: '"c-nested"', parentReference: ref(ids.nested) },
]

test('upgrading over a production library changes nothing: same parents, same statuses, no jobs, no deletion', async () => {
    const { ids, mirror } = await seedProdLibrary()
    const before = await snapshot()
    await updaterFor([feedFor(ids).slice(0, 2), feedFor(ids).slice(2)]).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual(state.queued, [])
    assert.ok(await db.getRepository(harness.entities.Collection).findOneBy({ id: mirror.id }))
})

// Production points ONEDRIVE_DRIVE at a subfolder: the listing's top item is
// that folder, whose parent (the real drive root) never appears in the listing.
test('upgrading a library synced from a subfolder keeps that folder as the only top-level row', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const ids = { top: `mk-${randomUUID()}`, child: `ch-${randomUUID()}`, file: `f-${randomUUID()}` }
    const driveRoot = `drive-root-${randomUUID()}`
    await upsertFolder({ externalId: ids.top, parentExternalId: driveRoot, name: 'Marketing' })
    await upsertFolder({ externalId: ids.child, parentExternalId: ids.top, name: 'Child' })
    await upsertFile({ externalId: ids.file, externalChecksum: '"e"', folderExternalId: ids.top, name: 'a.jpg', size: 1, mimeType: 'image/jpeg' })
    await db.query("UPDATE asset_files SET status = 'up_to_date'")
    await adoptUnassignedAssets('onedrive')
    state.queued.length = 0
    const before = await snapshot()
    assert.equal(before.folders.filter(f => f[1] === null).length, 1, 'one top-level row, the named folder')
    await updaterFor([[
        { id: ids.top, name: 'Marketing', folder: { childCount: 2 }, size: 1, parentReference: ref(driveRoot) },
        { id: ids.child, name: 'Child', folder: { childCount: 0 }, size: 1, parentReference: ref(ids.top) },
        { id: ids.file, name: 'a.jpg', file: { mimeType: 'image/jpeg' }, size: 1, eTag: '"e"', parentReference: ref(ids.top) },
    ]]).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual(state.queued, [])
})

test('an empty folder never becomes a row, and a folder that empties is removed like before', async () => {
    const { ids } = await seedProdLibrary()
    const feed = feedFor(ids)
    feed.push({ id: `empty-${randomUUID()}`, name: 'Empty', folder: { childCount: 0 }, size: 0, parentReference: ref(ids.top) })
    await updaterFor([feed]).fetchUpdates()
    assert.equal(await db.getRepository(AssetFolder).countBy({ name: 'Empty' }), 0)
    const emptied = feed.filter(i => i.id !== ids.nestedFile).map(i => i.id === ids.nested ? { ...i, size: 0 } : i)
    await updaterFor([emptied]).fetchUpdates()
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.nested })).status, 'pending_deletion')
})

test('a feed that lists children before parents and contains a notebook still syncs cleanly', async () => {
    const { ids } = await seedProdLibrary()
    const before = await snapshot()
    const feed = feedFor(ids).reverse()
    feed.push({ id: `nb-${randomUUID()}`, name: 'Notes', package: { type: 'oneNote' }, size: 5, parentReference: ref(ids.root) })
    await updaterFor([feed]).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
})

test('an edited file is queued once and a renamed file keeps the same behaviour as before (eTag changes)', async () => {
    const { ids } = await seedProdLibrary()
    const feed = feedFor(ids)
    feed[4] = { ...feed[4], eTag: '"e-nested-2"' }
    await updaterFor([feed]).fetchUpdates()
    const nested = await db.getRepository(AssetFile).findOneByOrFail({ externalId: ids.nestedFile })
    assert.equal(nested.status, 'outdated')
    assert.deepEqual(state.queued.map(j => j.name), ['assetUpdateContentQueue'])
})

test('an item removed from the feed is marked pending_deletion only when the whole run succeeded', async () => {
    const { ids } = await seedProdLibrary()
    await updaterFor([feedFor(ids).slice(0, 4)]).fetchUpdates()
    const nested = await db.getRepository(AssetFile).findOneByOrFail({ externalId: ids.nestedFile })
    assert.equal(nested.status, 'pending_deletion')
})

test('a failing item aborts the run before anything is marked for deletion', async () => {
    const { ids } = await seedProdLibrary()
    const before = await snapshot()
    const feed = feedFor(ids).slice(0, 4)
    feed.push({ id: `orphan-${randomUUID()}`, name: 'orphan.jpg', file: { mimeType: 'image/jpeg' }, size: 1, eTag: '"x"', parentReference: ref('missing-folder') })
    await assert.rejects(updaterFor([feed]).fetchUpdates(), /1 OneDrive item\(s\) failed/)
    assert.deepEqual(await snapshot(), before)
})

test('an empty feed marks nothing for deletion', async () => {
    const { ids } = await seedProdLibrary()
    const before = await snapshot()
    await updaterFor([[]]).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
})

test('files absent from a non-empty feed are legitimately marked for deletion', async () => {
    const { ids } = await seedProdLibrary()
    await updaterFor([feedFor(ids).slice(0, 1)]).fetchUpdates()
    const rows = await db.getRepository(AssetFile).findBy({ status: 'pending_deletion' })
    assert.equal(rows.length, 2)
})

test('a failing startup check is logged and never rejects, so the API keeps serving', async () => {
    const updater = updaterFor([])
    updater.graphClient = { api: () => ({ get: async () => { throw new Error('invalid_client') } }) }
    await updater.initialize()
})

test('a download failure surfaces the Graph error and leaves no temporary file behind', async () => {
    const updater = updaterFor([])
    updater.graphClient = { api: () => ({ getStream: async () => { throw new Error('itemNotFound') } }) }
    const filesBefore = (await readdir(await tmpDir())).length
    await assert.rejects(updater.fetchFileContent({ externalId: 'x' }), /itemNotFound/)
    assert.equal((await readdir(await tmpDir())).length, filesBefore)
})

test('a successful download streams the content into a temporary file', async () => {
    const updater = updaterFor([])
    updater.graphClient = { api: () => ({ getStream: async () => Readable.from(['one', 'drive']) }) }
    const path = await updater.fetchFileContent({ externalId: 'x' })
    assert.equal(require('node:fs').readFileSync(path, 'utf8'), 'onedrive')
    require('node:fs').rmSync(path)
})
