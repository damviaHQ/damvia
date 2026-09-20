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
const { Readable } = require('node:stream')
const harness = require('./lib/helpers.cjs')
const { env, db, caller, makeUser, makeCollection, makeFolder, makeFile, save, forbidden } = harness
const { CollectionFile } = harness.entities
const { PageBlock } = require('../dist/entity/page-block')

let member, guest, admin
before(async () => ({ member, guest, admin } = await harness.setup()))
after(() => harness.teardown())

// Page media lives in the main bucket; every suite that touches it works on
// this in-memory stand-in so nothing depends on a running object store.
function withStorage(run) {
    const previous = env.mainS3
    const objects = new Map()
    const removed = []
    const { Client } = require('minio')
    const fixtureClient = new Client({ endPoint: 'localhost', accessKey: 'fixture', secretKey: 'fixture-secret' })
    const policies = []
    env.mainS3 = () => ({
        newPostPolicy: () => fixtureClient.newPostPolicy(),
        presignedPostPolicy: async policy => { policies.push(policy); return { postURL: 'https://example.test/upload', formData: policy.formData } },
        presignedGetObject: async (_bucket, key) => `https://example.test/${key}`,
        statObject: async (_bucket, key) => {
            if (!objects.has(key)) throw Object.assign(new Error('missing'), { code: 'NoSuchKey' })
            return { size: objects.get(key).length }
        },
        getObject: async (_bucket, key) => Readable.from([objects.get(key)]),
        putObject: async (_bucket, key, buffer) => { objects.set(key, buffer) },
        copyObject: async (_bucket, key, source) => { objects.set(key, objects.get(source.split('/').slice(2).join('/'))) },
        removeObject: async (_bucket, key) => { removed.push(key); objects.delete(key) },
        removeObjects: async (_bucket, keys) => { removed.push(...keys); keys.forEach(key => objects.delete(key)) },
        listObjects: (_bucket, prefix) => Readable.from([...objects.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name }))),
    })
    return Promise.resolve(run({ objects, removed, policies })).finally(() => { env.mainS3 = previous })
}

const blocksOf = pageId => db.getRepository(PageBlock).find({ where: { pageId }, order: { position: 'ASC' } })

async function makePage(owner, { blocks } = {}) {
    const collection = await makeCollection({ owner, public: false })
    const created = await caller(owner).page.createForCollection({ collectionId: collection.id })
    if (blocks === null) {
        return { collection, page: created }
    }
    // What the editor writes on its first save: the default arrangement.
    const page = await caller(owner).page.save({
        pageId: created.id,
        blocks: blocks ?? [
            { type: 'collections', size: 'full', data: {} },
            { type: 'files', size: 'full', data: {} },
        ],
    })
    return { collection, page }
}

test('a collection page is created empty, and asking twice returns the same one', async () => {
    const { collection, page } = await makePage(member, { blocks: null })
    assert.deepEqual(page.blocks, [])

    const again = await caller(member).page.createForCollection({ collectionId: collection.id })
    assert.equal(again.id, page.id)
})

test('only an admin or the collection owner can read and change a page', async () => {
    const { collection, page } = await makePage(member)
    const stranger = await makeUser()
    const save = user => caller(user).page.save({ pageId: page.id, blocks: [{ type: 'text', size: 'full', data: { html: '<p>Hi</p>' } }] })

    for (const user of [null, { ...member, approved: false }, { ...member, emailVerified: false }]) {
        await forbidden(save(user))
    }
    await save(member)
    await save(admin)

    // A page the caller cannot reach is reported as missing, never as existing.
    const missing = error => error.code === 'NOT_FOUND'
    for (const user of [guest, stranger]) {
        await assert.rejects(save(user), missing)
    }
    await assert.rejects(caller(stranger).page.save({ pageId: randomUUID(), blocks: [] }), missing)
    const standalone = await caller(admin).page.create({ name: 'Home' })
    await assert.rejects(caller(member).page.save({ pageId: standalone.id, blocks: [] }), missing)
    await forbidden(caller(member).page.list())
    await forbidden(caller(member).page.create({ name: 'Nope' }))
    assert.equal(collection.id, (await caller(member).collection.findById(collection.id)).id)
})

test('saving a page creates, reorders and deletes blocks in one call', async () => {
    const { page } = await makePage(member)
    const [collections, files] = page.blocks

    const saved = await caller(member).page.save({
        pageId: page.id,
        blocks: [
            { id: files.id, type: 'files', size: 'half', data: { title: 'Downloads', layout: 'grid' } },
            { type: 'text', size: 'half', data: { html: '<p>New</p>' } },
            { id: collections.id, type: 'collections', size: 'full', data: {} },
        ],
    })

    assert.deepEqual(saved.blocks.map(block => [block.type, block.position, block.size]), [
        ['files', 0, 'half'],
        ['text', 1, 'half'],
        ['collections', 2, 'full'],
    ])
    assert.equal(saved.blocks[0].data.title, 'Downloads')
    assert.deepEqual((await blocksOf(page.id)).map(block => block.position), [0, 1, 2])

    // Blocks left out of the call are the ones that get deleted.
    const kept = saved.blocks[1]
    await caller(member).page.save({ pageId: page.id, blocks: [{ id: kept.id, type: 'text', size: 'full', data: { html: '<p>Only</p>' } }] })
    assert.deepEqual((await blocksOf(page.id)).map(block => block.type), ['text'])
})

test('block content is validated and sanitized before it is stored', async () => {
    const { page } = await makePage(member)
    const save = blocks => caller(member).page.save({ pageId: page.id, blocks })

    const saved = await save([{ type: 'text', size: 'full', data: { html: '<p onclick="steal()">Hi</p><script>alert(1)</script>' } }])
    assert.equal(saved.blocks[0].data.html, '<p>Hi</p>')

    const badRequest = error => error.code === 'BAD_REQUEST'
    await assert.rejects(save([{ type: 'image', size: 'full', data: { media: { source: 'upload', s3key: 'settings/client-logo.webp' } } }]), badRequest)
    await assert.rejects(save([{ type: 'image', size: 'full', data: { media: { source: 'upload', s3key: `blocks/${randomUUID()}/${randomUUID()}` } } }]), badRequest)
    await assert.rejects(save([{ type: 'image', size: 'full', data: { link: { kind: 'url', url: 'javascript:alert(1)' } } }]), badRequest)
    await assert.rejects(save([{ type: 'collections', size: 'full', data: { collectionsId: ['not-a-uuid'] } }]), badRequest)
    await assert.rejects(save([{ id: randomUUID(), type: 'text', size: 'full', data: { html: '' } }]), badRequest)
    await assert.rejects(save([{ type: 'text', size: 'enormous', data: { html: '' } }]), () => true)
})

test('a page only hands out addresses for files the reader can open', async () => {
    const folder = await makeFolder()
    const file = await makeFile(folder, { hasThumbnail: true })
    const restricted = await makeCollection({ public: false, owner: admin })
    const collectionFile = await save(CollectionFile, { collectionId: restricted.id, assetFileId: file.id })

    const ownPage = await makePage(admin)
    await caller(admin).page.save({
        pageId: ownPage.page.id,
        blocks: [{ type: 'image', size: 'full', data: { media: { source: 'file', fileId: collectionFile.id }, alt: 'Secret' } }],
    })

    const asAdmin = await caller(admin).collection.findById(ownPage.collection.id)
    assert.equal(Object.keys(asAdmin.page.assets.files).length, 1)

    // The same block, read by someone without access, resolves to nothing.
    const reader = await makeUser()
    await db.query('UPDATE collections SET owner_id = $1, public = true, draft = false WHERE id = $2', [reader.id, ownPage.collection.id])
    const asReader = await caller(reader).collection.findById(ownPage.collection.id)
    assert.equal(asReader.page.blocks[0].data.media.fileId, collectionFile.id)
    assert.deepEqual(asReader.page.assets.files, {})
})

test('uploads are staged, re-encoded and attached to the page that asked for them', async () => {
    const sharp = require('sharp')
    const { page } = await makePage(member)
    await withStorage(async ({ objects, removed, policies }) => {
        const created = await caller(member).page.createUpload({ pageId: page.id, kind: 'image', contentType: 'image/png' })
        assert.equal(created.fields.key, `blocks/${page.id}/tmp/${created.uploadId}`)
        assert(policies[0].policy.conditions.some(condition => condition[0] === 'content-length-range' && condition[2] === 20 * 1024 * 1024))

        const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer()
        objects.set(created.fields.key, png)
        const finalized = await caller(member).page.finalizeUpload({ pageId: page.id, uploadId: created.uploadId, kind: 'image' })

        assert(finalized.s3key.startsWith(`blocks/${page.id}/`))
        assert.equal((await sharp(objects.get(finalized.s3key)).metadata()).format, 'webp')
        assert(removed.includes(created.fields.key), 'the staged upload is removed')

        // A file that is not the type it claims to be never reaches the page.
        await assert.rejects(caller(member).page.createUpload({ pageId: page.id, kind: 'image', contentType: 'image/svg+xml' }), error => error.code === 'BAD_REQUEST')
        const fake = await caller(member).page.createUpload({ pageId: page.id, kind: 'video', contentType: 'video/mp4' })
        objects.set(fake.fields.key, png)
        await assert.rejects(caller(member).page.finalizeUpload({ pageId: page.id, uploadId: fake.uploadId, kind: 'video' }), error => error.code === 'BAD_REQUEST')
        assert(removed.includes(fake.fields.key), 'a rejected upload is not left behind')

        const saved = await caller(member).page.save({
            pageId: page.id,
            blocks: [{ type: 'image', size: 'full', data: { media: { source: 'upload', s3key: finalized.s3key }, alt: 'Red' } }],
        })
        assert.equal(saved.blocks[0].data.media.s3key, finalized.s3key)
        assert.equal(saved.assets.uploads[finalized.s3key], `https://example.test/${finalized.s3key}`)
    })
})

test('objects are deleted once no block and no page needs them', async () => {
    const { page } = await makePage(member)
    await withStorage(async ({ objects, removed }) => {
        const kept = `blocks/${page.id}/${randomUUID()}`
        const dropped = `blocks/${page.id}/${randomUUID()}`
        const abandoned = `blocks/${page.id}/tmp/${randomUUID()}`
        for (const key of [kept, dropped, abandoned]) objects.set(key, Buffer.from('x'))

        await caller(member).page.save({
            pageId: page.id,
            blocks: [{ type: 'image', size: 'full', data: { media: { source: 'upload', s3key: kept }, alt: '' } }],
        })
        assert(objects.has(kept), 'the picture in use is kept')
        assert(!objects.has(dropped), 'a replaced picture is deleted')
        assert(!objects.has(abandoned), 'an abandoned upload is swept up')

        await caller(member).page.remove({ pageId: page.id })
        assert.equal(objects.size, 0)
        assert(removed.includes(kept))
        assert.equal(await db.getRepository(PageBlock).countBy({ pageId: page.id }), 0)
    })
})

test('deleting a collection takes its page objects with it', async () => {
    const { collection, page } = await makePage(member)
    await withStorage(async ({ objects }) => {
        objects.set(`blocks/${page.id}/${randomUUID()}`, Buffer.from('x'))
        await caller(member).collection.remove(collection.id)
        assert.equal(objects.size, 0)
    })
})

// A collections block can point anywhere in the library. Its cards preview
// their content, so the page has to resolve that content for the reader.
test('collections chosen in a block arrive with the previews their cards need', async () => {
    const folder = await makeFolder()
    const file = await makeFile(folder, { hasThumbnail: true })
    const chosen = await makeCollection({ name: 'Chosen' })
    const sample = await save(CollectionFile, { collectionId: chosen.id, assetFileId: file.id })
    await db.query('UPDATE collections SET sample_file_ids = $1 WHERE id = $2', [[sample.id], chosen.id])

    const hidden = await makeCollection({ name: 'Hidden', public: false, owner: admin })
    const { collection, page } = await makePage(member)
    await caller(member).page.save({
        pageId: page.id,
        blocks: [{ type: 'collections', size: 'full', data: { collectionsId: [chosen.id, hidden.id] } }],
    })

    const read = await caller(member).collection.findById(collection.id)
    const card = read.page.assets.collections[chosen.id]
    assert.equal(card.name, 'Chosen')
    assert.equal(card.numberOfFiles, 1)
    assert.equal(card.sampleFiles.length, 1, 'the card has nothing to preview')
    assert.ok(card.sampleFiles[0].thumbnailURL, 'the preview has no address')

    // A collection the reader cannot open is simply not part of the page.
    assert.equal(read.page.assets.collections[hidden.id], undefined)
})

// The editor resolves cards while an author is choosing, before the page has
// been saved, so the procedure must stand on its own access rules.
test('collection previews are available before a save, and only for what the caller can see', async () => {
    const visible = await makeCollection({ name: 'Visible' })
    const hidden = await makeCollection({ name: 'Hidden', public: false, owner: admin })

    const cards = await caller(member).page.collectionPreviews({ collectionIds: [visible.id, hidden.id] })
    assert.equal(cards[visible.id].name, 'Visible')
    assert.deepEqual(cards[visible.id].sampleFiles, [])
    assert.equal(cards[hidden.id], undefined, 'a collection the caller cannot see was returned')

    assert.deepEqual(await caller(member).page.collectionPreviews({ collectionIds: [] }), {})
    for (const user of [null, { ...member, approved: false }]) {
        await forbidden(caller(user).page.collectionPreviews({ collectionIds: [visible.id] }))
    }
})
