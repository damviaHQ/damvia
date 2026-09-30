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
// The download dialog shows every record a file is linked to, whatever its
// asset type, with the fields a reader may read and, for a record held by a
// catalogue the reader can open, its visuals. See docs/administration/downloads.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, env, save, caller, makeCollection, makeFolder, makeFile, productId } = harness
const { CollectionFile } = harness.entities
const { addRecords } = harness.services.productCollections
const { AssetEntityLink } = require('../dist/entity/asset-entity-link')
let fixtures, admin, library, photo, sheet, hidden

const link = (file, recordKey, extra = {}) => productId(recordKey).then(recordId =>
    save(AssetEntityLink, { assetFileId: file.assetFileId, targetKind: 'record', recordId, recordKey, strategy: 'manual_file', ...extra }))

before(async () => {
    fixtures = await harness.setup()
    admin = caller(fixtures.admin)
    env.assetsS3 = () => ({ presignedGetObject: async (_bucket, key) => `https://example.test/${key}` })
    await admin.recordAttribute.create({ name: 'season', displayName: 'Season', valueType: 'text', facetable: false, viewable: true, searchable: false })
    await admin.recordAttribute.create({ name: 'cost', displayName: 'Cost', valueType: 'text', facetable: false, viewable: false, searchable: false })
    for (const key of ['FR-PHOTO', 'FR-SHEET-A', 'FR-SHEET-B', 'FR-GONE']) {
        await admin.record.create({ recordKey: key, values: { season: 'Autumn', cost: '12.00' } })
    }
    const shared = await makeCollection({ name: 'Autumn products' })
    await db.transaction(async em => addRecords(em, shared.id, [await productId('FR-PHOTO'), await productId('FR-SHEET-A')]))

    const folder = await makeFolder({ name: 'Autumn' })
    library = await makeCollection({ name: 'Autumn files' })
    const packshot = await harness.makeType('Packshot', { isRelatedToRecords: true })
    const photoFile = await makeFile(folder, { name: 'FR-PHOTO.00.jpg', hasThumbnail: true, recordId: await productId('FR-PHOTO'), recordView: '00', assetTypeId: packshot.id })
    const sheetFile = await makeFile(folder, { name: 'Autumn range.pdf', mimeType: 'application/pdf' })
    photo = await save(CollectionFile, { collectionId: library.id, assetFileId: photoFile.id })
    sheet = await save(CollectionFile, { collectionId: library.id, assetFileId: sheetFile.id })
    const draft = await makeCollection({ name: 'Draft files', draft: true })
    hidden = await save(CollectionFile, { collectionId: draft.id, assetFileId: sheetFile.id })
})
after(() => harness.teardown())

test('a photo shows the record kept on it, with its visuals and readable fields', async () => {
    const result = await caller(fixtures.member).catalogue.fileRecords(photo.id)
    assert.deepEqual(result.records.map(record => record.recordKey), ['FR-PHOTO'])
    const [record] = result.records
    assert.equal(record.inCatalogue, true)
    assert.equal(record.metaData.season, 'Autumn')
    assert.equal(record.metaData.cost, undefined, 'a hidden field never leaves the server')
    assert.deepEqual(result.fields.map(field => field.name), ['season'])
    assert.deepEqual(record.visuals.map(visual => visual.view), ['00'])
})

test('any asset type lists each active record link, visuals only from a catalogue', async () => {
    await link(sheet, 'FR-SHEET-A')
    await link(sheet, 'FR-SHEET-B', { isPrimary: true })
    await link(sheet, 'FR-GONE', { status: 'dangling' })
    await save(AssetEntityLink, { assetFileId: sheet.assetFileId, targetKind: 'attribute', attributeName: 'season', attributeValue: 'Autumn', strategy: 'manual_file' })

    const result = await caller(fixtures.member).catalogue.fileRecords(sheet.id)
    assert.deepEqual(result.records.map(record => record.recordKey), ['FR-SHEET-B', 'FR-SHEET-A'], 'primary first, no dangling link, no range')
    const byKey = Object.fromEntries(result.records.map(record => [record.recordKey, record]))
    assert.equal(byKey['FR-SHEET-A'].inCatalogue, true)
    assert.equal(byKey['FR-SHEET-B'].inCatalogue, false)
    assert.deepEqual(byKey['FR-SHEET-B'].visuals, [])
    assert.equal(byKey['FR-SHEET-B'].metaData.season, 'Autumn')
})

test('a file the reader cannot open reveals none of its records', async () => {
    await assert.rejects(caller(fixtures.member).catalogue.fileRecords(hidden.id), error => error.code === 'NOT_FOUND')
    assert.equal((await admin.catalogue.fileRecords(hidden.id)).records.length, 2)
})

test('a file covering a range lists the products of the range the reader can see, never a range on a hidden field', async () => {
    const lookbook = await makeFile(await makeFolder({ name: 'Lookbooks' }), { name: 'Autumn lookbook.pdf', mimeType: 'application/pdf' })
    const entry = await save(CollectionFile, { collectionId: library.id, assetFileId: lookbook.id })
    for (const [attributeName, attributeValue] of [['season', 'Autumn'], ['cost', '12.00']]) {
        await save(AssetEntityLink, { assetFileId: lookbook.id, targetKind: 'attribute', attributeName, attributeValue, strategy: 'manual_file' })
    }
    const result = await caller(fixtures.member).catalogue.fileRecords(entry.id)
    assert.deepEqual(result.records, [])
    assert.deepEqual(result.ranges.map(range => [range.label, range.value, range.total]), [['Season', 'Autumn', 2]], 'the cost range is left out')
    const [range] = result.ranges
    assert.deepEqual(range.records.map(record => record.recordKey), ['FR-PHOTO', 'FR-SHEET-A'], 'only the products a catalogue shows the reader')
    assert.ok(range.records[0].thumbnailURL.includes(photo.assetFileId))
    assert.equal(range.records[0].metaData.cost, undefined)
})
