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
// An administrator says what a product must carry; the catalogue then shows
// how far each one is. See docs/administration/catalogue.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, env, save, caller, makeCollection, makeFolder, makeFile, forbidden } = harness
const { addRecords } = harness.services.productCollections
let fixtures, admin, everything

const productId = async recordKey => (await db.query('SELECT id FROM records WHERE record_key = $1', [recordKey]))[0].id
const scoreOf = async recordKey => (await db.query('SELECT readiness_filled, readiness_total, readiness_ready FROM records WHERE record_key = $1', [recordKey]))[0]
const fieldId = async name => (await admin.recordAttribute.list()).find(field => field.name === name).id
const cardOf = async recordKey => (await caller(fixtures.member).catalogue.list({ offset: 0, limit: 50 }))
    .products.find(product => product.recordKey === recordKey)

before(async () => {
    fixtures = await harness.setup()
    admin = caller(fixtures.admin)
    env.assetsS3 = () => ({ presignedGetObject: async (_bucket, key) => `https://example.test/${key}` })
    for (const name of ['name', 'ingredients']) {
        await admin.recordAttribute.create({ name, displayName: name, valueType: 'text', facetable: false, viewable: true, searchable: false })
    }
    await admin.record.create({ recordKey: 'RD-FULL', values: { name: 'Lemon', ingredients: 'Water' } })
    await admin.record.create({ recordKey: 'RD-EMPTY', values: { name: 'Ginger' } })
    everything = await makeCollection({ name: 'Everything' })
    await admin.collection.setRecordRules({ id: everything.id, includesAllRecords: true, catalogueMode: 'products' })
})
after(() => harness.teardown())

test('without a definition every product reads as ready', async () => {
    assert.deepEqual(await scoreOf('RD-EMPTY'), { readiness_filled: 0, readiness_total: 0, readiness_ready: true })
    const card = await cardOf('RD-EMPTY')
    assert.deepEqual(card.readiness, { filled: 0, total: 0, ready: true })
})

test('required fields and views are counted, and the score follows what changes', async () => {
    await admin.settings.saveReadiness({
        requiredAttributeIds: [await fieldId('name'), await fieldId('ingredients')],
        requiredViews: ['00'],
        readyLabel: 'Prêt à utiliser',
        incompleteLabel: 'À compléter',
    })
    assert.deepEqual(await scoreOf('RD-FULL'), { readiness_filled: 2, readiness_total: 3, readiness_ready: false })
    assert.deepEqual(await scoreOf('RD-EMPTY'), { readiness_filled: 1, readiness_total: 3, readiness_ready: false })

    // A packshot in the required view completes the product.
    const folder = await makeFolder({ name: 'Packshots' })
    const packshot = await makeFile(folder, { name: 'RD-FULL-00.jpg', hasThumbnail: true, recordId: await productId('RD-FULL'), recordView: '00' })
    // The file reaches readers through a collection, as every file does.
    const library = await makeCollection({ name: 'Library files' })
    await save(harness.entities.CollectionFile, { collectionId: library.id, assetFileId: packshot.id })
    await harness.services.enrichment.rerunReadinessStage()
    assert.deepEqual(await scoreOf('RD-FULL'), { readiness_filled: 3, readiness_total: 3, readiness_ready: true })

    // Filling a field is scored as soon as it is saved.
    await admin.record.patch({ id: await productId('RD-EMPTY'), values: { ingredients: 'Water, ginger' }, source: 'grid' })
    assert.deepEqual(await scoreOf('RD-EMPTY'), { readiness_filled: 2, readiness_total: 3, readiness_ready: false })
})

test('the score and its labels reach the product page, and a listing can keep only what is ready', async () => {
    const page = await caller(fixtures.member).catalogue.get(await productId('RD-FULL'))
    assert.deepEqual(page.readinessLabels, { ready: 'Prêt à utiliser', incomplete: 'À compléter', defined: true })
    assert.equal(page.readiness.ready, true)
    const ready = await caller(fixtures.member).catalogue.list({ offset: 0, limit: 50, readiness: 'ready' })
    assert.deepEqual(ready.products.map(product => product.recordKey), ['RD-FULL'])
    const incomplete = await caller(fixtures.member).catalogue.list({ offset: 0, limit: 50, readiness: 'incomplete' })
    assert.deepEqual(incomplete.products.map(product => product.recordKey), ['RD-EMPTY'])
})

test('products with no media the reader can open are hidden when an administrator asks for it', async () => {
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', hideRecordsWithoutMedia: true })
    const keys = (await caller(fixtures.member).catalogue.list({ offset: 0, limit: 50 })).products.map(product => product.recordKey)
    assert.deepEqual(keys, ['RD-FULL'], 'only the product carrying a visible file is listed')
    // A deep link still opens the product: a hidden listing is not a refusal.
    assert.equal((await caller(fixtures.member).catalogue.get(await productId('RD-EMPTY'))).recordKey, 'RD-EMPTY')
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', hideRecordsWithoutMedia: false })
})

test('the definition is an administrator matter', async () => {
    for (const user of [null, fixtures.member, fixtures.manager]) {
        await forbidden(caller(user).settings.getReadiness())
        await forbidden(caller(user).settings.saveReadiness({ requiredAttributeIds: [], requiredViews: [], readyLabel: 'a', incompleteLabel: 'b' }))
    }
})
