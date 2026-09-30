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
// Matching runs on every asset type that has steps. Only a type marked
// related to records holds the records' pictures: its files carry views, show
// as visuals and open with the record. A campaign shot linked to the same
// record takes its data and nothing else. See docs/administration/asset-types.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, env, save, caller, makeCollection, makeFile, makeType, typedFolder, makeRecord, fileRow } = harness
const { CollectionFile, RecordAttribute } = harness.entities
const { AssetTypeResolverStep } = require('../dist/entity/asset-type-resolver-step')
const { AssetFileResolution } = require('../dist/entity/asset-file-resolution')
const { EnrichmentSettings } = require('../dist/entity/enrichment-settings')
const { runEnrichmentPass } = harness.services.enrichment
const { addRecords } = harness.services.productCollections
let fixtures, record, packshot, campaign, viewLike, document, hidden, library

before(async () => {
    fixtures = await harness.setup()
    env.assetsS3 = () => ({ presignedGetObject: async (_bucket, key) => `https://example.test/${key}` })
    await db.getRepository(EnrichmentSettings).update(1, { viewsEnabled: true, thumbnailView: '00' })
    await save(RecordAttribute, { name: 'season', displayName: 'Season', viewable: true })
    record = await makeRecord('MK-1', { season: 'SS25' })
    const catalogue = await makeCollection({ name: 'Catalogue', catalogueMode: 'products' })
    await addRecords(db.manager, catalogue.id, [record.id])

    const step = { pattern: '^(MK-\\d+)', keyGroup: 1 }
    const pictures = await makeType('Packshots', { isRelatedToRecords: true })
    const marketing = await makeType('Marketing', { isRelatedToRecords: false })
    const documents = await makeType('Documents', { isRelatedToRecords: false })
    for (const type of [pictures, marketing]) await save(AssetTypeResolverStep, { assetTypeId: type.id, position: 0, strategy: 'filename_regex', config: step })
    const packshots = await typedFolder('Packshots', pictures)
    const campaigns = await typedFolder('Campaign', marketing)
    const docs = await typedFolder('Documents', documents)
    packshot = await makeFile(packshots, { name: 'MK-1.00.jpg', hasThumbnail: true, mimeType: 'image/jpeg', assetTypeId: pictures.id })
    campaign = await makeFile(campaigns, { name: 'MK-1_SS25_BS_02.jpg', hasThumbnail: true, mimeType: 'image/jpeg', assetTypeId: marketing.id })
    viewLike = await makeFile(campaigns, { name: 'MK-1.03.jpg', hasThumbnail: true, mimeType: 'image/jpeg', assetTypeId: marketing.id })
    document = await makeFile(docs, { name: 'MK-1 sheet.pdf', mimeType: 'application/pdf', assetTypeId: documents.id })
    hidden = await makeFile(campaigns, { name: 'MK-1_private.jpg', hasThumbnail: true, mimeType: 'image/jpeg', assetTypeId: marketing.id })
    await runEnrichmentPass()

    const open = await makeCollection({ name: 'Library' })
    library = {}
    for (const [key, file] of Object.entries({ packshot, campaign, viewLike, document })) {
        library[key] = await save(CollectionFile, { collectionId: open.id, assetFileId: file.id })
    }
    const draft = await makeCollection({ name: 'Private shots', draft: true })
    await save(CollectionFile, { collectionId: draft.id, assetFileId: hidden.id })
})
after(() => harness.teardown())

test('a type with steps is matched without being related, and only pictures keep a view', async () => {
    assert.deepEqual([(await fileRow(packshot.id)).recordId, (await fileRow(packshot.id)).recordView], [record.id, '00'])
    assert.deepEqual([(await fileRow(campaign.id)).recordId, (await fileRow(campaign.id)).recordView], [record.id, null])
    assert.deepEqual([(await fileRow(viewLike.id)).recordId, (await fileRow(viewLike.id)).recordView], [record.id, null], 'a view in the name of a campaign shot is not a view')
    assert.equal((await fileRow(document.id)).recordId, null, 'a type without steps and not related stays unmatched')
    assert.equal((await db.getRepository(AssetFileResolution).findOneBy({ assetFileId: document.id })).status, 'not_applicable')
})

test('the product shows only its pictures as visuals, and counts the other files', async () => {
    const [card] = (await caller(fixtures.member).catalogue.list({ offset: 0, limit: 10 })).products
    assert.deepEqual(card.visuals.map(visual => visual.id), [packshot.id])
    assert.equal(card.visualCount, 1)
    assert.equal(card.fileCount, 3, 'the packshot and the two campaign shots the reader may open')
    assert.ok(card.thumbnailURL.includes(packshot.id))
    const page = await caller(fixtures.member).catalogue.get(record.id)
    assert.deepEqual(page.visuals.map(visual => visual.id), [packshot.id])
    assert.deepEqual(page.files.map(file => file.name).sort(), ['MK-1.00.jpg', 'MK-1.03.jpg', 'MK-1_SS25_BS_02.jpg'])
})

test('a visible product opens its pictures, never a campaign shot kept in a private collection', async () => {
    const page = await caller(fixtures.member).catalogue.get(record.id)
    assert.equal(page.files.some(file => file.name === 'MK-1_private.jpg'), false)
    const selection = await caller(fixtures.member).collection.getFiles({ items: [{ type: 'record', id: record.id }] })
    assert.deepEqual(selection.files.map(file => file.name), ['MK-1.00.jpg'], 'a product download brings its pictures')
})

test('the download dialog of a campaign shot shows its product', async () => {
    const result = await caller(fixtures.member).catalogue.fileRecords(library.campaign.id)
    assert.deepEqual(result.records.map(row => [row.recordKey, row.inCatalogue, row.metaData.season]), [['MK-1', true, 'SS25']])
    assert.deepEqual(result.records[0].visuals.map(visual => visual.id), [packshot.id], 'its picture is the packshot, not the shot itself')
    assert.deepEqual((await caller(fixtures.member).catalogue.fileRecords(library.document.id)).records, [])
})
