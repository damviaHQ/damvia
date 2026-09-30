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
// Empty fields are offered the value records with a look-alike key agree on.
// See docs/administration/records.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, caller, forbidden } = harness
const { RecordChange } = harness.entities
let fixtures, admin
const ids = {}

const suggested = async (...keys) => {
    const rows = await admin.record.suggestions({ ids: keys.map(key => ids[key]) })
    const byKey = Object.fromEntries(Object.entries(ids).map(([key, id]) => [id, key]))
    return rows.map(row => `${byKey[row.recordId]} ${row.field}=${row.value}`).sort()
}

before(async () => {
    fixtures = await harness.setup()
    admin = caller(fixtures.admin)
    for (const name of ['colour', 'material', 'season', 'style']) {
        await admin.recordAttribute.create({ name, displayName: name, valueType: 'text', facetable: false, viewable: true, searchable: false })
    }
    await admin.recordAttribute.create({ name: 'fit', displayName: 'Fit', valueType: 'single_select', options: ['Slim', 'Wide'], facetable: false, viewable: true, searchable: false })
    for (const [key, values] of [
        ['18875-554-M', { colour: 'Red', material: 'Leather', season: 'FW25' }],
        ['18875-554-L', {}],
        ['18875-002-M', {}],
        ['18875-887-M', { colour: 'Blue', material: 'Leather' }],
        ['SS24-18875', {}],
        ['SS24-9', { material: 'Wool' }],
        ['SS24-10', { material: 'Cotton' }],
        ['ABC123', {}],
        ['ABC124', { material: 'Wool' }],
        ['PAMPA1', { style: 'Pampa', colour: 'Black', material: 'Suede' }],
        ['PAMPA2', { style: 'Pampa' }],
    ]) {
        ids[key] = (await admin.record.create({ recordKey: key, values })).id
    }
})
after(() => harness.teardown())

test('a key of the same shape sharing more parts is closer, and decides on its own', async () => {
    assert.deepEqual(await suggested('18875-554-L'), [
        '18875-554-L colour=Red',
        '18875-554-L material=Leather',
        '18875-554-L season=FW25',
    ])
})

test('a field the closest siblings disagree on is left alone', async () => {
    assert.deepEqual(await suggested('18875-002-M'), [
        '18875-002-M material=Leather',
        '18875-002-M season=FW25',
    ])
})

test('keys of another shape, or without parts, have no siblings', async () => {
    assert.deepEqual(await suggested('SS24-18875', 'ABC123'), [])
})

test('the key column and a value its field would now refuse are never offered', async () => {
    await db.query(`UPDATE records SET meta_data = meta_data || 'fit=>Loose'::hstore WHERE record_key = '18875-887-M'`)
    const rows = await admin.record.suggestions({ ids: [ids['18875-002-M']] })
    assert.ok(rows.every(row => row.field !== 'SKU' && row.field !== 'Key' && row.field !== 'fit'))
    await db.query(`UPDATE records SET meta_data = meta_data || 'fit=>Slim'::hstore WHERE record_key = '18875-887-M'`)
    assert.ok((await suggested('18875-002-M')).includes('18875-002-M fit=Slim'))
})

test('records of the same model are the farthest siblings, without the fields telling them apart', async () => {
    assert.deepEqual(await suggested('PAMPA2'), [])
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', familyAttributeName: 'style', familyAxisAttributeNames: ['colour'] })
    assert.deepEqual(await suggested('PAMPA2'), ['PAMPA2 material=Suede'])
    await admin.settings.updateEnrichment({ recordLabelSingular: 'Product', recordLabelPlural: 'Products', familyAttributeName: null, familyAxisAttributeNames: [] })
})

test('an accepted suggestion is an ordinary change, and is then no longer offered', async () => {
    const rows = await admin.record.suggestions({ ids: [ids['18875-554-L']] })
    await admin.record.patchMany({ changes: [{ id: ids['18875-554-L'], values: Object.fromEntries(rows.map(row => [row.field, row.value])) }] })
    assert.deepEqual(await suggested('18875-554-L'), [])
    const changes = await db.getRepository(RecordChange).find({ where: { recordKey: '18875-554-L', action: 'update' } })
    assert.equal(changes.length, 1)
    assert.deepEqual(Object.keys(changes[0].changes).sort(), ['colour', 'material', 'season'])
})

test('only an admin reads suggestions or field values', async () => {
    for (const user of [fixtures.manager, fixtures.member]) {
        await forbidden(caller(user).record.suggestions({ ids: [ids['18875-554-L']] }))
        await forbidden(caller(user).recordAttribute.values({ name: 'material' }))
    }
})

test('a field offers the values it holds, most used first', async () => {
    const values = await admin.recordAttribute.values({ name: 'material' })
    assert.equal(values[0], 'Leather')
    assert.deepEqual([...values].sort(), ['Cotton', 'Leather', 'Suede', 'Wool'])
})
