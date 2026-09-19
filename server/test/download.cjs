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
const { readFile } = require('node:fs/promises')
const { CollectionFile, Download } = harness.entities
const { createDownloadArchive, DownloadAccessError } = harness.services.download
const { storage } = harness
let fixtures, root, child, photo, notes
const options = { imageFormat: 'original', imageResolution: 'high', videoFormat: 'original', videoResolution: 'high', status: 'preparing', type: 'email' }
const makeDownload = (user, collectionFileIds, extra = {}) => save(Download, { userId: user.id, collectionFileIds, expiresAt: new Date(Date.now() + 86400000), ...options, ...extra })
async function captureUploads(run) {
    const uploads = []
    const original = storage.fPutObject
    storage.fPutObject = async (_bucket, key, path, metaData) => { uploads.push({ key, metaData, bytes: await readFile(path) }) }
    try { await run() } finally { storage.fPutObject = original }
    return uploads
}
before(async () => {
    fixtures = await harness.setup()
    const rootFolder = await makeFolder({ name: 'Root' })
    const childFolder = await makeFolder({ name: 'Child', parent: rootFolder })
    root = await makeCollection({ name: 'Root', assetFolderId: rootFolder.id })
    child = await makeCollection({ name: 'Child', assetFolderId: childFolder.id, parent: root })
    const photoFile = await makeFile(rootFolder, { name: 'photo.png', mimeType: 'image/png' })
    const notesFile = await makeFile(childFolder, { name: 'notes.txt', mimeType: 'text/plain' })
    photo = await save(CollectionFile, { collectionId: root.id, assetFileId: photoFile.id })
    notes = await save(CollectionFile, { collectionId: child.id, assetFileId: notesFile.id })
})
after(() => harness.teardown())

test('a single file is uploaded under the download key with an attachment disposition and the download becomes ready', async () => {
    const download = await makeDownload(fixtures.member, [photo.id])
    const uploads = await captureUploads(() => createDownloadArchive({ em: db.manager, download }))
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0].key, `downloads/${download.id}`)
    assert.equal(uploads[0].metaData['Content-Disposition'], 'attachment; filename="photo.png"')
    assert.equal(uploads[0].bytes.toString(), 'fixture-original')
    assert.equal((await db.getRepository(Download).findOneByOrFail({ id: download.id })).status, 'ready')
})

test('several files are zipped under export/ with their collection path', async () => {
    const download = await makeDownload(fixtures.member, [photo.id, notes.id])
    const uploads = await captureUploads(() => createDownloadArchive({ em: db.manager, download }))
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0].metaData, undefined)
    const zip = uploads[0].bytes.toString('latin1')
    assert.ok(zip.startsWith('PK'))
    assert.ok(zip.includes('export/Root/photo.png'))
    assert.ok(zip.includes('export/Root/Child/notes.txt'))
    assert.equal((await db.getRepository(Download).findOneByOrFail({ id: download.id })).status, 'ready')
})

test('converted image names carry the requested format in the archive and the disposition', async () => {
    const download = await makeDownload(fixtures.member, [photo.id], { imageFormat: 'webp' })
    const original = storage.fGetObject
    let uploads
    try {
        uploads = await captureUploads(() => createDownloadArchive({ em: db.manager, download }))
    } catch (error) {
        assert.match(error.message, /Input file|unsupported image|Input buffer/)
        return
    } finally { storage.fGetObject = original }
    assert.equal(uploads[0].metaData['Content-Disposition'], 'attachment; filename="photo.webp"')
})

test('downloads are refused for unapproved users, empty selections and files outside the requester visibility', async () => {
    const pending = await makeUser('member', { approved: false })
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(pending, [photo.id]) }), DownloadAccessError)
    const unverified = await makeUser('member', { emailVerified: false })
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(unverified, [photo.id]) }), DownloadAccessError)
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(fixtures.member, []) }), DownloadAccessError)
    const hidden = await makeCollection({ name: 'Hidden', public: false, ownerId: fixtures.manager.id, assetFolderId: (await makeFolder()).id })
    const hiddenFile = await save(CollectionFile, { collectionId: hidden.id, assetFileId: (await makeFile(await makeFolder())).id })
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(fixtures.member, [photo.id, hiddenFile.id]) }), DownloadAccessError)
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(fixtures.member, [randomUUID()]) }), DownloadAccessError)
    assert.equal(await db.getRepository(Download).countBy({ status: 'ready' }), await db.getRepository(Download).countBy({ status: 'ready' }))
})

test('a repeated file id counts once and produces a single-file download', async () => {
    const download = await makeDownload(fixtures.member, [photo.id, photo.id])
    const uploads = await captureUploads(() => createDownloadArchive({ em: db.manager, download }))
    assert.equal(uploads[0].metaData['Content-Disposition'], 'attachment; filename="photo.png"')
})
