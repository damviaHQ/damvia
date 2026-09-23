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
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
process.env.DOTENV_CONFIG_PATH = '/dev/null'
process.env.APP_SECRET = 'pure-tests-only-random-fixture-secret-20260919'
process.env.MAILCONFIG = Buffer.from('{}').toString('base64')
const env = require('../dist/env')
const credentials = require('../dist/services/credentials')
const { formatBytes } = require('../dist/services/storage')
const { formatFileName, safePathComponent } = require('../dist/services/download')
const { resolveMimeType } = require('../dist/services/asset')
const { compact } = require('../dist/util/array')
const { Collection } = require('../dist/entity/collection')

test('STORAGE_QUOTA accepts decimal sizes and rejects anything else', () => {
    assert.equal(env.parseStorageQuota('1.5TB'), 1500000000000)
    assert.equal(env.parseStorageQuota('1500GB'), 1500000000000)
    assert.equal(env.parseStorageQuota('1500 gb'), 1500000000000)
    assert.equal(env.parseStorageQuota('2000000000000'), 2000000000000)
    assert.equal(env.parseStorageQuota(''), null)
    assert.equal(env.parseStorageQuota(undefined), null)
    for (const value of ['abc', '-5GB', '0', '1.5 TiB', '10GB extra']) assert.throws(() => env.parseStorageQuota(value), /STORAGE_QUOTA/)
})

test('passwords are hashed with a fresh salt and verified in constant-time form', async () => {
    const password = 'fixture-password'
    const first = await credentials.hashPassword(password)
    const second = await credentials.hashPassword(password)
    assert.notEqual(first, second)
    assert.match(first, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
    assert.equal(await credentials.verifyPassword(password, first), true)
    assert.equal(await credentials.verifyPassword('wrong', first), false)
    assert.equal(await credentials.verifyPassword(password, null), false)
    assert.equal(await credentials.verifyPassword(password, 'scrypt$invalid'), false)
    assert.equal(await credentials.verifyPassword(password, 'not-a-hash'), false)
})

test('legacy sha512 hashes still verify until the next login upgrades them', async () => {
    const legacy = createHash('sha512').update('legacy-password').digest('hex')
    assert.equal(await credentials.verifyPassword('legacy-password', legacy), true)
    assert.equal(await credentials.verifyPassword('other', legacy), false)
})

test('reset tokens are stored as sha256 and the app secret must be long and non-default', () => {
    assert.equal(credentials.hashResetToken('token'), createHash('sha256').update('token').digest('hex'))
    assert.equal(credentials.validateAppSecret('x'.repeat(32)), 'x'.repeat(32))
    for (const value of [undefined, '', '   ', 'short', 'Damvia App Secret', `${'y'.repeat(31)} `]) {
        assert.throws(() => credentials.validateAppSecret(value), /APP_SECRET/)
    }
})

test('formatBytes uses decimal units with one decimal above bytes', () => {
    assert.equal(formatBytes(0), '0 B')
    assert.equal(formatBytes(999), '999 B')
    assert.equal(formatBytes(1000), '1.0 KB')
    assert.equal(formatBytes(1536), '1.5 KB')
    assert.equal(formatBytes(1500000000000), '1.5 TB')
    assert.equal(formatBytes(1e18), '1000.0 PB')
})

test('compact drops null and undefined but keeps other falsy values', () => {
    assert.deepEqual(compact([0, '', false, null, undefined, 'a']), [0, '', false, 'a'])
    assert.deepEqual(compact([]), [])
})

test('collections expose their ancestor ids from the path and are editable by admins and owners', () => {
    const collection = new Collection()
    assert.equal(collection.parentCollectionIds, undefined)
    collection.path = 'a.b.'
    assert.deepEqual(collection.parentCollectionIds, ['a', 'b'])
    collection.ownerId = 'owner'
    assert.equal(collection.canEdit({ id: 'x', role: 'admin' }), true)
    assert.equal(collection.canEdit({ id: 'owner', role: 'member' }), true)
    assert.equal(collection.canEdit({ id: 'x', role: 'manager' }), false)
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

test('a listing MIME type is kept only when the content cannot be identified and it is not active content', () => {
    assert.equal(resolveMimeType({ ext: 'png', mime: 'image/png' }, 'text/html'), 'image/png')
    assert.equal(resolveMimeType({ ext: 'webp', mime: 'image/webp' }, null), 'image/webp')
    assert.equal(resolveMimeType(null, 'text/csv'), 'text/csv')
    assert.equal(resolveMimeType(undefined, 'application/pdf'), 'application/pdf')
    for (const active of ['text/html', 'TEXT/HTML', 'image/svg+xml', 'application/javascript', 'application/xml']) assert.equal(resolveMimeType(null, active), 'application/octet-stream')
    assert.equal(resolveMimeType(null, null), 'application/octet-stream')
    assert.equal(resolveMimeType(null, ''), 'application/octet-stream')
})

test('logged errors keep the database message and code, nested included', () => {
    const driverError = Object.assign(new Error('deadlock detected'), { code: '40P01', detail: 'Process 1 waits for ShareLock' })
    const queryError = Object.assign(new Error('deadlock detected'), { name: 'QueryFailedError', code: '40P01', query: 'UPDATE "asset_files" SET 1', driverError })
    const at = new Date('2026-09-21T12:00:00Z')
    const lines = []
    const transport = new (require('winston').transports.Stream)({ stream: new (require('node:stream').Writable)({ write(chunk, _, done) { lines.push(chunk.toString()); done() } }) })
    env.logger.add(transport)
    env.logger.silent = false
    try {
        env.logger.error('failed to update assets', { source: 'dropbox', error: queryError, at, list: [driverError] })
    } finally { env.logger.remove(transport) }
    const logged = JSON.parse(lines[0].slice(lines[0].indexOf('{')))
    assert.equal(logged.source, 'dropbox')
    assert.equal(logged.error.name, 'QueryFailedError')
    assert.equal(logged.error.message, 'deadlock detected')
    assert.equal(logged.error.code, '40P01')
    assert.equal(logged.error.query, 'UPDATE "asset_files" SET 1')
    assert.equal(logged.at, '2026-09-21T12:00:00.000Z')
    assert.equal(logged.list[0].detail, 'Process 1 waits for ShareLock')
})
