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
// Products sharing the value of the family field are one model, whatever the
// spacing, case or accents. See docs/administration/catalogue.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, env, caller, makeCollection } = harness
let fixtures, admin

const productId = async recordKey => (await db.query('SELECT id FROM records WHERE record_key = $1', [recordKey]))[0].id
const familyOf = async recordKey => (await db.query('SELECT family_key, family_label FROM records WHERE record_key = $1', [recordKey]))[0]

before(async () => {
    fixtures = await harness.setup()
    admin = caller(fixtures.admin)
    env.assetsS3 = () => ({ presignedGetObject: async (_bucket, key) => `https://example.test/${key}` })
    await admin.recordAttribute.create({ name: 'style', displayName: 'Style', valueType: 'text', facetable: false, viewable: true, searchable: false })
    await admin.recordAttribute.create({ name: 'colour', displayName: 'Colour', valueType: 'text', facetable: true, viewable: true, searchable: false })
    for (const [key, style, colour] of [
        ['FM-BLK', 'Pampa', 'Black'],
        ['FM-BEI', ' pampa ', 'Beige'],
        ['FM-WHT', 'PAMPÁ', 'White'],
        ['FM-OTHER', 'Sierra', 'Black'],
    ]) {
        await admin.record.create({ recordKey: key, values: { style, colour } })
    }
    const everything = await makeCollection({ name: 'Everything' })
    await admin.collection.setRecordRules({ id: everything.id, includesAllRecords: true, catalogueMode: 'products' })
})
after(() => harness.teardown())

// The same list lives in client/test/unit/utils/familyKey.test.ts, so the
// preview in the browser and the grouping in the database never disagree.
test('the grouping key ignores case, accents and stray spaces, in the database as in the browser', async () => {
    const cases = [
        ['Pampa', 'pampa'],
        [' pampa ', 'pampa'],
        ['PAMPÁ', 'pampa'],
        ['Crème  Brûlée', 'creme brulee'],
        ['ÀÉÎÕÜ', 'aeiou'],
        ['', null],
        ['   ', null],
    ]
    for (const [input, expected] of cases) {
        const [{ key }] = await db.query('SELECT damvia_family_key($1) AS key', [input])
        assert.equal(key, expected, `damvia_family_key(${JSON.stringify(input)})`)
    }
})

test('no family field means no family at all', async () => {
    assert.deepEqual(await familyOf('FM-BLK'), { family_key: null, family_label: null })
})

test('naming the field groups the products under one normalised key', async () => {
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', familyAttributeName: 'style' })
    const black = await familyOf('FM-BLK')
    assert.equal(black.family_key, 'pampa', 'case, accents and stray spaces are ignored')
    assert.equal((await familyOf('FM-BEI')).family_key, 'pampa')
    assert.equal((await familyOf('FM-WHT')).family_key, 'pampa')
    assert.equal((await familyOf('FM-OTHER')).family_key, 'sierra')
    // The label keeps a value as it was typed rather than the normalised key.
    assert.ok(['Pampa', 'pampa', 'PAMPÁ'].includes(black.family_label))
})

test('a reader keeps one model and sees the other keys of it', async () => {
    const model = await caller(fixtures.member).catalogue.list({ offset: 0, limit: 10, familyKey: 'pampa' })
    assert.deepEqual(model.products.map(product => product.recordKey).sort(), ['FM-BEI', 'FM-BLK', 'FM-WHT'])

    const page = await caller(fixtures.member).catalogue.get(await productId('FM-BLK'))
    assert.deepEqual(page.siblings.map(sibling => sibling.recordKey).sort(), ['FM-BEI', 'FM-WHT'])
    assert.equal(page.family.key, 'pampa')
})

test('changing the value of a product moves it to another family', async () => {
    await admin.record.patch({ id: await productId('FM-WHT'), values: { style: 'Sierra' }, source: 'grid' })
    assert.equal((await familyOf('FM-WHT')).family_key, 'sierra')
    const moved = await caller(fixtures.member).catalogue.list({ offset: 0, limit: 10, familyKey: 'sierra' })
    assert.deepEqual(moved.products.map(product => product.recordKey).sort(), ['FM-OTHER', 'FM-WHT'])
})

test('editing another field does not regroup the whole catalogue', async () => {
    const { rerunFamilyStage } = harness.services.enrichment
    // A cell edit passes the fields it changed; the pass then has nothing to do
    // unless the model field is among them.
    assert.deepEqual(await rerunFamilyStage(['colour']), { families: 0, records: 0 })
    const regrouped = await rerunFamilyStage(['style'])
    assert.ok(regrouped.families > 0)
})

test('clearing the family field drops the grouping', async () => {
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', familyAttributeName: null })
    assert.deepEqual(await familyOf('FM-BLK'), { family_key: null, family_label: null })
    assert.equal((await caller(fixtures.member).catalogue.get(await productId('FM-BLK'))).family, null)
})
