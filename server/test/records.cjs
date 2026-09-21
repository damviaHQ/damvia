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
// Records are created, edited, typed, removed and imported from the admin
// Records screen, and each change is kept in the history. See
// docs/administration/records.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeFolder, makeFile, forbidden } = harness
const { AssetFile, AssetType, RecordAttribute, RecordChange } = harness.entities
const { AssetEntityLink } = require('../dist/entity/asset-entity-link')
let fixtures, admin
const changesOf = recordKey => db.getRepository(RecordChange).find({ where: { recordKey }, order: { createdAt: 'ASC' } })
const field = name => db.getRepository(RecordAttribute).findOneByOrFail({ name })
const metaOf = async id => (await db.query('SELECT hstore_to_json(meta_data) AS m FROM records WHERE id = $1', [id]))[0]?.m
const code = error => error.code
const rejects = (promise, expected) => assert.rejects(promise, error => code(error) === expected)

before(async () => {
    fixtures = await harness.setup()
    admin = caller(fixtures.admin)
    // Records imported before fields had types: undo the migration, write the
    // catalogue as it was, and migrate again.
    while ((await db.query("SELECT 1 FROM migrations WHERE name = 'RecordFields1790985600000'")).length) await db.undoLastMigration()
    await db.query(`INSERT INTO records (record_key, key_column_name, meta_data) VALUES
        ('BF-1', 'SKU', 'SKU=>BF-1, bf_name=>Shirt, bf_colour=>Blue'::hstore),
        ('BF-2', 'SKU', 'SKU=>BF-2, bf_name=>Bag, bf_size=>L'::hstore)`)
    await db.runMigrations()
})
after(() => harness.teardown())

test('the upgrade declares every key already in the catalogue as a text field, in order, without the key column', async () => {
    const fields = await admin.recordAttribute.list()
    const names = fields.map(f => f.name)
    assert.deepEqual(names.filter(name => name.startsWith('bf_')), ['bf_name', 'bf_colour', 'bf_size'])
    assert.ok(!names.includes('SKU'))
    assert.ok(fields.every(f => f.valueType === 'text' && f.options.length === 0))
    assert.deepEqual(fields.map(f => f.position), fields.map((_, index) => index))
})

test('a record created by hand gets a history row, refuses a taken key and an unknown field, and attaches waiting files', async () => {
    const type = await save(AssetType, { name: 'Packshot', isRelatedToRecords: true, defaultDisplay: 'grid', listDisplayItems: [] })
    const folder = await makeFolder({ name: 'Packshots', assetTypeId: type.id, assetTypeSource: 'manual' })
    const file = await makeFile(folder, { name: 'NEW-1.jpg', assetTypeId: type.id, hasThumbnail: true })
    await admin.resolverStep.save({ assetTypeId: type.id, steps: [{ strategy: 'filename_regex', enabled: true, config: { pattern: '^(NEW-\\d+)', keyGroup: 1 } }] })
    assert.equal((await db.getRepository(AssetEntityLink).findOneByOrFail({ assetFileId: file.id })).status, 'dangling')

    const created = await admin.record.create({ recordKey: ' NEW-1 ', values: { bf_name: 'Hat' } })
    assert.equal(created.recordKey, 'NEW-1')
    assert.deepEqual(created.metaData, { SKU: 'NEW-1', bf_name: 'Hat' })
    assert.equal((await db.getRepository(AssetEntityLink).findOneByOrFail({ assetFileId: file.id })).status, 'active')
    assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: file.id })).recordId, created.id)

    const [history] = await changesOf('NEW-1')
    assert.deepEqual([history.action, history.source, history.changedById, history.changes.bf_name], ['create', 'grid', fixtures.admin.id, { old: null, new: 'Hat' }])
    await rejects(admin.record.create({ recordKey: 'NEW-1' }), 'CONFLICT')
    await rejects(admin.record.create({ recordKey: 'NEW-2', values: { nope: 'x' } }), 'NOT_FOUND')

    const detail = await admin.record.get(created.id)
    assert.deepEqual(detail.files.direct.map(f => [f.name, f.strategy, f.isPrimary]), [['NEW-1.jpg', 'filename_regex', true]])
    assert.equal(detail.files.direct[0].thumbnailURL, 'https://example.test/fixture')
    assert.equal(detail.fileCount, 1)
    assert.equal(detail.thumbnailURL, 'https://example.test/fixture')
})

test('each field type keeps one canonical form and refuses what it cannot read', async () => {
    const make = (name, valueType, options) => admin.recordAttribute.create({ name, displayName: null, valueType, options, facetable: false, viewable: true, searchable: false })
    await make('price', 'number')
    await make('launch', 'date')
    await make('site', 'url')
    await make('colour', 'single_select', ['Red', 'Blue'])
    await make('tags', 'multi_select', ['Eco', 'New', 'Sale'])
    const { id } = await admin.record.create({ recordKey: 'TYP-1' })
    const patch = values => admin.record.patch({ id, values, source: 'grid' })

    assert.equal((await patch({ price: ' 12,5 ' })).metaData.price, '12.5')
    assert.equal((await patch({ launch: '2026-02-28' })).metaData.launch, '2026-02-28')
    assert.equal((await patch({ site: 'https://example.test/p' })).metaData.site, 'https://example.test/p')
    assert.equal((await patch({ colour: 'Blue' })).metaData.colour, 'Blue')
    assert.equal((await patch({ tags: 'Sale|Eco|Eco' })).metaData.tags, 'Eco|Sale')
    assert.equal((await patch({ price: '' })).metaData.price, '')
    for (const values of [{ price: 'abc' }, { launch: '2026-02-30' }, { launch: '28/02/2026' }, { site: 'ftp://example.test' }, { colour: 'Green' }, { tags: 'Eco|Other' }, { SKU: 'X' }]) {
        await rejects(patch(values), 'BAD_REQUEST')
    }
    await rejects(patch({ unknown: 'x' }), 'NOT_FOUND')
    await rejects(admin.record.patch({ id: '00000000-0000-4000-8000-000000000000', values: { price: '1' }, source: 'grid' }), 'NOT_FOUND')

    const before = (await changesOf('TYP-1')).length
    await patch({ colour: 'Blue', tags: 'Eco|Sale' })
    assert.equal((await changesOf('TYP-1')).length, before, 'an edit that changes nothing leaves no row')
    await admin.record.patch({ id, values: { colour: 'Red', tags: 'Eco|Sale' }, source: 'panel' })
    const last = (await changesOf('TYP-1')).at(-1)
    assert.deepEqual([last.source, last.changes], ['panel', { colour: { old: 'Blue', new: 'Red' } }])
})

test('the list searches every value, filters, sorts numbers as numbers and counts filled fields', async () => {
    const make = async (key, values) => (await admin.record.create({ recordKey: key, values })).id
    await make('LST-1', { bf_name: 'Alpha', price: '9', tags: 'Eco' })
    await make('LST-2', { bf_name: 'Beta', price: '10', tags: 'Sale|New' })
    const broken = await make('LST-3', { bf_name: 'Gamma' })
    await db.query(`UPDATE records SET meta_data = meta_data || 'price=>n/a'::hstore WHERE id = $1`, [broken])
    const list = input => admin.record.list({ page: 1, size: 50, filters: [{ column: 'recordKey', op: 'contains', value: 'LST-' }], ...input })
    const keys = result => result.records.map(r => r.recordKey)

    assert.deepEqual(keys(await admin.record.list({ page: 1, size: 50, search: 'beta' })), ['LST-2'])
    assert.deepEqual(keys(await admin.record.list({ page: 1, size: 50, search: '%' })), [])
    assert.deepEqual(keys(await list({ sort: { column: 'price', direction: 'asc' } })), ['LST-1', 'LST-2', 'LST-3'])
    assert.deepEqual(keys(await list({ sort: { column: 'price', direction: 'desc' } })), ['LST-2', 'LST-1', 'LST-3'])
    assert.deepEqual(keys(await list({ sort: { column: 'recordKey', direction: 'desc' } })), ['LST-3', 'LST-2', 'LST-1'])
    const tags = values => list({ filters: [{ column: 'recordKey', op: 'contains', value: 'LST-' }, { column: 'tags', op: 'has_any', values }] })
    assert.deepEqual(keys(await tags(['New'])), ['LST-2'])
    assert.deepEqual(keys(await tags(['Eco', 'New'])), ['LST-1', 'LST-2'])
    const empty = await list({ filters: [{ column: 'recordKey', op: 'contains', value: 'LST-' }, { column: 'tags', op: 'is_empty' }] })
    assert.deepEqual(keys(empty), ['LST-3'])
    const all = await list({})
    assert.equal(all.total, 3)
    assert.deepEqual(all.records.map(r => r.filledCount), [3, 3, 2])
    assert.equal(all.keyColumnName, 'SKU')
    await rejects(list({ sort: { column: "x') OR true --", direction: 'asc' } }), 'BAD_REQUEST')
    await rejects(list({ filters: [{ column: 'nope', op: 'is', value: 'x' }] }), 'BAD_REQUEST')
    const page = await admin.record.list({ page: 2, size: 1, filters: [{ column: 'recordKey', op: 'contains', value: 'LST-' }] })
    assert.deepEqual([page.total, keys(page)], [3, ['LST-2']])

    const lst = [{ column: 'recordKey', op: 'contains', value: 'LST-' }]
    const locate = input => admin.record.locate({ filters: lst, ...input })
    assert.deepEqual(await locate({ recordKey: 'LST-3', sort: { column: 'recordKey', direction: 'desc' } }), { id: broken, position: 0 })
    assert.equal((await locate({ recordKey: 'LST-1', sort: { column: 'price', direction: 'desc' } })).position, 1)
    assert.equal((await locate({ recordKey: 'LST-2', sort: { column: 'fileCount', direction: 'asc' } })).position, 1)
    assert.equal((await locate({ recordKey: 'LST-1', search: 'beta' })).position, null, 'a record the search leaves out has no position')
    await rejects(locate({ recordKey: 'LST-404' }), 'NOT_FOUND')
})

test('bulk edits and removals write one history row per record and leave links dangling', async () => {
    const a = await admin.record.create({ recordKey: 'BLK-1' })
    const b = await admin.record.create({ recordKey: 'BLK-2' })
    assert.deepEqual(await admin.record.bulkPatch({ ids: [a.id, b.id], values: { colour: 'Red' } }), { updated: 2 })
    assert.deepEqual(await admin.record.bulkPatch({ ids: [a.id, b.id], values: { colour: 'Red' } }), { updated: 0 })
    assert.deepEqual((await changesOf('BLK-1')).map(c => [c.action, c.source]), [['create', 'grid'], ['update', 'bulk']])

    const record = (await admin.record.list({ page: 1, size: 1, search: 'NEW-1' })).records[0]
    const link = await db.getRepository(AssetEntityLink).findOneByOrFail({ recordKey: 'NEW-1' })
    assert.deepEqual(await admin.record.remove({ ids: [record.id] }), { removed: 1 })
    assert.equal((await db.getRepository(AssetEntityLink).findOneByOrFail({ id: link.id })).status, 'dangling')
    assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: link.assetFileId })).recordId, null)
    const deleted = (await changesOf('NEW-1')).at(-1)
    assert.deepEqual([deleted.action, deleted.recordId, deleted.changes.bf_name], ['delete', null, { old: 'Hat', new: null }])

    const again = await admin.record.create({ recordKey: 'NEW-1' })
    const history = await admin.record.history({ id: again.id, limit: 2 })
    assert.deepEqual(history.items.map(item => item.action), ['create', 'delete'])
    assert.equal(history.hasMore, true)
    assert.equal(history.items[0].changedBy.id, fixtures.admin.id)
    const rest = await admin.record.history({ id: again.id, before: history.items[1].id })
    assert.deepEqual(rest.items.map(item => item.action), ['create'])
    assert.equal(rest.hasMore, false)
})

test('a pasted range sets different values per record, whole or not at all', async () => {
    const a = await admin.record.create({ recordKey: 'RNG-1', values: { price: '10' } })
    const b = await admin.record.create({ recordKey: 'RNG-2' })
    await assert.rejects(admin.record.patchMany({ changes: [{ id: a.id, values: { price: '12' } }, { id: b.id, values: { price: 'cheap' } }] }), /RNG-2: .*number/)
    assert.equal((await admin.record.get(a.id)).metaData.price, '10')

    const pasted = await admin.record.patchMany({ changes: [
        { id: a.id, values: { price: '12,5', bf_name: 'Cap' } },
        { id: b.id, values: { price: '20' } },
        { id: b.id, values: { bf_name: 'Scarf' } },
    ] })
    assert.deepEqual(pasted, { updated: 2 })
    assert.deepEqual([(await admin.record.get(a.id)).metaData, (await admin.record.get(b.id)).metaData].map(m => [m.price, m.bf_name]), [['12.5', 'Cap'], ['20', 'Scarf']])
    const last = (await changesOf('RNG-2')).at(-1)
    assert.deepEqual([last.source, last.changes], ['grid', { price: { old: null, new: '20' }, bf_name: { old: null, new: 'Scarf' } }])
    assert.deepEqual(await admin.record.patchMany({ changes: [{ id: a.id, values: { price: '12.5' } }] }), { updated: 0 })
    await assert.rejects(admin.record.patchMany({ changes: [{ id: a.id, values: { SKU: 'X' } }] }), /key/)
})

test('a CSV import creates text fields, learns select options, skips invalid rows whole and never back-fills', async () => {
    const data = [
        { SKU: 'CSV-1', bf_name: 'One', colour: 'Green', csv_new: 'x' },
        { SKU: 'CSV-2', bf_name: 'Two', price: 'cheap' },
        { SKU: 'BLK-1', colour: 'Blue' },
        { SKU: 'BLK-2', colour: 'Red' },
        { SKU: ' ', bf_name: 'No key' },
    ]
    const compared = await admin.record.compareCsv({ keyColumnName: 'SKU', data })
    assert.deepEqual(compared.newColumns, ['csv_new'])
    assert.deepEqual(compared.newOptions, { colour: ['Green'] })
    assert.deepEqual(compared.rows.map(row => row.status), ['new', 'invalid', 'changed', 'unchanged', 'missing_key'])
    assert.match(compared.rows[1].invalid.price, /must be a number/)

    const imported = await admin.record.importCsv({ keyColumnName: 'SKU', data })
    assert.deepEqual([imported.newRecords, imported.updatedRecords], [['CSV-1'], ['BLK-1']])
    assert.deepEqual(imported.skipped.map(s => [s.key, s.column]), [['CSV-2', 'price']])
    assert.equal((await field('csv_new')).valueType, 'text')
    assert.deepEqual((await field('colour')).options, ['Red', 'Blue', 'Green'])
    const batch = (await db.getRepository(RecordChange).findBy({ importBatchId: imported.importBatchId })).map(c => [c.recordKey, c.action, c.source]).sort()
    assert.deepEqual(batch, [['BLK-1', 'update', 'csv'], ['CSV-1', 'create', 'csv']])
    const untouched = (await admin.record.list({ page: 1, size: 1, search: 'BLK-2' })).records[0]
    assert.equal('csv_new' in untouched.metaData, false)
    assert.equal((await admin.record.list({ page: 1, size: 1, search: 'CSV-2' })).total, 0)
})

test('fields change type, seed their options, reorder, and take their values with them when removed', async () => {
    const name = await field('bf_name')
    const turned = await admin.recordAttribute.update({ id: name.id, valueType: 'single_select' })
    assert.ok(turned.options.includes('Shirt') && turned.options.includes('Alpha'))
    assert.equal(turned.invalidCount, 0)
    const price = await field('price')
    assert.equal((await admin.recordAttribute.update({ id: price.id, displayName: 'Price' })).invalidCount, 1)
    assert.equal((await admin.recordAttribute.usage(price.id)).invalid, 1)
    await rejects(admin.recordAttribute.update({ id: name.id, options: ['A|B'] }), 'BAD_REQUEST')
    await rejects(admin.recordAttribute.create({ name: 'price', displayName: null, facetable: false, viewable: false, searchable: false }), 'CONFLICT')
    await rejects(admin.recordAttribute.create({ name: 'SKU', displayName: null, facetable: false, viewable: false, searchable: false }), 'BAD_REQUEST')
    assert.deepEqual((await admin.recordAttribute.update({ id: name.id, valueType: 'text' })).options, [])

    const ids = (await admin.recordAttribute.list()).map(f => f.id).reverse()
    assert.deepEqual((await admin.recordAttribute.reorder({ ids })).map(f => f.id), ids)

    const tags = await field('tags')
    await admin.recordAttribute.update({ id: tags.id, facetable: true })
    const facet = (await caller(fixtures.member).recordAttribute.listFacets()).find(f => f.name === 'tags')
    assert.deepEqual(facet.values.sort(), ['Eco', 'New', 'Sale'])
    const holders = await db.query(`SELECT record_key FROM records WHERE meta_data ? 'tags' AND meta_data -> 'tags' <> '' ORDER BY record_key`)
    const removed = await admin.recordAttribute.remove(tags.id)
    assert.ok(removed.cleared >= holders.length)
    assert.deepEqual(await db.query(`SELECT 1 FROM records WHERE meta_data ? 'tags'`), [])
    const lost = (await changesOf(holders[0].record_key)).at(-1)
    assert.deepEqual([lost.source, Object.keys(lost.changes)], ['attribute', ['tags']])
})

test('an export follows the filters and keeps the key first', async () => {
    const exported = await admin.record.exportRows({ filters: [{ column: 'recordKey', op: 'contains', value: 'LST-' }], sort: { column: 'recordKey', direction: 'asc' } })
    assert.equal(exported.columns[0], 'SKU')
    assert.deepEqual(exported.rows.map(row => row[0]), ['LST-1', 'LST-2', 'LST-3'])
    assert.equal(exported.rows[0][exported.columns.indexOf('price')], '9')
})

test('Unmatched creates records through the same path and with history', async () => {
    await admin.entityResolution.createRecord({ key: 'UNM-1' })
    const [created] = await changesOf('UNM-1')
    assert.deepEqual([created.action, created.source, created.changes.SKU.new], ['create', 'unmatched', 'UNM-1'])
})

test('every record and field procedure needs an approved admin', async () => {
    const { id } = (await admin.record.list({ page: 1, size: 1 })).records[0]
    const attribute = (await admin.recordAttribute.list())[0]
    const calls = [
        c => c.record.list({ page: 1, size: 1 }),
        c => c.record.get(id),
        c => c.record.locate({ recordKey: 'LST-1' }),
        c => c.record.create({ recordKey: 'SEC-1' }),
        c => c.record.patch({ id, values: { price: '1' }, source: 'grid' }),
        c => c.record.bulkPatch({ ids: [id], values: { price: '1' } }),
        c => c.record.patchMany({ changes: [{ id, values: { price: '1' } }] }),
        c => c.record.remove({ ids: [id] }),
        c => c.record.removeAll(),
        c => c.record.history({ id }),
        c => c.record.exportRows({}),
        c => c.record.compareCsv({ keyColumnName: 'SKU', data: [] }),
        c => c.record.importCsv({ keyColumnName: 'SKU', data: [] }),
        c => c.recordAttribute.create({ name: 'sec', displayName: null, facetable: false, viewable: false, searchable: false }),
        c => c.recordAttribute.update({ id: attribute.id, displayName: 'x' }),
        c => c.recordAttribute.reorder({ ids: [attribute.id] }),
        c => c.recordAttribute.remove(attribute.id),
        c => c.recordAttribute.usage(attribute.id),
    ]
    for (const user of [null, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }]) {
        for (const call of calls) await forbidden(call(caller(user)))
    }
})
