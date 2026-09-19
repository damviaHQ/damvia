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
// These tests lock the Dropbox sync behaviour, kept identical in spirit to the
// OneDrive one. See docs/integrations/dropbox.md, section "Guarantees the tests lock".
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readdir, readFile, rm } = require('node:fs/promises')
const harness = require('./lib/helpers.cjs')
const { db, state, makeCollection } = harness
const { AssetFolder, AssetFile, Collection } = harness.entities
const { upsertFolder, upsertFile, tmpDir, adoptUnassignedAssets } = harness.services.assets
const DropboxAssetUpdater = require('../dist/asset-updater/dropbox').default
before(async () => { await harness.setup() })
after(() => harness.teardown())

const folder = (id, p) => ({ '.tag': 'folder', id, name: p.split('/').pop(), path_lower: p.toLowerCase(), path_display: p })
const file = (id, p, size = 10, hash = 'h') => ({ '.tag': 'file', id, name: p.split('/').pop(), path_lower: p.toLowerCase(), path_display: p, size, content_hash: hash })
const unauthorized = () => Object.assign(new Error('expired'), { status: 401 })

const updaterFor = (pages, { rootPath = '', rootMeta = null, failFirstWith = null } = {}) => {
    const updater = new DropboxAssetUpdater({ key: 'dropbox' }, 'key', 'secret', 'refresh', false, rootPath)
    const queue = pages.map((entries, i) => ({ result: { entries, has_more: i < pages.length - 1, cursor: `c${i + 1}` } }))
    let failures = failFirstWith ? 1 : 0
    const next = async () => { if (failures-- > 0) throw failFirstWith; return queue.shift() }
    updater.client = { filesListFolder: next, filesListFolderContinue: next, filesGetMetadata: async () => ({ result: rootMeta }), usersGetCurrentAccount: async () => ({ result: { email: 'e', root_info: { '.tag': 'user', root_namespace_id: '1', home_namespace_id: '1' } } }) }
    updater.auth = { refreshAccessToken: async () => { state.refreshed = (state.refreshed ?? 0) + 1 } }
    return updater
}
const snapshot = async () => ({
    folders: (await db.getRepository(AssetFolder).find({ order: { externalId: 'ASC' } })).map(f => [f.externalId, f.parentId, f.status, f.name]),
    files: (await db.getRepository(AssetFile).find({ order: { externalId: 'ASC' } })).map(f => [f.externalId, f.folderId, f.status, f.externalChecksum]),
})

async function seedLibrary() {
    await db.query('TRUNCATE asset_folders CASCADE')
    const ids = { marketing: `id:${randomUUID()}`, nested: `id:${randomUUID()}`, cover: `id:${randomUUID()}`, photo: `id:${randomUUID()}` }
    await upsertFolder({ externalId: 'dropbox-root', parentExternalId: '', name: 'Dropbox' })
    await upsertFolder({ externalId: ids.marketing, parentExternalId: 'dropbox-root', name: 'Marketing' })
    await upsertFolder({ externalId: ids.nested, parentExternalId: ids.marketing, name: 'Nested' })
    await upsertFile({ externalId: ids.cover, externalChecksum: 'h-cover', folderExternalId: ids.marketing, name: 'cover.jpg', size: 10, mimeType: 'image/jpeg' })
    await upsertFile({ externalId: ids.photo, externalChecksum: 'h-photo', folderExternalId: ids.nested, name: 'photo.jpg', size: 20, mimeType: 'image/jpeg' })
    await db.getRepository(AssetFile).update({}, { status: 'up_to_date' })
    await adoptUnassignedAssets('dropbox')
    const mirror = await makeCollection({ assetFolderId: (await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.marketing })).id })
    state.queued.length = 0
    return { ids, mirror }
}
const listingFor = (ids) => [
    folder(ids.marketing, '/Marketing'),
    file(ids.cover, '/Marketing/cover.jpg', 10, 'h-cover'),
    folder(ids.nested, '/Marketing/Nested'),
    file(ids.photo, '/Marketing/Nested/photo.jpg', 20, 'h-photo'),
]

test('a second run over an unchanged library changes nothing: same parents, same statuses, no jobs, no deletion', async () => {
    const { ids, mirror } = await seedLibrary()
    const before = await snapshot()
    await updaterFor([listingFor(ids).slice(0, 2), listingFor(ids).slice(2)]).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual(state.queued, [])
    assert.ok(await db.getRepository(Collection).findOneBy({ id: mirror.id }))
})

test('whole Dropbox: the synthetic "Dropbox" folder is the only top-level row and root files live in it', async () => {
    const { ids } = await seedLibrary()
    const listing = [...listingFor(ids), file('id:top', '/top.png', 3, 'h-top')]
    await updaterFor([listing]).fetchUpdates()
    const rows = await snapshot()
    assert.deepEqual(rows.folders.filter(f => f[1] === null).map(f => [f[0], f[3]]), [['dropbox-root', 'Dropbox']])
    const root = await db.getRepository(AssetFolder).findOneByOrFail({ externalId: 'dropbox-root' })
    assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ externalId: 'id:top' })).folderId, root.id)
})

test('DROPBOX_ROOT_PATH: the pointed folder is the only top-level row, and pointing at it from a whole-Dropbox library re-roots it', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const ids = { marketing: `id:${randomUUID()}`, nested: `id:${randomUUID()}`, cover: `id:${randomUUID()}`, photo: `id:${randomUUID()}` }
    await upsertFolder({ externalId: ids.marketing, parentExternalId: '', name: 'Marketing' })
    await upsertFolder({ externalId: ids.nested, parentExternalId: ids.marketing, name: 'Nested' })
    await upsertFile({ externalId: ids.cover, externalChecksum: 'h-cover', folderExternalId: ids.marketing, name: 'cover.jpg', size: 10, mimeType: 'image/jpeg' })
    await upsertFile({ externalId: ids.photo, externalChecksum: 'h-photo', folderExternalId: ids.nested, name: 'photo.jpg', size: 20, mimeType: 'image/jpeg' })
    await db.getRepository(AssetFile).update({}, { status: 'up_to_date' })
    await adoptUnassignedAssets('dropbox')
    state.queued.length = 0
    const before = await snapshot()
    assert.deepEqual(before.folders.filter(f => f[1] === null).map(f => f[3]), ['Marketing'])
    await updaterFor([listingFor(ids).slice(1)], { rootPath: 'Marketing/', rootMeta: folder(ids.marketing, '/Marketing') }).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual(state.queued, [])
})

test('a listing with children before parents, a hidden folder and an empty folder still syncs cleanly', async () => {
    const { ids } = await seedLibrary()
    const before = await snapshot()
    const listing = listingFor(ids).reverse()
    listing.push(folder('id:hidden', '/Marketing/.cache'), file('id:hf', '/Marketing/.cache/x.bin', 5), folder('id:empty', '/Marketing/Empty'))
    await updaterFor([listing]).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
})

test('a changed content_hash queues one download; a folder that empties is removed', async () => {
    const { ids } = await seedLibrary()
    const listing = listingFor(ids)
    listing[3] = { ...listing[3], content_hash: 'h-photo-2' }
    await updaterFor([listing]).fetchUpdates()
    assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ externalId: ids.photo })).status, 'outdated')
    assert.deepEqual(state.queued.map(j => j.name), ['assetUpdateContentQueue'])
    await updaterFor([listingFor(ids).slice(0, 3)]).fetchUpdates()
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.nested })).status, 'pending_deletion')
})

test('a failing item aborts the run before anything is marked for deletion', async () => {
    const { ids } = await seedLibrary()
    const before = await snapshot()
    const listing = listingFor(ids).slice(0, 3)
    // A file without an extension is stored as application/octet-stream; a temporary constraint makes that save fail.
    listing.push(file('id:broken', '/Marketing/broken', 1, 'x'))
    await db.query('ALTER TABLE asset_files ADD CONSTRAINT _no_octet CHECK (mime_type <> \'application/octet-stream\')')
    try {
        await assert.rejects(updaterFor([listing]).fetchUpdates(), /1 Dropbox item\(s\) failed/)
        assert.deepEqual(await snapshot(), before)
    } finally {
        await db.query('ALTER TABLE asset_files DROP CONSTRAINT _no_octet')
    }
})

test('an empty listing marks nothing for deletion', async () => {
    await seedLibrary()
    const before = await snapshot()
    await updaterFor([[]]).fetchUpdates()
    assert.deepEqual(await snapshot(), before)
})

test('a 401 during listing refreshes the token once and retries; a second 401 surfaces', async () => {
    const { ids } = await seedLibrary()
    state.refreshed = 0
    await updaterFor([listingFor(ids)], { failFirstWith: unauthorized() }).fetchUpdates()
    assert.equal(state.refreshed, 1)
    const updater = updaterFor([listingFor(ids)])
    updater.client.filesListFolder = async () => { throw unauthorized() }
    await assert.rejects(updater.fetchUpdates(), /expired/)
})

test('a download failure surfaces the Dropbox error and leaves no temporary file; a success writes the content', async () => {
    const updater = updaterFor([])
    updater.client.filesDownload = async () => { throw new Error('path/not_found') }
    const filesBefore = (await readdir(await tmpDir())).length
    await assert.rejects(updater.fetchFileContent({ externalId: 'id:x' }), /path\/not_found/)
    assert.equal((await readdir(await tmpDir())).length, filesBefore)
    updater.client.filesDownload = async () => ({ result: { fileBinary: Buffer.from('dropbox') } })
    const path = await updater.fetchFileContent({ externalId: 'id:x' })
    assert.equal(await readFile(path, 'utf8'), 'dropbox')
    await rm(path)
})
