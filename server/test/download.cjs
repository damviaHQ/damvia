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
const { readFile, writeFile } = require('node:fs/promises')
const sharp = require('sharp')
const harness = require('./lib/helpers.cjs')
const { db, env, storage, state, server, save, caller, makeUser, makeCollection, makeFolder, makeFile } = harness
const { CollectionFile, Download, License, User } = harness.entities
const { createDownloadArchive, DownloadAccessError, formatFileName, safePathComponent } = harness.services.download
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
    assert.deepEqual(uploads[0].metaData, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="download.zip"' })
    const zip = uploads[0].bytes.toString('latin1')
    assert.ok(zip.startsWith('PK'))
    assert.ok(zip.includes('export/Root/photo.png'))
    assert.ok(zip.includes('export/Root/Child/notes.txt'))
    assert.equal((await db.getRepository(Download).findOneByOrFail({ id: download.id })).status, 'ready')
})

test('converted image names carry the requested format in the archive and the disposition', async () => {
    const download = await makeDownload(fixtures.member, [photo.id], { imageFormat: 'webp' })
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#0af' } }).png().toBuffer()
    const original = storage.fGetObject
    storage.fGetObject = async (_bucket, _key, path) => writeFile(path, png)
    let uploads
    try {
        uploads = await captureUploads(() => createDownloadArchive({ em: db.manager, download }))
    } finally { storage.fGetObject = original }
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0].metaData['Content-Disposition'], 'attachment; filename="photo.webp"')
    assert.equal((await sharp(uploads[0].bytes).metadata()).format, 'webp')
})

test('downloads are refused for unapproved users, empty selections and files outside the requester visibility', async () => {
    const readyBefore = await db.getRepository(Download).countBy({ status: 'ready' })
    const pending = await makeUser('member', { approved: false })
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(pending, [photo.id]) }), DownloadAccessError)
    const unverified = await makeUser('member', { emailVerified: false })
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(unverified, [photo.id]) }), DownloadAccessError)
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(fixtures.member, []) }), DownloadAccessError)
    const hidden = await makeCollection({ name: 'Hidden', public: false, ownerId: fixtures.manager.id, assetFolderId: (await makeFolder()).id })
    const hiddenFile = await save(CollectionFile, { collectionId: hidden.id, assetFileId: (await makeFile(await makeFolder())).id })
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(fixtures.member, [photo.id, hiddenFile.id]) }), DownloadAccessError)
    await assert.rejects(createDownloadArchive({ em: db.manager, download: await makeDownload(fixtures.member, [randomUUID()]) }), DownloadAccessError)
    assert.equal(await db.getRepository(Download).countBy({ status: 'ready' }), readyBefore, 'no refused download becomes ready')
})

test('a repeated file id counts once and produces a single-file download', async () => {
    const download = await makeDownload(fixtures.member, [photo.id, photo.id])
    const uploads = await captureUploads(() => createDownloadArchive({ em: db.manager, download }))
    assert.equal(uploads[0].metaData['Content-Disposition'], 'attachment; filename="photo.png"')
})

test('download file names swap the extension only for converted images and videos', () => {
    const image = { name: 'photo.final.png', mimeType: 'image/png' }
    const video = { name: 'clip.mov', mimeType: 'video/quicktime' }
    const document = { name: 'brief.pdf', mimeType: 'application/pdf' }
    const original = { imageFormat: 'original', videoFormat: 'original' }
    assert.equal(formatFileName(original, image, null), 'photo.final.png')
    assert.equal(formatFileName({ ...original, imageFormat: 'webp' }, image, null), 'photo.final.webp')
    assert.equal(formatFileName({ ...original, imageFormat: 'jpg' }, { ...image, name: 'logo' }, null), 'logo.jpg')
    assert.equal(formatFileName({ ...original, videoFormat: 'mp4' }, video, null), 'clip.mp4')
    assert.equal(formatFileName({ ...original, imageFormat: 'jpg' }, video, null), 'clip.mov')
    assert.equal(formatFileName({ imageFormat: 'jpg', videoFormat: 'mp4' }, document, null), 'brief.pdf')
    const chain = { name: 'Child', parent: { name: 'Root', parent: null } }
    assert.equal(formatFileName(original, image, chain), 'Root/Child/photo.final.png')
})

test('cloud storage names cannot inject headers or escape the archive folder', () => {
    assert.equal(safePathComponent('a/b\\c"d\r\ne.jpg'), 'a_b_c_d__e.jpg')
    assert.equal(safePathComponent('..'), '_')
    assert.equal(safePathComponent(' . '), '_')
    const evil = { name: '../../etc/passwd"; x="y\n', mimeType: 'image/png' }
    const chain = { name: '..', parent: { name: 'Root/..', parent: null } }
    const entry = formatFileName({ imageFormat: 'original', videoFormat: 'original' }, evil, chain)
    assert.equal(entry, 'Root_../_/.._.._etc_passwd_; x=_y_')
    assert.ok(entry.split('/').every(part => part !== '..' && part !== '.'), 'no traversal component')
    const swapped = formatFileName({ imageFormat: 'jpg', videoFormat: 'original' }, evil, null)
    assert.equal(swapped, '.._..jpg')
    assert.doesNotMatch(swapped + entry, /[\/"\r\n]{2}|["\r\n]/)
})

async function downloadable(sizes, mimeType = 'application/pdf', extra = {}) {
    const folder = await makeFolder()
    const collection = await makeCollection({ assetFolderId: folder.id })
    const ids = []
    for (const size of sizes) {
        const file = await makeFile(folder, { size: String(size), mimeType, ...extra })
        ids.push((await save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })).id)
    }
    return ids
}
const request = (collectionFileIds, downloadType = 'direct') => ({ collectionFileIds, downloadType, imageFormat: 'original', imageResolution: 'high', videoFormat: 'original', videoResolution: 'high' })

test('A5: a direct request above 1 GB is prepared and emailed instead', async () => {
    const user = await makeUser()
    state.queued.length = 0
    const result = await caller(user).download.create(request(await downloadable([600_000_000, 400_000_001])))
    assert.equal(result.downloadType, 'email')
    assert.equal(result.url, null)
    assert.equal(state.queued.filter(job => job.name === 'downloadCreateArchiveQueue').length, 1)
})

test('A5: 10 GB is refused and too many exports in preparation are refused', async () => {
    const user = await makeUser()
    await assert.rejects(caller(user).download.create(request(await downloadable([10_000_000_000]))), e => e.code === 'FORBIDDEN')
    const ids = await downloadable([2_000_000_000])
    for (let i = 0; i < 5; i++) await caller(user).download.create(request(ids, 'email'))
    await assert.rejects(caller(user).download.create(request(ids, 'email')), e => e.code === 'TOO_MANY_REQUESTS')
    assert.equal(await db.getRepository(Download).countBy({ userId: user.id }), 5)
})

test('A9: files under a licence need the terms accepted, and the acceptance is kept', async () => {
    const user = await makeUser()
    const license = await save(License, { name: 'Campaign', scopes: [], allowedRegionIds: [fixtures.region.id] })
    const ids = await downloadable([1000], 'application/pdf', { licenseId: license.id })
    await assert.rejects(caller(user).download.create(request(ids, 'email')), e => e.code === 'BAD_REQUEST')
    const result = await caller(user).download.create({ ...request(ids, 'email'), licenseAccepted: true })
    const saved = await db.getRepository(Download).findOneByOrFail({ id: result.id })
    assert.deepEqual(saved.licenseIds, [license.id])
    assert.ok(saved.licenseAcceptedAt instanceof Date)
    const [audit] = await db.query(`SELECT actor_id, after FROM audit_log WHERE action = 'license.accepted' AND target_id = $1`, [result.id])
    assert.equal(audit.actor_id, user.id)
    assert.deepEqual(audit.after.licenseIds, [license.id])
})

test('A8: a shared download link stops working when its owner is suspended', async () => {
    const user = await makeUser()
    const [id] = await downloadable([10])
    const download = await save(Download, { userId: user.id, collectionFileIds: [id], status: 'ready', type: 'email', imageFormat: 'original', imageResolution: 'high', videoFormat: 'original', videoResolution: 'high', expiresAt: new Date(Date.now() + 86400000) })
    const open = await server.inject({ method: 'GET', url: `/v1/downloads/${download.id}` })
    assert.equal(open.statusCode, 302)
    assert.doesNotMatch(open.headers.location, /link-expired/)
    await db.getRepository(User).update(user.id, { suspendedAt: new Date() })
    const closed = await server.inject({ method: 'GET', url: `/v1/downloads/${download.id}` })
    assert.match(closed.headers.location, /\/link-expired$/)
    const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM audit_log WHERE action = 'download.link_opened' AND target_id = $1`, [download.id])
    assert.equal(count, 1, 'only the successful fetch is recorded')
    const bogus = await server.inject({ method: 'GET', url: '/v1/downloads/not-a-uuid' })
    assert.match(bogus.headers.location, /\/link-expired$/)
})

const runJob = (name, data) => state.processors.get(name)([{ id: randomUUID(), name, data }])

test('the expiry job retires every download past its date once, removing its archive, and leaves the others', async () => {
    const past = new Date(Date.now() - 60000)
    const future = new Date(Date.now() + 86400000)
    const lapsedReady = await makeDownload(fixtures.member, [photo.id], { status: 'ready', expiresAt: past })
    const lapsedFailed = await makeDownload(fixtures.member, [photo.id], { status: 'failed', expiresAt: past })
    const retired = await makeDownload(fixtures.member, [photo.id], { status: 'expired', expiresAt: past })
    const current = await makeDownload(fixtures.member, [photo.id], { status: 'ready', expiresAt: future })
    state.removedKeys.length = 0
    await runJob('download/process-expired')
    const statusOf = async download => (await db.getRepository(Download).findOneByOrFail({ id: download.id })).status
    assert.deepEqual(await Promise.all([lapsedReady, lapsedFailed, retired, current].map(statusOf)), ['expired', 'expired', 'expired', 'ready'])
    assert.deepEqual(state.removedKeys.filter(key => [lapsedReady, lapsedFailed, retired, current].some(download => key === `downloads/${download.id}`)).sort(), [`downloads/${lapsedReady.id}`, `downloads/${lapsedFailed.id}`].sort())
    state.removedKeys.length = 0
    await runJob('download/process-expired')
    assert.deepEqual(state.removedKeys, [])
    const response = await server.inject({ method: 'GET', url: `/v1/downloads/${lapsedReady.id}` })
    assert.match(response.headers.location, /\/link-expired$/)
})

test('the ready mail sends the owner the API link of their download, rendered from the template', async () => {
    const owner = await makeUser()
    const download = await makeDownload(owner, [photo.id], { status: 'ready' })
    state.sentMails.length = 0
    await runJob('mailer/download-ready', { downloadId: download.id })
    assert.equal(state.sentMails.length, 1)
    const [mail] = state.sentMails
    const template = env.mailConfig()['download-ready']
    assert.deepEqual([mail.to, mail.from, mail.subject], [owner.email, template.from, template.subject])
    const links = mail.text.match(/https?:\/\/\S+/g)
    assert.deepEqual(links, [`${env.apiURL()}/v1/downloads/${download.id}`])
    assert.equal(mail.text, template.body.replace('{{ link }}', links[0]))
})
