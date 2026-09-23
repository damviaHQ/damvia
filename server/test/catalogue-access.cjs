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
// A reader browses products through the collections they may open, and the
// media of a product keep the rights of the library.
// See docs/administration/catalogue.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, env, state, save, caller, makeUser, makeCollection, makeFolder, makeFile, forbidden } = harness
const { Group, UserGroup, CollectionFile, License } = harness.entities
const { addRecords } = harness.services.productCollections
let fixtures, admin, insider, group

const productId = async recordKey => (await db.query('SELECT id FROM records WHERE record_key = $1', [recordKey]))[0].id
const listed = async (user, input = {}) => (await caller(user).catalogue.list({ offset: 0, limit: 50, ...input }))
const keysOf = async (user, input = {}) => (await listed(user, input)).products.map(product => product.recordKey).sort()
const notFound = promise => assert.rejects(promise, error => error.code === 'NOT_FOUND')

before(async () => {
    fixtures = await harness.setup()
    admin = caller(fixtures.admin)
    env.assetsS3 = () => ({ presignedGetObject: async (_bucket, key) => `https://example.test/${key}` })
    group = await save(Group, { name: 'Retail' })
    insider = await makeUser('member', { name: 'insider' })
    await save(UserGroup, { userId: insider.id, groupId: group.id })
    await admin.recordAttribute.create({ name: 'season', displayName: 'Season', valueType: 'text', facetable: true, viewable: true, searchable: false })
    await admin.recordAttribute.create({ name: 'cost', displayName: 'Cost', valueType: 'text', facetable: false, viewable: false, searchable: false })
    for (const [key, season] of [['CA-PUB', 'Autumn'], ['CA-DRAFT', 'Autumn'], ['CA-LIMITED', 'Spring'], ['CA-ORPHAN', 'Spring']]) {
        await admin.record.create({ recordKey: key, values: { season, cost: '12.00' } })
    }
})
after(() => harness.teardown())

test('a product is browsed only through a collection the reader may open', async () => {
    const shared = await makeCollection({ name: 'Shared' })
    const draft = await makeCollection({ name: 'Draft', draft: true })
    const limited = await makeCollection({ name: 'Limited', limitedToGroupIds: [group.id] })
    await db.transaction(async em => {
        await addRecords(em, shared.id, [await productId('CA-PUB')])
        await addRecords(em, draft.id, [await productId('CA-DRAFT')])
        await addRecords(em, limited.id, [await productId('CA-LIMITED')])
    })

    assert.deepEqual(await keysOf(fixtures.member), ['CA-PUB'])
    assert.deepEqual(await keysOf(insider), ['CA-LIMITED', 'CA-PUB'])
    assert.deepEqual(await keysOf(fixtures.admin), ['CA-DRAFT', 'CA-LIMITED', 'CA-PUB'])
    // A product no collection holds is reachable by nobody, not even an admin.
    assert.equal((await keysOf(fixtures.admin)).includes('CA-ORPHAN'), false)
    await notFound(caller(fixtures.member).catalogue.get(await productId('CA-DRAFT')))
    await notFound(caller(fixtures.admin).catalogue.get(await productId('CA-ORPHAN')))
    assert.equal((await caller(fixtures.member).catalogue.get(await productId('CA-PUB'))).recordKey, 'CA-PUB')
})

test('opening one collection narrows the catalogue to what it holds, descendants included', async () => {
    const parent = await makeCollection({ name: 'Autumn catalogue' })
    const child = await makeCollection({ name: 'Autumn cans', parent })
    await db.transaction(async em => addRecords(em, child.id, [await productId('CA-PUB')]))
    assert.deepEqual(await keysOf(fixtures.member, { collectionId: parent.id }), ['CA-PUB'])

    const empty = await makeCollection({ name: 'Nothing yet' })
    assert.deepEqual(await keysOf(fixtures.member, { collectionId: empty.id }), [])
})

test('a collection standing for the whole catalogue opens every product at once', async () => {
    const everything = await makeCollection({ name: 'Everything' })
    await admin.collection.setRecordRules({ id: everything.id, includesAllRecords: true, catalogueMode: 'products' })
    assert.deepEqual(await keysOf(fixtures.member), ['CA-DRAFT', 'CA-LIMITED', 'CA-ORPHAN', 'CA-PUB'])
    assert.deepEqual(await keysOf(fixtures.member, { collectionId: everything.id }), ['CA-DRAFT', 'CA-LIMITED', 'CA-ORPHAN', 'CA-PUB'])
    await admin.collection.remove(everything.id)
    assert.deepEqual(await keysOf(fixtures.member), ['CA-PUB'])
})

test('only the fields an administrator made visible reach a reader', async () => {
    const product = (await listed(fixtures.member)).products[0]
    assert.equal(product.metaData.season, 'Autumn')
    assert.equal(product.metaData.cost, undefined, 'a hidden field never leaves the server')
    const { fields } = await listed(fixtures.member)
    assert.deepEqual(fields.map(field => field.name), ['season'])
    // A filter on a hidden field is refused rather than silently ignored.
    await assert.rejects(
        caller(fixtures.member).catalogue.list({ offset: 0, limit: 10, filters: [{ column: 'cost', op: 'is', value: '12.00' }] }),
        error => error.code === 'BAD_REQUEST',
    )
})

test('media keep the rights of the library while the product stays visible', async () => {
    const other = await save(harness.entities.Region, { name: 'Elsewhere', defaultGroupId: fixtures.group.id })
    const license = await save(License, { name: 'Restricted', scopes: [], allowedRegionIds: [other.id] })
    const folder = await makeFolder({ name: 'Packshots' })
    const product = await productId('CA-PUB')
    const open = await makeFile(folder, { name: 'CA-PUB-00.jpg', hasThumbnail: true, recordId: product, recordView: '00' })
    const restricted = await makeFile(folder, { name: 'CA-PUB-01.jpg', hasThumbnail: true, recordId: product, recordView: '01', licenseId: license.id })
    const library = await makeCollection({ name: 'Library files' })
    await save(CollectionFile, { collectionId: library.id, assetFileId: open.id })
    await save(CollectionFile, { collectionId: library.id, assetFileId: restricted.id })

    const card = (await listed(fixtures.member)).products.find(row => row.recordKey === 'CA-PUB')
    assert.equal(card.fileCount, 1, 'only the file the reader may open is counted')
    assert.deepEqual(card.visuals.map(visual => visual.view), ['00'])
    assert.ok(card.thumbnailURL.includes(open.id))

    const page = await caller(fixtures.member).catalogue.get(product)
    assert.deepEqual(page.files.map(file => file.name), ['CA-PUB-00.jpg'])
    // The administrator, who is not held by the licence, sees both.
    const adminPage = await admin.catalogue.get(product)
    assert.deepEqual(adminPage.files.map(file => file.name).sort(), ['CA-PUB-00.jpg', 'CA-PUB-01.jpg'])
})

test('rules never let a reader fill their own collection with the whole catalogue', async () => {
    const member = await makeUser()
    const mine = await makeCollection({ name: 'Mine', public: false, ownerId: member.id })
    // Rules are written without looking at what the caller may see, so a
    // reader writing them would read the catalogue through their own
    // collection. Hand-picking stays open to them and is checked in addItems.
    await forbidden(caller(member).collection.setRecordRules({ id: mine.id, recordFilters: [{ column: 'season', op: 'is_not_empty' }] }))
    await forbidden(caller(member).collection.setRecordRules({ id: mine.id, recordTableId: null }))
    await forbidden(caller(member).collection.setRecordRules({ id: mine.id, includesAllRecords: true }))
    // Their own collection stayed empty, so the catalogue they read is still
    // the one shared with them.
    assert.equal((await caller(member).collection.findById(mine.id)).numberOfRecords, 0)
    assert.deepEqual(await keysOf(member), ['CA-PUB'])
    // What is left to them is the mode of their own collection.
    await caller(member).collection.setRecordRules({ id: mine.id, catalogueMode: 'products' })
    assert.equal((await caller(member).collection.findById(mine.id)).catalogueMode, 'products')
})

test('free text reaches the searchable fields and never a hidden value', async () => {
    await admin.recordAttribute.create({ name: 'flavour', displayName: 'Flavour', valueType: 'text', facetable: false, viewable: true, searchable: true })
    const product = await productId('CA-PUB')
    await admin.record.patch({ id: product, values: { flavour: 'Bergamot' }, source: 'grid' })
    const hits = async query => (await listed(fixtures.member, { search: query })).total
    assert.equal(await hits('Bergamot'), 1, 'a searchable field is reachable')
    assert.equal(await hits('CA-PUB'), 1, 'the key is reachable')
    // Probing a field kept out of sight must confirm nothing.
    assert.equal(await hits('12.00'), 0)
})

test('a listing scoped to a collection the reader cannot open says not found', async () => {
    const hidden = await makeCollection({ name: 'Hidden scope', draft: true })
    await notFound(caller(fixtures.member).catalogue.list({ offset: 0, limit: 10, collectionId: hidden.id }))
    assert.deepEqual(await keysOf(fixtures.admin, { collectionId: hidden.id }), [])
})

test('a guest and a signed-out visitor get nothing', async () => {
    assert.deepEqual(await keysOf(fixtures.guest), [])
    await assert.rejects(
        caller(null).catalogue.list({ offset: 0, limit: 10 }),
        error => ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.code),
    )
})
