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
// The integrity check: orphan objects, changed checksums and the full check
// run by the CLI and the nightly job. See docs/reference/cli.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, env, state, save, makeFolder, makeFile, makeCollection, collectionRow, fileRow, downloadOptions, exportFixture, storageRow, resetStorageUsage } = harness
const { AssetFile, CollectionFile, Download } = harness.entities
const assets = require('../dist/services/asset')
const storageService = require('../dist/services/storage')
const { queued, removedKeys } = state
before(() => harness.setup())
after(() => harness.teardown())

test('the integrity check removes only old orphan objects and archives of finished downloads', async () => {
    await resetStorageUsage()
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const owned = await makeFile(await makeFolder())
    const { user, file } = await exportFixture()
    const expired = await save(Download, { userId: user.id, collectionFileIds: [file.id], status: 'expired', type: 'email', ...downloadOptions, expiresAt: twoDaysAgo })
    const preparing = await save(Download, { userId: user.id, collectionFileIds: [file.id], status: 'preparing', type: 'email', ...downloadOptions, expiresAt: new Date(Date.now() + 86400000) })
    const oldOrphan = `asset-file/${randomUUID()}`
    const youngOrphan = `asset-file/${randomUUID()}`
    state.bucketObjects = [
        { name: oldOrphan, size: 10, lastModified: twoDaysAgo },
        { name: `${oldOrphan}-thumbnail`, size: 1, lastModified: twoDaysAgo },
        { name: youngOrphan, size: 10, lastModified: new Date() },
        { name: `asset-file/${owned.id}`, size: 16, lastModified: twoDaysAgo },
        { name: 'asset-file/not-a-uuid', size: 5, lastModified: twoDaysAgo },
        { name: `downloads/${expired.id}`, size: 100, lastModified: twoDaysAgo },
        { name: `downloads/${preparing.id}`, size: 100, lastModified: twoDaysAgo },
    ]
    const result = await storageService.removeOrphanObjects()
    assert.deepEqual(removedKeys.sort(), [oldOrphan, `${oldOrphan}-thumbnail`, `downloads/${expired.id}`].sort())
    assert.equal(result.count, 3)
    assert.equal(result.bytes, 111)
    const row = await storageRow()
    assert.equal(row.orphanObjects, 3)
    assert.equal(row.orphanBytes, '111')
    assert(row.orphansRemovedAt instanceof Date)
})

test('a changed cloud checksum marks the file outdated and queues exactly one refresh', async () => {
    const folder = await makeFolder({ name: 'Sync folder' })
    const options = { externalId: randomUUID(), externalChecksum: 'v1', folderExternalId: folder.externalId, name: 'fixture.bin', size: 16, mimeType: 'application/octet-stream' }
    const created = await assets.upsertFile(options)
    assert.equal(created.status, 'creating')
    assert.equal(queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === created.id).length, 1)
    await db.getRepository(AssetFile).update(created.id, { status: 'up_to_date' })
    const unchanged = await assets.upsertFile(options)
    assert.equal(unchanged.status, 'up_to_date')
    assert.equal(queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === created.id).length, 1)
    const changed = await assets.upsertFile({ ...options, externalChecksum: 'v2' })
    assert.equal(changed.status, 'outdated')
    assert.equal(changed.externalChecksum, 'v2')
    assert.equal(queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === created.id).length, 2)
})

test('the nightly check re-queues files whose stored copy is missing or the wrong size, never a file pending deletion, recounts collections and removes old orphans', async () => {
    await resetStorageUsage()
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const folder = await makeFolder()
    const intact = await makeFile(folder, { size: '10' })
    const resized = await makeFile(folder, { size: '10' })
    const missing = await makeFile(folder, { size: '10' })
    const unfinished = await makeFile(folder, { size: '10', status: 'outdated' })
    const deleting = await makeFile(folder, { size: '10', status: 'pending_deletion' })
    const parent = await makeCollection({ name: 'Integrity parent' })
    const child = await makeCollection({ name: 'Integrity child', parent })
    for (const file of [intact, resized, missing]) await save(CollectionFile, { collectionId: child.id, assetFileId: file.id })
    await db.query('UPDATE collections SET number_of_files = 99 WHERE id = ANY($1::uuid[])', [[parent.id, child.id]])
    const orphan = `asset-file/${randomUUID()}`
    state.bucketObjects = [
        { name: intact.originalStorageKey, size: 10, lastModified: twoDaysAgo },
        { name: resized.originalStorageKey, size: 7, lastModified: twoDaysAgo },
        { name: unfinished.originalStorageKey, size: 10, lastModified: twoDaysAgo },
        { name: orphan, size: 3, lastModified: twoDaysAgo },
    ]
    const refreshes = () => queued.filter(job => job.name === 'assetUpdateContentQueue')
    const refreshesBefore = refreshes().length
    const logged = []
    const info = env.logger.info
    env.logger.info = (message, meta) => { logged.push([message, meta]) }
    try {
        await state.processors.get('system/integrity-check')([{ id: randomUUID(), name: 'system/integrity-check', data: {} }])
    } finally { env.logger.info = info }
    const mine = [intact, resized, missing, unfinished]
    assert.deepEqual(await Promise.all(mine.map(async file => (await fileRow(file.id)).status)), ['up_to_date', 'outdated', 'outdated', 'outdated'])
    const queuedNow = refreshes().slice(refreshesBefore)
    assert.deepEqual(queuedNow.filter(job => mine.some(file => file.id === job.assetFileId)).map(job => job.assetFileId).sort(), [resized.id, missing.id, unfinished.id].sort())
    assert.equal((await fileRow(deleting.id)).status, 'pending_deletion')
    assert.ok(!queuedNow.some(job => job.assetFileId === deleting.id))
    assert.deepEqual(logged.find(([message]) => message === 'integrity.files-to-sync'), ['integrity.files-to-sync', { count: queuedNow.length }])
    assert.deepEqual([(await collectionRow(parent.id)).numberOfFiles, (await collectionRow(child.id)).numberOfFiles], [3, 3])
    assert.ok(removedKeys.includes(orphan))
    assert.ok(!removedKeys.some(key => mine.some(file => key.startsWith(file.originalStorageKey))))
})
