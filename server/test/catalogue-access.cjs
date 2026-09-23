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
// linked pictures follow record access while keeping licence restrictions.
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
    assert.deepEqual(await keysOf(fixtures.member, { collectionId: parent.id, collectionOnly: true }), [])
    assert.deepEqual(await keysOf(fixtures.member, { collectionId: child.id, collectionOnly: true }), ['CA-PUB'])

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

test('linked pictures keep licence restrictions while the product stays visible', async () => {
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
    assert.equal((await listed(fixtures.member, { searchTerms: ['CA-PUB', 'MISSING'] })).total, 1, 'separate references match independently')
    assert.equal((await listed(fixtures.member, { searchTerms: ['Bergamot', 'MISSING'] })).total, 1, 'searchable fields match separate terms')
    assert.equal((await listed(fixtures.member, { search: 'CA-PUB MISSING' })).total, 0, 'an exact phrase stays together')
    // Probing a field kept out of sight must confirm nothing.
    assert.equal(await hits('12.00'), 0)
    assert.equal((await listed(fixtures.member, { searchTerms: ['12.00'] })).total, 0)
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

test('catalogue facets cover the full visible scope and keep exclusions local to each collection', async () => {
    const collection = await makeCollection({ name: 'Facet catalogue' })
    await admin.record.create({ recordKey: 'CA-FACET-1', values: { season: 'Winter' } })
    await admin.record.create({ recordKey: 'CA-FACET-2', values: { season: 'Summer' } })
    const firstId = await productId('CA-FACET-1')
    const secondId = await productId('CA-FACET-2')
    await db.transaction(em => addRecords(em, collection.id, [firstId, secondId]))
    const page = await caller(fixtures.member).catalogue.list({ collectionId: collection.id, offset: 0, limit: 1 })
    assert.equal(page.products.length, 1)
    const facets = await caller(fixtures.member).catalogue.facets({ collectionId: collection.id })
    assert.equal(facets.total, 2)
    assert.deepEqual(facets.attributes.find(field => field.label === 'Season').options.map(option => option.id), ['Summer', 'Winter'])
    assert.equal(facets.attributes.some(field => field.label === 'Cost'), false)
    const seasonId = facets.attributes.find(field => field.label === 'Season').id
    assert.deepEqual(await keysOf(fixtures.member, { collectionId: collection.id, filters: [{ column: seasonId, op: 'has_any', values: ['Winter'] }] }), ['CA-FACET-1'])
    const filtered = await caller(fixtures.member).catalogue.facets({ collectionId: collection.id, filters: [{ column: 'season', op: 'has_any', values: ['Winter'] }] })
    assert.equal(filtered.attributes.find(field => field.label === 'Season').options.length, 2)
    const elsewhere = await makeCollection({ name: 'Also visible here' })
    await db.transaction(em => addRecords(em, elsewhere.id, [secondId]))
    await admin.collection.setRecordsExcluded({ id: collection.id, recordIds: [secondId], excluded: true })
    assert.deepEqual(await keysOf(fixtures.member, { collectionId: collection.id }), ['CA-FACET-1'])
    assert.equal((await caller(fixtures.member).catalogue.facets({ collectionId: collection.id })).total, 1)
    await admin.collection.remove(collection.id)
    await admin.collection.remove(elsewhere.id)
})

test('linked file blocks use collection file identities and keep licence restrictions', async () => {
    const product = await caller(fixtures.member).catalogue.get(await productId('CA-PUB'))
    assert.deepEqual(product.collectionFiles.map(file => file.name), ['CA-PUB-00.jpg'])
    for (const file of product.collectionFiles) {
        assert.ok(await db.getRepository(CollectionFile).findOneBy({ id: file.id }))
        assert.ok(file.fileURL)
        assert.ok(file.dimensions)
    }
})


test('related records combine scoped AND groups with OR, exclusions and permitted photos', async () => {
    const current = await makeCollection({ name: 'Related current' })
    const elsewhere = await makeCollection({ name: 'Related elsewhere' })
    const hidden = await makeCollection({ name: 'Related private', draft: true })
    const folder = await makeFolder({ name: 'Related media' })
    const library = await makeCollection({ name: 'Related photos' })
    const ids = {}
    for (const [key, season, collection] of [
        ['SOURCE', 'Winter', current], ['MATCH', 'Winter', current], ['EXCLUDED', 'SS24', current],
        ['ELSEWHERE', 'Summer', elsewhere], ['PRIVATE', 'Winter', hidden], ['PDF', 'Winter', elsewhere],
        ['RESTRICTED', 'Winter', elsewhere],
    ]) {
        await admin.record.create({ recordKey: `RELATED-${key}`, values: { season } })
        ids[key] = await productId(`RELATED-${key}`)
        await db.transaction(em => addRecords(em, collection.id, [ids[key]]))
    }
    const region = await save(harness.entities.Region, { name: 'Related region', defaultGroupId: fixtures.group.id })
    const license = await save(License, { name: 'Related licence', scopes: [], allowedRegionIds: [region.id] })
    for (const key of ['ELSEWHERE', 'PRIVATE', 'PDF', 'RESTRICTED']) {
        const file = await makeFile(folder, { name: `RELATED-${key}`, recordId: ids[key], mimeType: key === 'PDF' ? 'application/pdf' : 'image/jpeg', licenseId: key === 'RESTRICTED' ? license.id : null })
        await save(CollectionFile, { collectionId: library.id, assetFileId: file.id })
    }
    const group = { scope: 'current', matchField: null, hasPhoto: false, filters: [{ column: 'recordKey', op: 'contains', value: 'RELATED-' }], excludeFilters: [{ column: 'season', op: 'has_any', values: ['SS24'] }] }
    const rules = { enabled: true, groups: [group, { ...group, scope: 'all', hasPhoto: true }] }
    const membershipBefore = await db.query('SELECT * FROM collection_records WHERE collection_id = $1 ORDER BY record_id', [current.id])
    await admin.collection.setRecordRules({ id: current.id, relatedRecords: rules })
    assert.deepEqual(await db.query('SELECT * FROM collection_records WHERE collection_id = $1 ORDER BY record_id', [current.id]), membershipBefore)
    assert.equal((await db.query('SELECT id FROM pages WHERE collection_id = $1', [current.id])).length, 0, 'related settings do not create or edit a collection layout')
    const page = await caller(fixtures.member).catalogue.get({ id: ids.SOURCE, collectionId: current.id })
    assert.deepEqual(page.siblings.map(row => row.recordKey), ['RELATED-ELSEWHERE', 'RELATED-MATCH'])
    assert.equal(page.relatedTotal, 2)
    await notFound(caller(fixtures.member).catalogue.get({ id: ids.SOURCE, collectionId: hidden.id }))
    const owned = await makeCollection({ name: 'Reader related rules', public: false, ownerId: fixtures.member.id })
    await forbidden(caller(fixtures.member).collection.setRecordRules({ id: owned.id, relatedRecords: rules }))
    await admin.collection.setRecordRules({ id: current.id, relatedRecords: { enabled: true, groups: [{ ...group, matchField: 'season' }] } })
    assert.deepEqual((await caller(fixtures.member).catalogue.get({ id: ids.SOURCE, collectionId: current.id })).siblings.map(row => row.recordKey), ['RELATED-MATCH'])
    await admin.collection.setRecordRules({ id: current.id, relatedRecords: { enabled: true, groups: [{ ...group, matchField: 'cost' }] } })
    assert.equal((await caller(fixtures.member).catalogue.get({ id: ids.SOURCE, collectionId: current.id })).siblings.length, 0, 'a field kept private cannot determine related records')
    await admin.collection.setRecordRules({ id: current.id, relatedRecords: { ...rules, enabled: false } })
    assert.equal((await caller(fixtures.member).catalogue.get({ id: ids.SOURCE, collectionId: current.id })).siblings.length, 0)
})

test('related records inherit global settings, preserve current scope and paginate without the source', async () => {
    const collection = await makeCollection({ name: 'Related paging' })
    const ids = []
    for (let index = 0; index < 27; index++) {
        const key = `REL-PAGE-${String(index).padStart(2, '0')}`
        await admin.record.create({ recordKey: key, values: { season: 'Paging' } })
        ids.push(await productId(key))
    }
    await db.transaction(em => addRecords(em, collection.id, ids))
    const settings = { enabled: true, groups: [{ scope: 'current', matchField: 'season', hasPhoto: false, filters: [], excludeFilters: [] }] }
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', relatedRecords: settings })
    const reader = caller(fixtures.member)
    assert.equal((await reader.catalogue.get(ids[0])).relatedTotal, 0, 'current list does not silently expand to all lists')
    const first = await reader.catalogue.get({ id: ids[0], collectionId: collection.id })
    const next = await reader.catalogue.get({ id: ids[0], collectionId: collection.id, relatedOffset: 24 })
    assert.equal(first.siblings.length, 24)
    assert.equal(first.relatedTotal, 26)
    assert.equal(next.siblings.length, 2)
    assert.equal(new Set([...first.siblings, ...next.siblings].map(row => row.id)).size, 26)
    assert.equal(first.siblings.some(row => row.id === ids[0]), false)
    await admin.collection.setRecordRules({ id: collection.id, relatedRecords: { ...settings, enabled: false } })
    assert.equal((await reader.catalogue.get({ id: ids[0], collectionId: collection.id })).relatedTotal, 0)
    await admin.collection.setRecordRules({ id: collection.id, relatedRecords: null })
    assert.equal((await reader.catalogue.get({ id: ids[0], collectionId: collection.id })).relatedTotal, 26)
    await assert.rejects(admin.collection.setRecordRules({ id: collection.id, relatedRecords: { ...settings, groups: [{ ...settings.groups[0], filters: [{ column: 'season', op: 'has_any', values: [] }] }] } }), error => error.code === 'BAD_REQUEST')
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', relatedRecords: { enabled: true, groups: [{ scope: 'all', matchField: '$family', hasPhoto: false, filters: [], excludeFilters: [] }] } })
})

test('file facets use the current product for link-based associations and respect field visibility', async () => {
    await admin.recordAttribute.create({ name: 'product_type', displayName: 'Product Type', valueType: 'single_select', options: ['Bottle'], facetable: true, viewable: true, searchable: false })
    const id = await productId('CA-PUB')
    await admin.record.patch({ id, values: { product_type: 'Bottle' }, source: 'grid' })
    const folder = await makeFolder({ name: 'Linked product facet' })
    const file = await makeFile(folder, { name: 'linked.jpg', recordId: null })
    const collection = await makeCollection({ name: 'Linked facet files' })
    await save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })
    await db.query("INSERT INTO asset_entity_links (asset_file_id, target_kind, record_id, status, strategy) VALUES ($1, 'record', $2, 'active', 'manual_file')", [file.id, id])
    const page = await caller(fixtures.member).catalogue.get(id)
    const linked = page.collectionFiles.find(row => row.name === 'linked.jpg')
    assert.ok(linked)
    assert.equal(linked.record.id, id)
    assert.ok(linked.record.attributes.some(attribute => attribute.name === 'product_type' && attribute.value === 'Bottle' && attribute.facetable))
    assert.equal(linked.record.attributes.some(attribute => attribute.name === 'cost'), false)
})


test('related settings roll back and upgrade without changing records or membership', async () => {
    const before = await db.query('SELECT count(*)::int AS count FROM collection_records')
    while ((await db.query("SELECT 1 FROM migrations WHERE name = 'RelatedRecords1791936000000'")).length) await db.undoLastMigration()
    assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name IN ('collections', 'enrichment_settings') AND column_name = 'related_records'")).length, 0)
    await db.runMigrations()
    assert.deepEqual(await db.query('SELECT count(*)::int AS count FROM collection_records'), before)
    assert.equal((await db.query('SELECT related_records FROM enrichment_settings WHERE id = 1'))[0].related_records, null)
})


test('record details include each accessible asset type linked directly or through an attribute', async () => {
    const { AssetEntityLink } = require('../dist/entity/asset-entity-link')
    const record = await productId('CA-PUB')
    const folder = await makeFolder({ name: 'Record asset types' })
    const library = await makeCollection({ name: 'Related marketing assets' })
    const privateLibrary = await makeCollection({ name: 'Private marketing assets', public: false, ownerId: fixtures.admin.id })
    const type = await save(harness.entities.AssetType, { name: 'Marketing Assets', defaultDisplay: 'grid', listDisplayItems: [] })
    const direct = await makeFile(folder, { name: 'Direct campaign.mp4', mimeType: 'video/mp4', assetTypeId: type.id })
    const range = await makeFile(folder, { name: 'Autumn campaign.jpg', assetTypeId: type.id })
    const unrelated = await makeFile(folder, { name: 'Spring campaign.jpg', assetTypeId: type.id })
    const hidden = await makeFile(folder, { name: 'Private campaign.jpg', assetTypeId: type.id })
    const inactive = await makeFile(folder, { name: 'Inactive campaign.jpg', assetTypeId: type.id })
    for (const file of [direct, range, unrelated, inactive]) await save(CollectionFile, { collectionId: library.id, assetFileId: file.id })
    await save(CollectionFile, { collectionId: privateLibrary.id, assetFileId: hidden.id })
    await save(AssetEntityLink, { assetFileId: direct.id, targetKind: 'record', recordId: record, recordKey: 'CA-PUB', strategy: 'manual_file' })
    for (const [file, value, status] of [[direct, 'Autumn', 'active'], [range, 'Autumn', 'active'], [unrelated, 'Spring', 'active'], [hidden, 'Autumn', 'active'], [inactive, 'Autumn', 'dangling']]) {
        await save(AssetEntityLink, { assetFileId: file.id, targetKind: 'attribute', attributeName: 'season', attributeValue: value, strategy: 'manual_file', status })
    }
    const page = await caller(fixtures.member).catalogue.get(record)
    const names = page.collectionFiles.map(file => file.name)
    assert.equal(names.filter(name => name === direct.name).length, 1, 'direct and attribute links are deduplicated')
    assert.ok(names.includes(range.name))
    for (const file of [unrelated, hidden, inactive]) assert.ok(!names.includes(file.name), file.name)
    assert.equal(page.collectionFiles.find(file => file.name === range.name).assetType.name, 'Marketing Assets')
    assert.ok(page.files.some(file => file.id === range.id))
})
