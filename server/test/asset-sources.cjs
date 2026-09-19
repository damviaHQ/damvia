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
// These tests lock how several sources share one library: a source's sweep
// never touches another source's rows, provider ids are scoped per source,
// rows from before sources existed are adopted by a lone source, rows of an
// unknown key are left alone, and a label renames the top-level folder.
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, state, makeCollection } = harness
const { AssetFolder, AssetFile } = harness.entities
const { upsertFolder, upsertFile, adoptUnassignedAssets, renameAssetSource, removeAssetSource, listAssetSourceKeys, staleAssetSourceKeys, summarizeAssetSources, registerAssetSources, recordAssetSourceRun, assetSourceStatuses, processDeletion } = harness.services.assets
const OneDriveAssetUpdater = require('../dist/asset-updater/one-drive').default
const DropboxAssetUpdater = require('../dist/asset-updater/dropbox').default
before(async () => { await harness.setup() })
after(() => harness.teardown())

const ref = (id) => ({ driveId: 'drive', id })
const oneDrive = (source, feed) => {
    const updater = new OneDriveAssetUpdater(source, 'tenant', 'client', 'secret', 'user@example.test', 'root:/Marketing:')
    const pages = [feed]
    updater.graphClient = { api: () => ({ get: async () => ({ value: pages.shift() }) }) }
    return updater
}
const dropbox = (source, entries) => {
    const updater = new DropboxAssetUpdater(source, 'key', 'secret', 'refresh', false, '')
    updater.client = { filesListFolder: async () => ({ result: { entries, has_more: false } }) }
    return updater
}
const oneDriveFeed = (ids, name = 'Marketing') => [
    { id: ids.root, name, folder: { childCount: 1 }, size: 10, parentReference: { driveId: 'drive' } },
    { id: ids.file, name: 'cover.jpg', file: { mimeType: 'image/jpeg' }, size: 10, eTag: '"e1"', parentReference: ref(ids.root) },
]
const dropboxEntries = (ids) => [
    { '.tag': 'folder', id: ids.press, name: 'Press', path_lower: '/press' },
    { '.tag': 'file', id: ids.file, name: 'kit.pdf', path_lower: '/press/kit.pdf', size: 5, content_hash: 'h1' },
]
const rows = async (sourceKey) => ({
    folders: (await db.getRepository(AssetFolder).find({ where: { sourceKey }, order: { externalId: 'ASC' } })).map(f => [f.externalId, f.parentId === null, f.status, f.name]),
    files: (await db.getRepository(AssetFile).find({ where: { sourceKey }, order: { externalId: 'ASC' } })).map(f => [f.externalId, f.status, f.externalChecksum]),
})
const fresh = () => ({ root: `root-${randomUUID()}`, press: `id:${randomUUID()}`, file: `f-${randomUUID()}` })

test('the sweep of one source never marks another source\'s folders or files, even when the other source is empty or fails', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const a = fresh(), b = fresh()
    await oneDrive({ key: 'marketing' }, oneDriveFeed(a)).fetchUpdates()
    await dropbox({ key: 'press' }, dropboxEntries(b)).fetchUpdates()
    const marketing = await rows('marketing'), press = await rows('press')
    assert.equal(marketing.folders.length, 1)
    assert.equal(press.folders.length, 2)
    assert.ok(marketing.folders.concat(press.folders).every(f => f[2] === 'up_to_date'))

    await oneDrive({ key: 'marketing' }, oneDriveFeed({ ...a, file: `f-${randomUUID()}` })).fetchUpdates()
    assert.deepEqual(await rows('press'), press)
    assert.deepEqual((await rows('marketing')).files.map(f => f[1]).sort(), ['creating', 'pending_deletion'])

    await dropbox({ key: 'press' }, []).fetchUpdates()
    assert.deepEqual(await rows('press'), press)
    await assert.rejects(dropbox({ key: 'press' }, [{ '.tag': 'file', id: 'x', name: 'x.pdf', path_lower: '/x.pdf', size: 5, content_hash: 'h' }, ...dropboxEntries(b)].map((e, i) => i === 0 ? { ...e, path_lower: '/nowhere/x.pdf' } : e)).fetchUpdates(), /failed to sync/)
    assert.deepEqual(await rows('press'), press)
})

test('the same provider id under two sources gives two independent rows', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const ids = fresh()
    await oneDrive({ key: 'one' }, oneDriveFeed(ids, 'Alpha')).fetchUpdates()
    await oneDrive({ key: 'two' }, oneDriveFeed(ids, 'Beta')).fetchUpdates()
    assert.equal(await db.getRepository(AssetFolder).countBy({ externalId: ids.root }), 2)
    assert.equal(await db.getRepository(AssetFile).countBy({ externalId: ids.file }), 2)
    await oneDrive({ key: 'one' }, oneDriveFeed({ ...ids, file: `f-${randomUUID()}` }, 'Alpha')).fetchUpdates()
    assert.deepEqual((await rows('two')).files.map(f => f[1]), ['creating'])
})

test('a label names the top-level folder and two sources showing the same top-level name are refused', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const a = fresh(), b = fresh()
    await oneDrive({ key: 'one', label: 'Brand assets' }, oneDriveFeed(a)).fetchUpdates()
    assert.deepEqual((await rows('one')).folders.map(f => f[3]), ['Brand assets'])
    await oneDrive({ key: 'one', label: 'Brand' }, oneDriveFeed(a)).fetchUpdates()
    assert.deepEqual((await rows('one')).folders.map(f => f[3]), ['Brand'])
    await assert.rejects(oneDrive({ key: 'two', label: 'Brand' }, oneDriveFeed(b)).fetchUpdates(), /same name as the top-level folder of source one, set a label/)
    assert.deepEqual(await rows('two'), { folders: [], files: [] })
    await oneDrive({ key: 'two' }, oneDriveFeed(b)).fetchUpdates()
    assert.deepEqual((await rows('two')).folders.map(f => f[3]), ['Marketing'])
    await assert.rejects(oneDrive({ key: 'three' }, oneDriveFeed(fresh())).fetchUpdates(), /"Marketing" of source three has the same name/)
})

test('rows from before sources existed are adopted, keep their ids and their collection, and are not re-downloaded', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const ids = fresh()
    await upsertFolder({ externalId: ids.root, parentExternalId: '', name: 'Marketing' })
    await upsertFile({ externalId: ids.file, externalChecksum: '"e1"', folderExternalId: ids.root, name: 'cover.jpg', size: 10, mimeType: 'image/jpeg' })
    await db.query("UPDATE asset_files SET status = 'up_to_date'")
    const folder = await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.root })
    const mirror = await makeCollection({ assetFolderId: folder.id })
    assert.deepEqual(await listAssetSourceKeys(), [''])
    assert.deepEqual(await adoptUnassignedAssets('onedrive'), { folders: 1, files: 1 })
    state.queued.length = 0
    await oneDrive({ key: 'onedrive' }, oneDriveFeed(ids)).fetchUpdates()
    assert.deepEqual(await rows('onedrive'), { folders: [[ids.root, true, 'up_to_date', 'Marketing']], files: [[ids.file, 'up_to_date', '"e1"']] })
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ externalId: ids.root })).id, folder.id)
    assert.equal((await db.getRepository(harness.entities.Collection).findOneBy({ id: mirror.id }))?.assetFolderId, folder.id)
    assert.deepEqual(state.queued, [])
})

test('rows of a key that is no longer configured are stale until rename-source moves them, and rows handed to deletion are not', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const old = fresh(), current = fresh()
    await oneDrive({ key: 'old-name' }, oneDriveFeed(old, 'Archive')).fetchUpdates()
    await oneDrive({ key: 'new-name' }, oneDriveFeed(current)).fetchUpdates()
    const before = await rows('old-name')
    assert.deepEqual(await staleAssetSourceKeys(['new-name']), ['old-name'])
    assert.deepEqual(await staleAssetSourceKeys(['new-name', 'old-name']), [])
    await oneDrive({ key: 'new-name' }, oneDriveFeed(current)).fetchUpdates()
    assert.deepEqual(await rows('old-name'), before)
    assert.deepEqual(await renameAssetSource('old-name', 'archive'), { folders: 1, files: 1 })
    assert.deepEqual(await staleAssetSourceKeys(['new-name', 'archive']), [])
    assert.deepEqual(await rows('archive'), before)
    await oneDrive({ key: 'archive' }, oneDriveFeed(old, 'Archive')).fetchUpdates()
    assert.deepEqual(await rows('archive'), before)
    // Unassigned rows are stale too once more than one source is configured.
    await upsertFolder({ externalId: fresh().root, parentExternalId: '', name: 'Legacy' })
    assert.deepEqual(await staleAssetSourceKeys(['new-name', 'archive']), [''])
    await removeAssetSource('')
    assert.deepEqual(await staleAssetSourceKeys(['new-name', 'archive']), [])
})

test('remove-source marks only that source for deletion, and the deletion job removes its rows, objects and mirrored collection', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const gone = fresh(), kept = fresh()
    await oneDrive({ key: 'gone' }, oneDriveFeed(gone, 'Archive')).fetchUpdates()
    await oneDrive({ key: 'kept' }, oneDriveFeed(kept)).fetchUpdates()
    const archive = await db.getRepository(AssetFolder).findOneByOrFail({ sourceKey: 'gone', externalId: gone.root })
    const mirror = await makeCollection({ assetFolderId: archive.id })
    const before = await rows('kept')
    assert.deepEqual(await removeAssetSource('gone'), { folders: 1, files: 1 })
    assert.deepEqual(await rows('kept'), before)
    state.removedKeys.length = 0
    await processDeletion()
    assert.deepEqual(await rows('gone'), { folders: [], files: [] })
    assert.deepEqual(await rows('kept'), before)
    assert.equal(await db.getRepository(harness.entities.Collection).countBy({ id: mirror.id }), 0)
    assert.ok(state.removedKeys.some(key => key.startsWith('asset-file/')))
    assert.deepEqual((await listAssetSourceKeys()).sort(), ['kept'])
})

test('list-sources summarises every key with its counts and top-level folder names', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    const a = fresh(), b = fresh()
    await oneDrive({ key: 'marketing' }, oneDriveFeed(a)).fetchUpdates()
    await oneDrive({ key: 'old' }, oneDriveFeed(b, 'Archive')).fetchUpdates()
    await upsertFolder({ externalId: fresh().root, parentExternalId: '', name: 'Legacy' })
    await removeAssetSource('old')
    assert.deepEqual(await summarizeAssetSources(), [
        { sourceKey: '', folders: 1, files: 0, pendingDeletion: 0, topLevel: ['Legacy'] },
        { sourceKey: 'marketing', folders: 1, files: 1, pendingDeletion: 0, topLevel: ['Marketing'] },
        { sourceKey: 'old', folders: 1, files: 1, pendingDeletion: 2, topLevel: ['Archive'] },
    ])
})

test('the dashboard reports each configured source with its last run, its rows and its top-level folder', async () => {
    await db.query('TRUNCATE asset_folders CASCADE')
    await registerAssetSources([
        { key: 'marketing', provider: 'OneDrive', label: 'Brand', root: 'root:/Marketing:' },
        { key: 'press', provider: 'Dropbox', root: '/Press' },
        { key: 'gone', provider: 'Dropbox', root: '/Gone' },
    ])
    await registerAssetSources([
        { key: 'marketing', provider: 'OneDrive', label: 'Brand', root: 'root:/Marketing:' },
        { key: 'press', provider: 'Dropbox', root: '/Press' },
    ])
    const a = fresh(), b = fresh()
    await recordAssetSourceRun('marketing', 'started')
    await oneDrive({ key: 'marketing', label: 'Brand' }, oneDriveFeed(a)).fetchUpdates()
    await recordAssetSourceRun('marketing', 'succeeded')
    await recordAssetSourceRun('press', 'started')
    await dropbox({ key: 'press' }, dropboxEntries(b)).fetchUpdates()
    await recordAssetSourceRun('press', { error: 'Dropbox token expired' })
    const statuses = await assetSourceStatuses()
    assert.deepEqual(statuses.map(s => [s.key, s.name, s.provider, s.root, s.state, s.folders, s.files, s.lastError, !!s.folderId]), [
        ['marketing', 'Brand', 'OneDrive', 'root:/Marketing:', 'ok', 1, { up_to_date: 0, creating: 1, outdated: 0, pending_deletion: 0 }, null, true],
        ['press', 'Dropbox', 'Dropbox', '/Press', 'failed', 2, { up_to_date: 0, creating: 1, outdated: 0, pending_deletion: 0 }, 'Dropbox token expired', true],
    ])
    assert.equal(statuses[0].lastSuccessAt instanceof Date, true)
    assert.equal(statuses[1].lastSuccessAt, null)
    await recordAssetSourceRun('press', 'started')
    assert.equal((await assetSourceStatuses())[1].state, 'running')
    await registerAssetSources([{ key: 'never', provider: 'Google Drive', root: '1AbC' }])
    assert.deepEqual((await assetSourceStatuses()).map(s => [s.key, s.name, s.state, s.folderId]), [['never', 'never', 'never', null]])
    const summary = await harness.caller(harness.fixtures.admin).dashboard.summary()
    assert.deepEqual(summary.sync, { paused: false, pausedSince: null, failedSources: 0 })
    assert.equal(summary.sources.length, 1)
})
