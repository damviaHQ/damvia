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
// These tests lock the Google Drive sync behaviour, kept identical in spirit to the
// OneDrive one. See docs/integrations/google-drive.md, section "Guarantees the tests lock".
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readdir, readFile, rm } = require('node:fs/promises')
const { Readable } = require('node:stream')
const harness = require('./lib/helpers.cjs')
const { db, state, makeCollection } = harness
const { AssetFolder, AssetFile, Collection } = harness.entities
const { upsertFolder, upsertFile, tmpDir, adoptUnassignedAssets } = harness.services.assets
const GoogleDriveAssetUpdater = require('../dist/asset-updater/google-drive').default
const { parseServiceAccount } = require('../dist/asset-updater/google-drive')
const { FOLDER_MIME } = require('../dist/asset-updater/google-drive-items')
before(async () => { await harness.setup() })
after(() => harness.teardown())

const KEY = { client_email: 'dam@example.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEA\n-----END PRIVATE KEY-----\n' }
const folder = (id, name, parent) => ({ id, name, mimeType: FOLDER_MIME, parents: [parent] })
const file = (id, name, parent, extra = {}) => ({ id, name, mimeType: 'image/jpeg', parents: [parent], size: '10', md5Checksum: 'md5-' + id, ...extra })

// A stub Drive client: files.list answers per parent id with optional pagination.
const updaterFor = (byParent, { root = { id: 'root', name: 'Marketing', mimeType: FOLDER_MIME }, pageSize = 1000 } = {}) => {
    const updater = new GoogleDriveAssetUpdater({ key: 'googledrive' }, KEY, root.id)
    state.listCalls = 0
    updater.drive = { files: {
        get: async (params) => { if (params.fileId !== root.id) throw new Error('File not found'); return { data: root } },
        list: async (params) => {
            state.listCalls += 1
            const parentId = params.q.match(/'(.+)' in parents/)[1]
            const all = byParent[parentId] ?? []
            const start = Number(params.pageToken ?? 0)
            const page = all.slice(start, start + pageSize)
            return { data: { files: page, nextPageToken: start + pageSize < all.length ? String(start + pageSize) : undefined } }
        },
    } }
    return updater
}
const snapshot = async () => ({
    folders: (await db.getRepository(AssetFolder).find({ order: { externalId: 'ASC' } })).map(f => [f.externalId, f.parentId, f.status, f.name]),
    files: (await db.getRepository(AssetFile).find({ order: { externalId: 'ASC' } })).map(f => [f.externalId, f.folderId, f.status, f.externalChecksum]),
})

async function seedLibrary() {
    await db.query('TRUNCATE asset_folders CASCADE')
    const ids = { root: 'root', top: `top-${randomUUID()}`, nested: `nested-${randomUUID()}`, cover: `cover-${randomUUID()}`, photo: `photo-${randomUUID()}` }
    await upsertFolder({ externalId: ids.root, parentExternalId: '', name: 'Marketing' })
    await upsertFolder({ externalId: ids.top, parentExternalId: ids.root, name: 'Top' })
    await upsertFolder({ externalId: ids.nested, parentExternalId: ids.top, name: 'Nested' })
    await upsertFile({ externalId: ids.cover, externalChecksum: 'md5-' + ids.cover, folderExternalId: ids.root, name: 'cover.jpg', size: 10, mimeType: 'image/jpeg' })
    await upsertFile({ externalId: ids.photo, externalChecksum: 'md5-' + ids.photo, folderExternalId: ids.nested, name: 'photo.jpg', size: 10, mimeType: 'image/jpeg' })
    await db.getRepository(AssetFile).update({}, { status: 'up_to_date' })
    await adoptUnassignedAssets('googledrive')
    const mirror = await makeCollection({ assetFolderId: (await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.root })).id })
    state.queued.length = 0
    return { ids, mirror }
}
const treeFor = (ids) => ({
    [ids.root]: [folder(ids.top, 'Top', ids.root), file(ids.cover, 'cover.jpg', ids.root)],
    [ids.top]: [folder(ids.nested, 'Nested', ids.top)],
    [ids.nested]: [file(ids.photo, 'photo.jpg', ids.nested)],
})

test('a second run over an unchanged library changes nothing: same parents, same statuses, no jobs, no deletion', async () => {
    const { ids, mirror } = await seedLibrary()
    const before = await snapshot()
    await updaterFor(treeFor(ids)).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual(state.queued, [])
    assert.ok(await db.getRepository(Collection).findOneBy({ id: mirror.id }))
    assert.equal(before.folders.filter(f => f[1] === null).map(f => f[3]).join(), 'Marketing')
})

test('the listing is paginated per folder and hidden folders are never descended into', async () => {
    const { ids } = await seedLibrary()
    const before = await snapshot()
    const tree = treeFor(ids)
    tree[ids.root].push(folder('hidden', '.cache', ids.root), folder('empty', 'Empty', ids.root))
    tree.hidden = [file('secret', 'secret.jpg', 'hidden')]
    tree.empty = []
    await updaterFor(tree, { pageSize: 1 }).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
    assert.equal(state.listCalls, 4 + 1 + 1 + 1, 'root has 4 items in 4 pages, top 1, nested 1, empty 1, hidden never listed')
})

test('a changed md5Checksum queues one download; a folder that empties is removed', async () => {
    const { ids } = await seedLibrary()
    const tree = treeFor(ids)
    tree[ids.nested] = [file(ids.photo, 'photo.jpg', ids.nested, { md5Checksum: 'md5-new' })]
    await updaterFor(tree).fetchUpdates()
    assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ externalId: ids.photo })).status, 'outdated')
    assert.deepEqual(state.queued.map(j => j.name), ['assetUpdateContentQueue'])
    tree[ids.nested] = []
    await updaterFor(tree).fetchUpdates()
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.nested })).status, 'pending_deletion')
})

test('a failing item aborts the run before anything is marked for deletion', async () => {
    const { ids } = await seedLibrary()
    const before = await snapshot()
    const tree = treeFor(ids)
    // A file without a MIME type falls back to application/octet-stream; a temporary constraint makes that save fail.
    tree[ids.nested] = [{ ...file('broken', 'broken', ids.nested), mimeType: null }]
    await db.query('ALTER TABLE asset_files ADD CONSTRAINT _no_octet CHECK (mime_type <> \'application/octet-stream\')')
    try {
        await assert.rejects(updaterFor(tree).fetchUpdates(), /1 Google Drive item\(s\) failed/)
        assert.deepEqual(await snapshot(), before)
    } finally {
        await db.query('ALTER TABLE asset_files DROP CONSTRAINT _no_octet')
    }
})

test('an empty listing marks nothing for deletion', async () => {
    const { ids } = await seedLibrary()
    const before = await snapshot()
    await updaterFor({ [ids.root]: [] }).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
})

test('a folder id that is not a folder or cannot be read fails the run and never rejects at startup', async () => {
    const asFile = updaterFor({}, { root: { id: 'root', name: 'x.pdf', mimeType: 'application/pdf' } })
    await asFile.initialize()
    await assert.rejects(asFile.fetchUpdates(), /is not a folder/)
    const missing = new GoogleDriveAssetUpdater({ key: 'googledrive' }, KEY, 'missing')
    missing.drive = { files: { get: async () => { throw new Error('File not found') } } }
    await missing.initialize()
    await assert.rejects(missing.fetchUpdates(), /File not found/)
})

test('a download failure surfaces the Drive error and leaves no temporary file; a success writes the content', async () => {
    const updater = updaterFor({})
    updater.drive.files.get = async () => { throw new Error('File not found') }
    const filesBefore = (await readdir(await tmpDir())).length
    await assert.rejects(updater.fetchFileContent({ externalId: 'x' }), /File not found/)
    assert.equal((await readdir(await tmpDir())).length, filesBefore)
    updater.drive.files.get = async () => ({ data: Readable.from(['google', 'drive']) })
    const path = await updater.fetchFileContent({ externalId: 'x' })
    assert.equal(await readFile(path, 'utf8'), 'googledrive')
    await rm(path)
})

test('the service account key is accepted raw or base64 and rejected when incomplete', () => {
    assert.deepEqual(parseServiceAccount(JSON.stringify(KEY)), KEY)
    assert.deepEqual(parseServiceAccount(Buffer.from(JSON.stringify(KEY)).toString('base64')), KEY)
    assert.throws(() => parseServiceAccount(Buffer.from('{"client_email":"x"}').toString('base64')), /GOOGLE_DRIVE_SERVICE_ACCOUNT/)
})
