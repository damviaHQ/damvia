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
const { CollectionFile, AssetType, DataRecord, RecordAttribute } = harness.entities
const { caller } = harness
let fixtures, root, child, color, related, unrelated, colorAttr, sizeAttr
const names = result => result.results.map(file => file.name).sort()
const searchAs = input => caller(fixtures.member).collection.search(input)
before(async () => {
    fixtures = await harness.setup()
    const rootFolder = await makeFolder({ name: 'Root' })
    const childFolder = await makeFolder({ name: 'Child', parent: rootFolder })
    root = await makeCollection({ name: 'Root', assetFolderId: rootFolder.id })
    child = await makeCollection({ name: 'Child', assetFolderId: childFolder.id, parent: root })
    related = await save(AssetType, { name: 'Packshot', isRelatedToRecords: true, defaultDisplay: 'grid', listDisplayItems: [] })
    unrelated = await save(AssetType, { name: 'Document', isRelatedToRecords: false, defaultDisplay: 'grid', listDisplayItems: [] })
    colorAttr = await save(RecordAttribute, { name: 'color', searchable: true, facetable: true, viewable: true })
    sizeAttr = await save(RecordAttribute, { name: 'size', searchable: false, facetable: true, viewable: true })
    const record = await save(DataRecord, { recordKey: 'SKU-1', keyColumnName: 'SKU', metaData: { color: 'red', size: 'M' } })
    const blue = await save(DataRecord, { recordKey: 'SKU-2', keyColumnName: 'SKU', metaData: { color: 'navy', size: 'M' } })
    const files = [
        [rootFolder, root, { name: 'shirt-red.png', mimeType: 'image/png', size: String(5 * 1024 * 1024) }],
        [rootFolder, root, { name: 'hat.mp4', mimeType: 'video/mp4', assetTypeId: related.id, recordView: 'front', size: String(250 * 1024 * 1024) }],
        [rootFolder, root, { name: 'spec.pdf', mimeType: 'application/pdf', assetTypeId: unrelated.id, recordView: 'front', size: String(40 * 1024 * 1024) }],
        [childFolder, child, { name: 'notes.txt', mimeType: 'text/plain', recordId: record.id }],
        [childFolder, child, { name: 'blue-cap.png', mimeType: 'image/png', recordId: blue.id, assetTypeId: related.id }],
    ]
    for (const [folder, collection, extra] of files) {
        const file = await makeFile(folder, extra)
        await save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })
    }
})
after(() => harness.teardown())

test('search treats imported attribute names as data', async () => {
    await save(RecordAttribute, { name: "name'] OR true --", searchable: true })
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
    assert.deepEqual(names(await searchAs({ query: 'navy' })), ['blue-cap.png'])
    assert.equal((await searchAs({})).total, 5)
})

test('attribute filters apply by attribute id and empty lists are ignored', async () => {
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['red'] } })), ['notes.txt'])
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['navy'] } })), ['blue-cap.png'])
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['blue'] } })), [])
    assert.equal((await searchAs({ attributes: { [colorAttr.id]: [] } })).total, 5)
    assert.equal((await searchAs({ attributes: { [colorAttr.id]: null } })).total, 5)
    assert.equal((await searchAs({ attributes: { 'not-a-uuid': ['red'] } })).total, 5)
})

test('values of one attribute are alternatives while different attributes narrow each other', async () => {
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['red', 'navy'] } })), ['blue-cap.png', 'notes.txt'])
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['red'], [sizeAttr.id]: ['M'] } })), ['notes.txt'])
    assert.deepEqual(names(await searchAs({ attributes: { [colorAttr.id]: ['red'], [sizeAttr.id]: ['L'] } })), [])
})

test('files can be narrowed to one extension and extensions are counted', async () => {
    assert.deepEqual(names(await searchAs({ extensions: ['png'] })), ['blue-cap.png', 'shirt-red.png'])
    assert.deepEqual(names(await searchAs({ extensions: ['.PNG', 'mp4'] })), ['blue-cap.png', 'hat.mp4', 'shirt-red.png'])
    assert.deepEqual(names(await searchAs({ extensions: ['pdf'], fileTypes: ['image'] })), [])
    assert.equal((await searchAs({ extensions: [] })).total, 5)
    assert.deepEqual((await searchAs({})).facets.extensions, { png: 2, mp4: 1, pdf: 1, txt: 1 })
    assert.deepEqual((await searchAs({ extensions: ['png'] })).facets.extensions, { png: 2, mp4: 1, pdf: 1, txt: 1 })
    assert.deepEqual((await searchAs({ extensions: ['png'] })).facets.fileTypes, { image: 2 })
    assert.deepEqual(await caller(fixtures.member).collection.searchNotFound({ query: ['hat'], extensions: ['png'] }), ['hat'])
})

test('files can be narrowed to a size range in bytes', async () => {
    const MB = 1024 * 1024
    assert.deepEqual(names(await searchAs({ maxSize: MB })), ['blue-cap.png', 'notes.txt'])
    assert.deepEqual(names(await searchAs({ minSize: 100 * MB })), ['hat.mp4'])
    assert.deepEqual(names(await searchAs({ minSize: 4 * MB, maxSize: 50 * MB })), ['shirt-red.png', 'spec.pdf'])
    assert.deepEqual(names(await searchAs({ minSize: 5 * MB, maxSize: 5 * MB })), ['shirt-red.png'])
    assert.deepEqual(names(await searchAs({ minSize: 500 * MB })), [])
    assert.equal((await searchAs({ minSize: 0 })).total, 5)
    assert.deepEqual((await searchAs({ minSize: 100 * MB })).facets.fileTypes, { video: 1 })
    assert.deepEqual(await caller(fixtures.member).collection.searchNotFound({ query: ['hat'], maxSize: MB }), ['hat'])
})

test('facet counts cover the whole result set and leave out their own filter', async () => {
    const all = (await searchAs({})).facets
    assert.deepEqual(all.fileTypes, { image: 2, video: 1, document: 1, other: 1 })
    assert.deepEqual(all.assetTypes, { [related.id]: 2, [unrelated.id]: 1 })
    assert.deepEqual(all.recordViews, { front: 1 })
    assert.equal(all.recordViews.front, (await searchAs({ recordViews: ['front'] })).total)
    assert.deepEqual(all.attributes[colorAttr.id], { red: 1, navy: 1 })
    assert.deepEqual(all.attributes[sizeAttr.id], { M: 2 })
    const filtered = (await searchAs({ fileTypes: ['video'], attributes: { [colorAttr.id]: ['navy'] } })).facets
    assert.deepEqual(filtered.fileTypes, { image: 1 })
    assert.deepEqual(filtered.attributes[colorAttr.id], {})
    assert.deepEqual(filtered.assetTypes, {})
    const scoped = (await searchAs({ searchScope: 'current', collectionId: child.id })).facets
    assert.deepEqual(scoped.attributes[colorAttr.id], { red: 1, navy: 1 })
    assert.deepEqual(scoped.fileTypes, { image: 1, other: 1 })
    const guest = (await caller(fixtures.guest).collection.search({})).facets
    assert.deepEqual(guest.fileTypes, {})
})

test('results are sorted by relevance, name or date with a stable order', async () => {
    const ordered = result => result.results.map(file => file.name)
    assert.deepEqual(ordered(await searchAs({ query: 'red cap' })).slice(0, 1), ['blue-cap.png'])
    assert.deepEqual(ordered(await searchAs({ query: 'shirt red' })), ['shirt-red.png', 'notes.txt'])
    assert.deepEqual(ordered(await searchAs({ query: 'shirt red', sort: 'name' })), ['notes.txt', 'shirt-red.png'])
    assert.deepEqual(ordered(await searchAs({})), ['blue-cap.png', 'hat.mp4', 'notes.txt', 'shirt-red.png', 'spec.pdf'])
    await db.query(`UPDATE asset_files SET updated_at = now() + interval '1 day' WHERE name = 'spec.pdf'`)
    assert.deepEqual(ordered(await searchAs({ sort: 'newest' })).slice(0, 1), ['spec.pdf'])
})

test('search scope limits results to one collection or to its subtree', async () => {
    assert.deepEqual(names(await searchAs({ searchScope: 'current', collectionId: root.id })), ['hat.mp4', 'shirt-red.png', 'spec.pdf'])
    assert.deepEqual(names(await searchAs({ searchScope: 'current', collectionId: child.id })), ['blue-cap.png', 'notes.txt'])
    assert.equal((await searchAs({ searchScope: 'current_with_sub', collectionId: root.id })).total, 5)
    assert.equal((await searchAs({ searchScope: 'all', collectionId: child.id })).total, 5)
})

test('file type, asset type and record view filters narrow results and unknown file types are ignored', async () => {
    assert.deepEqual(names(await searchAs({ fileTypes: ['document'] })), ['spec.pdf'])
    assert.deepEqual(names(await searchAs({ fileTypes: ['video'] })), ['hat.mp4'])
    assert.deepEqual(names(await searchAs({ fileTypes: ['image'] })), ['blue-cap.png', 'shirt-red.png'])
    assert.deepEqual(names(await searchAs({ fileTypes: ['image', 'video'] })), ['blue-cap.png', 'hat.mp4', 'shirt-red.png'])
    assert.equal((await searchAs({ fileTypes: ['archive'] })).total, 5)
    assert.equal((await searchAs({ fileTypes: ['constructor', '__proto__'] })).total, 5)
    assert.deepEqual(names(await searchAs({ assetTypes: [related.id] })), ['blue-cap.png', 'hat.mp4'])
    assert.deepEqual(names(await searchAs({ recordViews: ['front'] })), ['hat.mp4'])
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
    assert.deepEqual(await notFound({ query: ['navy', 'zzz'] }), ['zzz'])
    assert.deepEqual(await notFound({ query: ['navy'], fileTypes: ['video'] }), ['navy'])
    assert.deepEqual(await notFound({ query: ['hat'], fileTypes: ['toString'] }), [])
    assert.deepEqual(await notFound({ query: [] }), [])
})

test('malformed search input is rejected before it reaches the database', async () => {
    const notFound = input => caller(fixtures.member).collection.searchNotFound(input)
    const rejected = [
        { assetTypes: ['x'] },
        { searchScope: 'current', collectionId: 'x' },
        { searchScope: 'current_with_sub', collectionId: '%' },
        { searchScope: 'everything' },
        { page: 0 },
        { page: 1.5 },
        { query: 'a'.repeat(2001) },
    ]
    for (const input of rejected) {
        await assert.rejects(searchAs(input), { code: 'BAD_REQUEST' }, JSON.stringify(input).slice(0, 80))
    }
    for (const input of [{ query: ['x'], assetTypes: ['x'] }, { query: Array(301).fill('a') }, { query: ['a'.repeat(201)] }, { query: ['x'], searchScope: 'current', collectionId: '%' }]) {
        await assert.rejects(notFound(input), { code: 'BAD_REQUEST' }, JSON.stringify(input).slice(0, 80))
    }
    assert.equal((await searchAs({ query: 'zz '.repeat(600), page: 1 })).total, 0)
    assert.deepEqual(await notFound({ query: Array(300).fill('zzz') }), Array(300).fill('zzz'))
})
