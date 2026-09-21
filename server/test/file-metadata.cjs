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
// Metadata read from files, CSV mappings and the views setting. See
// docs/administration/records.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { writeFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const sharp = require('sharp')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeCollection, makeFolder, makeFile, forbidden } = harness
const { AssetFile, AssetType, DataRecord, CollectionFile } = harness.entities
const { AssetTypeResolverStep } = require('../dist/entity/asset-type-resolver-step')
const { AssetEntityLink } = require('../dist/entity/asset-entity-link')
const { MetadataField } = require('../dist/entity/metadata-field')
const metadata = require('../dist/services/file-metadata')
const { runEnrichmentPass } = harness.services.enrichment
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const makeType = name => save(AssetType, { name, isRelatedToRecords: true, defaultDisplay: 'grid', listDisplayItems: [] })
const typedFolder = (name, type) => makeFolder({ name, assetTypeId: type.id, assetTypeSource: 'manual' })
const makeRecord = (key, metaData = {}) => save(DataRecord, { recordKey: key, keyColumnName: 'Code', metaData: { Code: key, ...metaData } })
const fieldNamed = name => db.getRepository(MetadataField).findOneByOrFail({ name })
const fileRow = id => db.getRepository(AssetFile).findOneByOrFail({ id })
const linksOf = assetFileId => db.getRepository(AssetEntityLink).find({ where: { assetFileId }, order: { strategy: 'ASC' } })
const value = (field, text, extra = {}) => ({ field, type: 'text', text, date: null, number: null, ...extra })
const iptc = (...datasets) => Buffer.concat(datasets.map(([dataset, text]) => {
    const data = Buffer.from(text, 'utf8')
    const head = Buffer.from([0x1c, 2, dataset, 0, 0])
    head.writeUInt16BE(data.length, 3)
    return Buffer.concat([head, data])
}))

test('IPTC keywords, caption and credit are read, repeated keywords give several values, and technical datasets are skipped', () => {
    const buffer = Buffer.concat([iptc([25, 'Aurora'], [25, 'Festival'], [120, 'Crowd at night'], [110, 'Barros'], [0, 'version']), Buffer.from([0x1c, 1, 90, 0, 3, 0x1b, 0x25, 0x47])])
    assert.deepEqual(metadata.parseIptc(buffer), [
        { name: 'Keywords', value: 'Aurora' }, { name: 'Keywords', value: 'Festival' }, { name: 'Caption', value: 'Crowd at night' }, { name: 'Credit', value: 'Barros' },
    ])
})

test('EXIF scalars become typed fields, GPS one position, buffers, arrays and section pointers are left out and repeats are dropped', () => {
    const exif = {
        Image: { Make: 'Canon ', Model: 'EOS R5', Orientation: 1, XResolution: 72, ExifTag: 210, GPSTag: 430, StripOffsets: [1, 2], PrintIM: Buffer.from('x') },
        Photo: { DateTimeOriginal: new Date('2026-05-21T14:02:03Z'), ISOSpeedRatings: 400, UserComment: '\u0000\u0000' },
        GPSInfo: { GPSLatitude: [23, 33, 0], GPSLatitudeRef: 'S', GPSLongitude: [46, 38, 0], GPSLongitudeRef: 'W' },
    }
    const values = metadata.flattenMetadata(exif, iptc([25, 'Aurora'], [25, 'Aurora']))
    assert.deepEqual(values.map(v => [v.field, v.type, v.text]), [
        ['exif.Make', 'text', 'Canon'], ['exif.Model', 'text', 'EOS R5'], ['exif.Orientation', 'number', '1'], ['exif.XResolution', 'number', '72'],
        ['exif.DateTimeOriginal', 'date', '2026-05-21 14:02:03'], ['exif.ISOSpeedRatings', 'number', '400'],
        ['exif.GPS', 'gps', '-23.550000,-46.633333'], ['iptc.Keywords', 'text', 'Aurora'],
    ])
})

test('a real JPEG gives its EXIF, a JPEG without EXIF gives nothing, and a file carrying a field for the first time creates it switched off', async () => {
    const withExif = join(tmpdir(), `metadata-${randomUUID()}.jpg`)
    const without = join(tmpdir(), `metadata-${randomUUID()}.jpg`)
    await writeFile(withExif, await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().withExif({ IFD0: { Make: 'Damvia', Model: 'Fixture 1' } }).toBuffer())
    await writeFile(without, await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer())
    try {
        const values = await metadata.readFileMetadata(withExif)
        assert.deepEqual(values.filter(v => ['exif.Make', 'exif.Model'].includes(v.field)).map(v => v.text), ['Damvia', 'Fixture 1'])
        assert.deepEqual(await metadata.readFileMetadata(without), [])
        const file = await makeFile(await makeFolder({ name: 'Exif' }), { name: 'shot.jpg', mimeType: 'image/jpeg' })
        await metadata.extractFileMetadata(file, withExif)
        const make = await fieldNamed('exif.Make')
        assert.deepEqual([make.valueType, make.searchable, make.facetable, make.viewable, make.canLink], ['text', false, false, false, false])
        await metadata.storeFileMetadata(db.manager, file.id, [value('exif.Make', 'Nikon')])
        assert.deepEqual((await db.query('SELECT value_text FROM asset_file_metadata_values WHERE asset_file_id = $1', [file.id])).map(r => r.value_text), ['Nikon'])
        await runEnrichmentPass()
        assert.equal((await fieldNamed('exif.Make')).fileCount, 1)
    } finally {
        await rm(withExif, { force: true })
        await rm(without, { force: true })
    }
})

test('a format sharp cannot read has no metadata and is not an error, a missing file still fails', async () => {
    const unreadable = join(tmpdir(), `metadata-${randomUUID()}.psd`)
    await writeFile(unreadable, Buffer.from('8BPS not an image sharp reads'))
    try {
        assert.deepEqual(await metadata.readFileMetadata(unreadable), [])
    } finally {
        await rm(unreadable, { force: true })
    }
    await assert.rejects(metadata.readFileMetadata(join(tmpdir(), `metadata-${randomUUID()}.jpg`)))
})

test('a field whose value equals a record key links nothing until an admin trusts it and a step names it', async () => {
    const admin = caller(fixtures.admin)
    const type = await makeType('Metadata linked')
    const record = await makeRecord('EVT-60001')
    const folder = await typedFolder('Metadata linked', type)
    const file = await makeFile(folder, { name: 'IMG_0001.jpg', assetTypeId: type.id, mimeType: 'image/jpeg' })
    await metadata.storeFileMetadata(db.manager, file.id, [value('iptc.OriginalTransmissionReference', 'EVT-60001'), value('iptc.City', 'Lisboa')])
    const field = await fieldNamed('iptc.OriginalTransmissionReference')
    await assert.rejects(admin.resolverStep.save({ assetTypeId: type.id, steps: [{ strategy: 'metadata', enabled: true, config: { metadataFieldId: field.id } }] }), e => /only a metadata field marked "Can link"/.test(e.message))
    await save(AssetTypeResolverStep, { assetTypeId: type.id, position: 0, strategy: 'metadata', config: { metadataFieldId: field.id } })
    await runEnrichmentPass()
    assert.deepEqual(await linksOf(file.id), [])
    const unmatched = await admin.entityResolution.unmatchedFiles({ folderId: folder.id })
    assert.equal(unmatched.files[0].suggestion, null)
    await assert.rejects(admin.metadataField.update({ id: field.id, displayName: null, searchable: false, facetable: false, viewable: false, canLink: true, linkTarget: null, linkAttributeName: null }), e => e.code === 'BAD_REQUEST')
    await admin.metadataField.update({ id: field.id, displayName: 'Job reference', searchable: false, facetable: false, viewable: false, canLink: true, linkTarget: 'record_key', linkAttributeName: null })
    assert.deepEqual((await linksOf(file.id)).map(l => [l.recordKey, l.strategy, l.isPrimary]), [['EVT-60001', 'metadata', true]])
    assert.equal((await fileRow(file.id)).recordId, record.id)
    const city = await fieldNamed('iptc.City')
    await admin.metadataField.update({ id: city.id, displayName: null, searchable: false, facetable: false, viewable: false, canLink: true, linkTarget: 'attribute', linkAttributeName: 'City' })
    await makeRecord('EVT-60002', { City: 'Lisboa' })
    const other = await makeFile(folder, { name: 'IMG_0002.jpg', assetTypeId: type.id, mimeType: 'image/jpeg' })
    await metadata.storeFileMetadata(db.manager, other.id, [value('iptc.OriginalTransmissionReference', 'EVT-60002')])
    await db.getRepository(AssetTypeResolverStep).delete({ assetTypeId: type.id })
    await runEnrichmentPass()
    const suggested = await admin.entityResolution.unmatchedFiles({ folderId: folder.id })
    assert.deepEqual(suggested.files.map(f => [f.name, f.suggestion, f.suggestionField]).sort(), [['IMG_0001.jpg', 'EVT-60001', 'Job reference'], ['IMG_0002.jpg', 'EVT-60002', 'Job reference']])
})

test('searchable, facetable and viewable metadata: text search, value facets, a date range, values on results, files without a record included', async () => {
    const admin = caller(fixtures.admin)
    const member = caller(fixtures.member)
    const folder = await makeFolder({ name: 'Metadata search' })
    const collection = await makeCollection({ name: 'Metadata search', assetFolderId: folder.id })
    const files = []
    for (const [name, photographer, date] of [['meta-a.jpg', 'Barros Fotografia', '2026-03-08'], ['meta-b.jpg', 'Diego Salazar', '2026-05-07'], ['meta-c.jpg', 'Barros Fotografia', '2026-05-21']]) {
        const file = await makeFile(folder, { name, mimeType: 'image/jpeg' })
        await save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })
        await metadata.storeFileMetadata(db.manager, file.id, [value('iptc.Byline', photographer), value('exif.DateTimeOriginal', `${date} 10:00:00`, { type: 'date', date: new Date(`${date}T10:00:00Z`) })])
        files.push(file)
    }
    await runEnrichmentPass()
    const byline = await fieldNamed('iptc.Byline')
    const taken = await fieldNamed('exif.DateTimeOriginal')
    assert.equal((await member.collection.search({ query: 'Salazar' })).total, 0)
    await admin.metadataField.update({ id: byline.id, displayName: 'Photographer', searchable: true, facetable: true, viewable: true, canLink: false, linkTarget: null, linkAttributeName: null })
    await admin.metadataField.update({ id: taken.id, displayName: 'Taken on', searchable: false, facetable: true, viewable: false, canLink: false, linkTarget: null, linkAttributeName: null })
    const found = await member.collection.search({ query: 'Salazar' })
    assert.deepEqual(found.results.map(f => f.name), ['meta-b.jpg'])
    assert.deepEqual(found.results[0].metadata, [{ id: byline.id, name: 'iptc.Byline', displayName: 'Photographer', value: 'Diego Salazar' }])
    const scoped = await member.collection.search({ collectionId: collection.id, searchScope: 'current' })
    assert.deepEqual(scoped.facets.metadata[byline.id], { 'Barros Fotografia': 2, 'Diego Salazar': 1 })
    assert.deepEqual(Object.values(scoped.facets.metadataRanges[taken.id]).map(d => new Date(d).toISOString().slice(0, 10)), ['2026-03-08', '2026-05-21'])
    const byValue = await member.collection.search({ collectionId: collection.id, searchScope: 'current', metadata: { [byline.id]: ['Barros Fotografia'] } })
    assert.deepEqual(byValue.results.map(f => f.name).sort(), ['meta-a.jpg', 'meta-c.jpg'])
    assert.deepEqual(byValue.facets.metadata[byline.id], { 'Barros Fotografia': 2, 'Diego Salazar': 1 })
    const byDate = await member.collection.search({ collectionId: collection.id, searchScope: 'current', metadata: { [taken.id]: { from: '2026-05-01', to: '2026-05-21' } } })
    assert.deepEqual(byDate.results.map(f => f.name).sort(), ['meta-b.jpg', 'meta-c.jpg'])
    await assert.rejects(member.collection.search({ metadata: { [taken.id]: { from: 'yesterday' } } }), e => e.code === 'BAD_REQUEST')
    const facets = await member.metadataField.listFacets()
    assert.deepEqual(facets.find(f => f.id === byline.id).values, ['Barros Fotografia', 'Diego Salazar'])
    await metadata.storeFileMetadata(db.manager, files[0].id, [value('exif.GPS', '-23.550000,-46.633333', { type: 'gps' })])
    const gps = await fieldNamed('exif.GPS')
    await assert.rejects(admin.metadataField.update({ id: gps.id, displayName: null, searchable: false, facetable: true, viewable: false, canLink: false, linkTarget: null, linkAttributeName: null }), e => /GPS position cannot be a filter/.test(e.message))
})

test('a CSV mapping is compared before it is applied, matches names with or without extension in any case, and a new import replaces the previous one', async () => {
    const admin = caller(fixtures.admin)
    const type = await makeType('Csv mapped')
    await makeRecord('CSV-1')
    await makeRecord('CSV-2', { Season: 'SS26' })
    const folder = await typedFolder('Csv mapped', type)
    const banner = await makeFile(folder, { name: 'Banner_Summer.PNG', assetTypeId: type.id })
    const teaser = await makeFile(folder, { name: 'teaser.mp4', assetTypeId: type.id })
    await save(AssetEntityLink, { assetFileId: teaser.id, targetKind: 'record', recordKey: 'CSV-2', strategy: 'manual_file' })
    const rows = [{ fileName: 'banner_summer', recordKey: 'CSV-1' }, { fileName: 'TEASER.MP4', attribute: 'Season', value: 'SS26' }, { fileName: 'missing.jpg', recordKey: 'CSV-404' }]
    const compared = await admin.entityCsv.compare({ rows })
    assert.deepEqual([compared.rows, compared.added, compared.changed, compared.removed, compared.unknownKeys, compared.filesFound], [3, 3, 0, 0, ['CSV-404'], 2])
    assert.equal(await db.query('SELECT count(*)::int AS n FROM asset_entity_csv_mappings').then(r => r[0].n), 0)
    await admin.entityCsv.replace({ rows })
    assert.deepEqual((await linksOf(banner.id)).map(l => [l.recordKey, l.strategy, l.isPrimary]), [['CSV-1', 'csv', true]])
    assert.deepEqual((await linksOf(teaser.id)).map(l => [l.targetKind, l.recordKey ?? l.attributeValue, l.strategy]), [['attribute', 'SS26', 'csv'], ['record', 'CSV-2', 'manual_file']])
    const replaced = [{ fileName: 'banner_summer.png', recordKey: 'CSV-2' }]
    const again = await admin.entityCsv.compare({ rows: replaced })
    assert.deepEqual([again.added, again.changed, again.removed], [0, 1, 2])
    await admin.entityCsv.replace({ rows: replaced })
    assert.deepEqual((await linksOf(banner.id)).map(l => l.recordKey), ['CSV-2'])
    assert.deepEqual((await linksOf(teaser.id)).map(l => l.strategy), ['manual_file'])
    assert.equal((await admin.entityCsv.summary()).rows, 1)
    await assert.rejects(admin.entityCsv.compare({ rows: [{ fileName: 'x.jpg' }] }), e => e.code === 'BAD_REQUEST')
    await admin.entityCsv.clear()
    assert.deepEqual(await linksOf(banner.id), [])
})

test('with views enabled a file name step without a view group reads the view after the key, and the thumbnail view comes from Settings', async () => {
    const admin = caller(fixtures.admin)
    const type = await makeType('Views')
    const record = await makeRecord('VW-100')
    const folder = await typedFolder('Views', type)
    const front = await makeFile(folder, { name: 'VW-100.02.jpg', assetTypeId: type.id })
    const side = await makeFile(folder, { name: 'VW-100_03.jpg', assetTypeId: type.id })
    await admin.resolverStep.save({ assetTypeId: type.id, steps: [{ strategy: 'filename_regex', enabled: true, config: { pattern: '^(VW-\\d+)', keyGroup: 1 } }] })
    assert.deepEqual([(await fileRow(front.id)).recordView, (await fileRow(side.id)).recordView], ['02', null])
    const settings = await admin.settings.getEnrichment()
    await admin.settings.updateEnrichment({ ...settings, viewSeparator: '_', viewDigits: 2, thumbnailView: '03' })
    assert.deepEqual([(await fileRow(front.id)).recordView, (await fileRow(side.id)).recordView], [null, '03'])
    await db.getRepository(AssetFile).update(side.id, { hasThumbnail: true })
    const listed = await admin.record.list({ page: 1, size: 100, columnFilter: { column: 'recordKey', value: 'VW-100' } })
    assert.equal(listed.records[0].thumbnailURL, 'https://example.test/fixture')
    await admin.settings.updateEnrichment({ ...settings, viewsEnabled: false })
    assert.deepEqual([(await fileRow(front.id)).recordView, (await fileRow(side.id)).recordView, (await fileRow(side.id)).recordId], [null, null, record.id])
    assert.equal((await caller(fixtures.member).env()).viewsEnabled, false)
    await admin.settings.updateEnrichment(settings)
})

test('fields, CSV mappings and the metadata facets have their guards', async () => {
    const id = randomUUID()
    const rows = [{ fileName: 'a.jpg', recordKey: 'A' }]
    for (const user of [null, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.metadataField.list())
        await forbidden(as.metadataField.update({ id, displayName: null, searchable: false, facetable: false, viewable: false, canLink: false, linkTarget: null, linkAttributeName: null }))
        await forbidden(as.entityCsv.summary())
        await forbidden(as.entityCsv.compare({ rows }))
        await forbidden(as.entityCsv.replace({ rows }))
        await forbidden(as.entityCsv.clear())
    }
    for (const user of [null, { ...fixtures.member, approved: false }, { ...fixtures.member, emailVerified: false }]) {
        await forbidden(caller(user).metadataField.listFacets())
    }
})
