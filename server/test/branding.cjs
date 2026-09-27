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
// Admin branding and the client logo. See docs/administration/branding.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Readable } = require('node:stream')
const sharp = require('sharp')
const { Client } = require('minio')
const harness = require('./lib/helpers.cjs')
const { env, caller, makeUser, forbidden } = harness
const storageService = require('../dist/services/storage')
const { LOGO_KEY, LOGO_TEMP_PREFIX, MAX_LOGO_BYTES, AUTH_BACKGROUND_KEY, AUTH_BACKGROUND_TEMP_PREFIX, MAX_AUTH_BACKGROUND_BYTES } = require('../dist/services/branding')
let admin, member, manager, guest
before(async () => ({ admin, member, manager, guest } = await harness.setup()))
after(() => harness.teardown())

test('host controls admin branding; clients cannot override it', async () => {
    const original = process.env.ADMIN_CLIENT_LOGO
    const alias = process.env['ADMIN-CLIENT-LOGO']
    try {
        delete process.env.ADMIN_CLIENT_LOGO
        delete process.env['ADMIN-CLIENT-LOGO']
        assert.deepEqual(await caller(admin).settings.getAdminBranding(), { useClientLogo: false })
        process.env.ADMIN_CLIENT_LOGO = 'true'
        assert.deepEqual(await caller(manager).settings.getAdminBranding(), { useClientLogo: true })
        process.env['ADMIN-CLIENT-LOGO'] = 'false'
        assert.deepEqual(await caller(admin).settings.getAdminBranding(), { useClientLogo: false })
        process.env['ADMIN-CLIENT-LOGO'] = 'true'
        assert.deepEqual(await caller(admin).settings.getAdminBranding(), { useClientLogo: true })
        for (const user of [null, guest, member, { ...admin, approved: false }]) {
            await forbidden(caller(user).settings.getAdminBranding())
        }
        for (const user of [null, guest, member, manager, { ...admin, emailVerified: false }]) {
            await forbidden(caller(user).settings.getClientLogoUpload({ contentType: 'image/png' }))
            await forbidden(caller(user).settings.processClientLogo({ uploadId: randomUUID() }))
            await forbidden(caller(user).settings.removeClientLogo())
        }
        await assert.rejects(caller(admin).settings.updateAdminBranding({ logoSource: 'tenant' }))
        await assert.rejects(caller(admin).settings.getClientLogoUpload({ contentType: 'text/html' }))
        await assert.rejects(caller(admin).settings.processClientLogo({ uploadId: '../logo' }))
    } finally {
        if (original === undefined) delete process.env.ADMIN_CLIENT_LOGO; else process.env.ADMIN_CLIENT_LOGO = original
        if (alias === undefined) delete process.env['ADMIN-CLIENT-LOGO']; else process.env['ADMIN-CLIENT-LOGO'] = alias
    }
})

test('logo uploads validate bytes, rasterise SVG, replace the previous object and clean staged files', async () => {
    const previousS3 = env.mainS3
    const objects = new Map()
    const deleted = []
    const policies = []
    let revision = 0
    const fixtureClient = new Client({ endPoint: 'localhost', accessKey: 'fixture', secretKey: 'fixture-secret' })
    const notFound = () => Object.assign(new Error('missing'), { code: 'NoSuchKey' })
    env.mainS3 = () => ({
        newPostPolicy: () => fixtureClient.newPostPolicy(),
        presignedPostPolicy: async policy => { policies.push(policy); return { postURL: 'https://example.test/upload', formData: policy.formData } },
        statObject: async (_bucket, key) => {
            if (!objects.has(key)) throw notFound()
            const entry = objects.get(key)
            return { size: entry.size ?? entry.buffer.length, versionId: entry.versionId }
        },
        getObject: async (_bucket, key) => Readable.from([objects.get(key).buffer]),
        putObject: async (_bucket, key, buffer, _size, metadata) => {
            assert.equal(metadata['Content-Type'], 'image/webp')
            objects.set(key, { buffer, versionId: String(++revision) })
        },
        removeObject: async (_bucket, key, options) => {
            deleted.push({ key, versionId: options?.versionId })
            if (!options?.versionId || objects.get(key)?.versionId === options.versionId) objects.delete(key)
        },
        presignedGetObject: async (_bucket, key) => `https://example.test/${key}`,
        listObjects: (_bucket, prefix) => Readable.from([...objects].filter(([key]) => key.startsWith(prefix)).map(([name, item]) => ({ name, size: item.buffer.length, lastModified: item.lastModified ?? new Date() }))),
        removeObjects: async (_bucket, keys) => { keys.forEach(key => objects.delete(key)) },
    })
    const stage = buffer => {
        const uploadId = randomUUID()
        const key = `${LOGO_TEMP_PREFIX}${admin.id}/${uploadId}`
        objects.set(key, { buffer })
        return { uploadId, key }
    }
    try {
        assert.deepEqual(await caller(null).settings.getClientLogo(), { exists: false, imageUrl: null })
        const upload = await caller(admin).settings.getClientLogoUpload({ contentType: 'image/png' })
        assert.equal(upload.fields.key, `${LOGO_TEMP_PREFIX}${admin.id}/${upload.uploadId}`)
        assert(policies[0].policy.conditions.some(condition => condition[0] === 'content-length-range' && condition[2] === MAX_LOGO_BYTES))
        assert(new Date(policies[0].policy.expiration).getTime() <= Date.now() + 600_000)
        const svg = stage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><script>alert(1)</script><rect width="40" height="20" fill="blue"/></svg>'))
        await caller(admin).settings.processClientLogo({ uploadId: svg.uploadId })
        assert(!objects.has(svg.key))
        assert.equal((await sharp(objects.get(LOGO_KEY).buffer).metadata()).format, 'webp')
        assert.equal((await caller(null).settings.getClientLogo()).exists, true)
        const firstVersion = objects.get(LOGO_KEY).versionId
        const png = stage(await sharp({ create: { width: 80, height: 40, channels: 4, background: '#ff0000' } }).png().toBuffer())
        await caller(admin).settings.processClientLogo({ uploadId: png.uploadId })
        assert(deleted.some(item => item.key === LOGO_KEY && item.versionId === firstVersion))
        assert.equal(objects.size, 1)
        const retained = objects.get(LOGO_KEY).buffer
        const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).jpeg().toBuffer()
        for (const bytes of [Buffer.from('<html>not an image</html>'), jpeg, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>')]) {
            const invalid = stage(bytes)
            await assert.rejects(caller(admin).settings.processClientLogo({ uploadId: invalid.uploadId }))
            assert(!objects.has(invalid.key))
            assert.deepEqual(objects.get(LOGO_KEY).buffer, retained)
        }
        const oversized = stage(Buffer.from('x'))
        objects.get(oversized.key).size = MAX_LOGO_BYTES + 1
        await assert.rejects(caller(admin).settings.processClientLogo({ uploadId: oversized.uploadId }))
        assert(!objects.has(oversized.key))
        const otherAdmin = await makeUser('admin')
        const owned = stage(retained)
        await assert.rejects(caller(otherAdmin).settings.processClientLogo({ uploadId: owned.uploadId }))
        assert(objects.has(owned.key))
        await caller(admin).settings.processClientLogo({ uploadId: owned.uploadId }) // WebP accepted.
        const abandoned = stage(retained)
        objects.get(abandoned.key).lastModified = new Date(Date.now() - 2 * 86400_000)
        await storageService.removeOrphanObjects()
        assert(!objects.has(abandoned.key))
        assert(objects.has(LOGO_KEY))
        await caller(admin).settings.removeClientLogo()
        assert.equal(objects.size, 0)
    } finally { env.mainS3 = previousS3 }
})

test('the sign-in background is staged per upload, limited in size and type, validated, converted to WebP and removed', async () => {
    const previousS3 = env.mainS3
    const objects = new Map()
    const policies = []
    const fixtureClient = new Client({ endPoint: 'localhost', accessKey: 'fixture', secretKey: 'fixture-secret' })
    env.mainS3 = () => ({
        newPostPolicy: () => fixtureClient.newPostPolicy(),
        presignedPostPolicy: async policy => { policies.push(policy); return { postURL: 'https://example.test/upload', formData: policy.formData } },
        presignedGetObject: async (_bucket, key) => `https://example.test/${key}`,
        getObject: async (_bucket, key) => Readable.from([objects.get(key).buffer]),
        putObject: async (_bucket, key, buffer, _size, metadata) => { objects.set(key, { buffer, contentType: metadata['Content-Type'] }) },
        removeObject: async (_bucket, key) => { objects.delete(key) },
        statObject: async (_bucket, key) => {
            if (!objects.has(key)) throw Object.assign(new Error('Not Found'), { code: 'NotFound' })
            const entry = objects.get(key)
            return { size: entry.size ?? entry.buffer.length }
        },
        listObjects: (_bucket, prefix) => Readable.from([...objects.entries()]
            .filter(([name]) => name.startsWith(prefix))
            .map(([name, entry]) => ({ name, size: entry.buffer.length, lastModified: entry.lastModified ?? new Date() }))),
    })
    const stage = (buffer, owner = admin) => {
        const uploadId = randomUUID()
        const key = `${AUTH_BACKGROUND_TEMP_PREFIX}/${owner.id}/${uploadId}`
        objects.set(key, { buffer })
        return { uploadId, key }
    }
    try {
        for (const user of [null, guest, member, manager, { ...admin, approved: false }, { ...admin, emailVerified: false }]) {
            await forbidden(caller(user).settings.getAuthBackgroundUpload({ contentType: 'image/png' }))
            await forbidden(caller(user).settings.processAuthBackgroundImage({ uploadId: randomUUID() }))
            await forbidden(caller(user).settings.removeAuthBackgroundImage())
        }
        await assert.rejects(caller(admin).settings.getAuthBackgroundUpload({ contentType: 'image/svg+xml' }))
        assert.deepEqual(await caller(null).settings.getAuthBackgroundImage(), { imageUrl: null, exists: false })

        const upload = await caller(admin).settings.getAuthBackgroundUpload({ contentType: 'image/jpeg' })
        assert.equal(upload.fields.key, `${AUTH_BACKGROUND_TEMP_PREFIX}/${admin.id}/${upload.uploadId}`)
        assert(policies[0].policy.conditions.some(condition => condition[0] === 'content-length-range' && condition[2] === MAX_AUTH_BACKGROUND_BYTES))
        assert(new Date(policies[0].policy.expiration).getTime() <= Date.now() + 600_000)

        const jpeg = stage(await sharp({ create: { width: 300, height: 3000, channels: 3, background: '#123456' } }).jpeg().toBuffer())
        assert.deepEqual(await caller(admin).settings.processAuthBackgroundImage({ uploadId: jpeg.uploadId }), { success: true })
        assert(!objects.has(jpeg.key))
        const converted = await sharp(objects.get(AUTH_BACKGROUND_KEY).buffer).metadata()
        assert.deepEqual([converted.format, converted.width, converted.height, objects.get(AUTH_BACKGROUND_KEY).contentType], ['webp', 200, 2000, 'image/webp'])
        assert.deepEqual(await caller(member).settings.getAuthBackgroundImage(), { imageUrl: `https://example.test/${AUTH_BACKGROUND_KEY}`, exists: true })

        const current = objects.get(AUTH_BACKGROUND_KEY).buffer
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
        for (const bytes of [Buffer.from('<html>not an image</html>'), svg]) {
            const invalid = stage(bytes)
            await assert.rejects(caller(admin).settings.processAuthBackgroundImage({ uploadId: invalid.uploadId }), /valid JPEG, PNG or WebP/)
            assert(!objects.has(invalid.key), 'a refused upload is deleted too')
            assert.deepEqual(objects.get(AUTH_BACKGROUND_KEY).buffer, current)
        }
        const oversized = stage(Buffer.from('x'))
        objects.get(oversized.key).size = MAX_AUTH_BACKGROUND_BYTES + 1
        await assert.rejects(caller(admin).settings.processAuthBackgroundImage({ uploadId: oversized.uploadId }))
        assert(!objects.has(oversized.key))

        const otherAdmin = await makeUser('admin')
        const owned = stage(current)
        await assert.rejects(caller(otherAdmin).settings.processAuthBackgroundImage({ uploadId: owned.uploadId }))
        assert(objects.has(owned.key), 'another admin cannot consume an upload they did not stage')

        const legacy = `${AUTH_BACKGROUND_TEMP_PREFIX}`
        objects.set(legacy, { buffer: current, lastModified: new Date(Date.now() - 2 * 86400_000) })
        objects.get(owned.key).lastModified = new Date(Date.now() - 2 * 86400_000)
        await storageService.removeOrphanObjects()
        assert(!objects.has(legacy) && !objects.has(owned.key), 'abandoned uploads, including the old fixed key, are removed after 24 hours')
        assert(objects.has(AUTH_BACKGROUND_KEY))

        assert.deepEqual(await caller(admin).settings.removeAuthBackgroundImage(), { success: true })
        assert.equal(objects.has(AUTH_BACKGROUND_KEY), false)
        assert.deepEqual(await caller(null).settings.getAuthBackgroundImage(), { imageUrl: null, exists: false })
    } finally { env.mainS3 = previousS3 }
})
