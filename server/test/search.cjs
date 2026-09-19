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
const { CollectionFile, AssetType, Product, ProductAttribute } = harness.entities
const { caller } = harness
let fixtures, root, child, color, related, unrelated, colorAttr
const names = result => result.results.map(file => file.name).sort()
const searchAs = input => caller(fixtures.member).collection.search(input)
before(async () => {
    fixtures = await harness.setup()
    const rootFolder = await makeFolder({ name: 'Root' })
    const childFolder = await makeFolder({ name: 'Child', parent: rootFolder })
    root = await makeCollection({ name: 'Root', assetFolderId: rootFolder.id })
    child = await makeCollection({ name: 'Child', assetFolderId: childFolder.id, parent: root })
    related = await save(AssetType, { name: 'Packshot', isRelatedToProducts: true, defaultDisplay: 'grid', listDisplayItems: [] })
    unrelated = await save(AssetType, { name: 'Document', isRelatedToProducts: false, defaultDisplay: 'grid', listDisplayItems: [] })
    colorAttr = await save(ProductAttribute, { name: 'color', searchable: true, facetable: true, viewable: true })
    await save(ProductAttribute, { name: 'size', searchable: false, facetable: true, viewable: true })
    const product = await save(Product, { productKey: 'SKU-1', primaryKeyName: 'SKU', metaData: { color: 'red', size: 'M' } })
    const files = [
        [rootFolder, root, { name: 'shirt-red.png', mimeType: 'image/png' }],
        [rootFolder, root, { name: 'hat.mp4', mimeType: 'video/mp4', assetTypeId: related.id, productView: 'front' }],
        [rootFolder, root, { name: 'spec.pdf', mimeType: 'application/pdf', assetTypeId: unrelated.id, productView: 'front' }],
        [childFolder, child, { name: 'notes.txt', mimeType: 'text/plain', productId: product.id }],
    ]
    for (const [folder, collection, extra] of files) {
        const file = await makeFile(folder, extra)
        await save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })
    }
})
after(() => harness.teardown())

test('search treats imported attribute names as data', async () => {
    await save(ProductAttribute, { name: "name'] OR true --", searchable: true })
    for (const exactMatch of [true, false]) {
        const result = await searchAs({ query: 'does-not-exist-unique', exactMatch, page: 1 })
        assert.equal(result.total, 0)
    }
})

test('token mode matches any word in file names and searchable attributes; exact mode matches the phrase', async () => {
    assert.deepEqual(names(await searchAs({ query: 'red hat' })), ['hat.mp4', 'notes.txt', 'shirt-red.png'])
    assert.deepEqual(names(await searchAs({ query: 'red   hat', exactMatch: true })), [])
    assert.deepEqual(names(await searchAs({ query: 'shirt-red', exactMatch: true })), ['shirt-red.png'])
    assert.deepEqual(names(await searchAs({ query: 'M' })), ['hat.mp4'])
    assert.equal((await searchAs({})).total, 4)
})

test('attribute filters apply by attribute id and empty lists are ignored', async () => {
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['red'] } })), ['notes.txt'])
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['blue'] } })), [])
    assert.equal((await searchAs({ attributes: { [colorAttr.id]: [] } })).total, 4)
    assert.equal((await searchAs({ attributes: { [colorAttr.id]: null } })).total, 4)
})

test('search scope limits results to one collection or to its subtree', async () => {
    assert.deepEqual(names(await searchAs({ searchScope: 'current', collectionId: root.id })), ['hat.mp4', 'shirt-red.png', 'spec.pdf'])
    assert.deepEqual(names(await searchAs({ searchScope: 'current', collectionId: child.id })), ['notes.txt'])
    assert.equal((await searchAs({ searchScope: 'current_with_sub', collectionId: root.id })).total, 4)
    assert.equal((await searchAs({ searchScope: 'all', collectionId: child.id })).total, 4)
})

test('file type, asset type and product view filters narrow results and unknown file types are ignored', async () => {
    assert.deepEqual(names(await searchAs({ fileTypes: ['document'] })), ['spec.pdf'])
    assert.deepEqual(names(await searchAs({ fileTypes: ['video'] })), ['hat.mp4'])
    assert.deepEqual(names(await searchAs({ fileTypes: ['image'] })), ['shirt-red.png'])
    assert.deepEqual(names(await searchAs({ fileTypes: ['image', 'video'] })), ['hat.mp4', 'shirt-red.png'])
    assert.equal((await searchAs({ fileTypes: ['archive'] })).total, 4)
    assert.deepEqual(names(await searchAs({ assetTypes: [related.id] })), ['hat.mp4'])
    assert.deepEqual(names(await searchAs({ productViews: ['front'] })), ['hat.mp4'])
})

test('a first-page search is recorded once per minute with its total and scoped collection', async () => {
    const events = () => db.query(`SELECT collection_id, metadata FROM activity_events WHERE user_id = $1 AND type = 'search' ORDER BY created_at`, [fixtures.member.id])
    await db.query(`DELETE FROM activity_events WHERE user_id = $1`, [fixtures.member.id])
    await searchAs({ query: '  Shirt ' })
    await searchAs({ query: 'shirt' })
    await searchAs({ query: 'shirt', page: 2 })
    assert.deepEqual(await events(), [{ collection_id: null, metadata: { query: 'shirt', total: 1 } }])
    await searchAs({ query: 'hat', searchScope: 'current', collectionId: root.id })
    assert.deepEqual((await events()).at(-1), { collection_id: root.id, metadata: { query: 'hat', total: 1 } })
    await searchAs({ query: '   ' })
    assert.equal((await events()).length, 2)
})

test('pages hold 300 results and expose previous and next pointers', async () => {
    const folder = await makeFolder({ name: 'Bulk' })
    const bulk = await makeCollection({ name: 'Bulk', assetFolderId: folder.id })
    await db.query(`
        WITH files AS (
            INSERT INTO asset_files (name, status, external_id, external_checksum, size, mime_type, folder_id)
            SELECT 'bulk-' || n || '.png', 'up_to_date', gen_random_uuid()::text, 'c', '1', 'image/png', $1 FROM generate_series(1, 301) AS n
            RETURNING id
        )
        INSERT INTO collection_files (asset_file_id, collection_id) SELECT id, $2 FROM files
    `, [folder.id, bulk.id])
    const first = await searchAs({ query: 'bulk-' })
    assert.equal(first.total, 301)
    assert.equal(first.totalPages, 2)
    assert.equal(first.results.length, 300)
    assert.equal(first.previousPage, null)
    assert.equal(first.nextPage, 2)
    const second = await searchAs({ query: 'bulk-', page: 2 })
    assert.equal(second.results.length, 1)
    assert.equal(second.previousPage, 1)
    assert.equal(second.nextPage, null)
})

test('searchNotFound returns only the terms without a visible match in the requested scope', async () => {
    const notFound = input => caller(fixtures.member).collection.searchNotFound(input)
    assert.deepEqual(await notFound({ query: ['shirt', 'zzz', 'NOTES'] }), ['zzz'])
    assert.deepEqual((await notFound({ query: ['shirt', 'notes'], searchScope: 'current', collectionId: child.id })), ['shirt'])
    assert.deepEqual(await notFound({ query: ['shirt'], assetTypes: [related.id] }), ['shirt'])
    assert.deepEqual(await notFound({ query: [] }), [])
})
