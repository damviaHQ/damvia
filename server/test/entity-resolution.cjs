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
// Files link to records through ordered matching steps, folder attachments and
// links set by hand. See docs/administration/records.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeCollection, makeFile, typedFolder, makeRecord, fileRow, forbidden } = harness
const { AssetFolder, AssetFile, DataRecord, CollectionFile, RecordAttribute } = harness.entities
const { AssetTypeResolverStep } = require('../dist/entity/asset-type-resolver-step')
const { AssetEntityLink } = require('../dist/entity/asset-entity-link')
const { AssetFileResolution } = require('../dist/entity/asset-file-resolution')
const resolution = harness.services.entityResolution
const { runEnrichmentPass } = harness.services.enrichment
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const LEGACY = '^([A-Z]{2,4}-[A-Za-z0-9]+)-C-?(\\w+)?'
const makeType = (name, extra = {}) => harness.makeType(name, { isRelatedToRecords: true, ...extra })
const linksOf = assetFileId => db.getRepository(AssetEntityLink).find({ where: { assetFileId }, order: { strategy: 'ASC', recordKey: 'ASC' } })
const statusOf = async assetFileId => (await db.getRepository(AssetFileResolution).findOneBy({ assetFileId }))?.status
const step = (id, strategy, config, extra = {}) => ({ id, strategy, config, ...resolution.compileStep(strategy, config), ...extra })
const childFolder = (parent, name) => save(AssetFolder, { name, status: 'up_to_date', externalId: randomUUID(), parentId: parent.id, parent, assetTypeId: parent.assetTypeId, assetTypeSource: 'inherited' })
// The asset type stage of the pass keeps a folder's type only when it knows
// where it came from, as the assets screen records it.
const catalogue = (keys, attributes = []) => ({ recordIds: new Map(keys.map(key => [key, `id-${key}`])), attributeValues: new Set(attributes.map(([name, value]) => resolution.attributeKey(name, value))) })

test('a step is refused without a group, with a group it does not have, or with a pattern that hangs', () => {
    assert.throws(() => resolution.compileStep('filename_regex', { pattern: 'EVT-\\d+' }), /Put the key part in parentheses/)
    assert.throws(() => resolution.compileStep('filename_regex', { pattern: '(EVT)', keyGroup: 2 }), /group 2 does not exist/)
    assert.throws(() => resolution.compileStep('folder_regex', { pattern: '^(.*\\/)*(.+\\s)*x$' }), /50 ms/)
    assert.equal(resolution.compileStep('filename_regex', { pattern: '^(EVT-\\d+)' }, { enabled: true, separator: '.', digits: 2 }).viewGroup, 2)
    assert.equal(resolution.fullFilenamePattern('^(EVT-\\d+)', { enabled: true, separator: '.', digits: 2 }), '^(EVT-\\d+)(?:\\.(\\d{2}))?')
})

test('the file name step reproduces the old cron: whole name, case-sensitive, group 1 key, group 2 view, and the key span', () => {
    const filename = step('s1', 'filename_regex', { pattern: LEGACY, keyGroup: 1, viewGroup: 2 })
    for (const name of ['EVT-25037-C-06-group.jpg', 'EVT-26029-C-01-offsite.jpg', 'WX5678-100_LS_05.png', 'evt-25037-C-06.jpg', 'IMG_0128.HEIC']) {
        const old = name.match(new RegExp(LEGACY))
        const found = resolution.resolveByFilenameRegex(name, filename)
        assert.deepEqual(found.map(candidate => [candidate.key, candidate.view]), old ? [[old[1], old[2] ?? null]] : [], name)
    }
    assert.deepEqual(resolution.resolveByFilenameRegex('EVT-25037-C-06.jpg', filename)[0].consumedSpan, [0, 9])
})

test('the folder step gives a record key or an attribute value, and the nearest folder attachment wins', () => {
    const byKey = step('s1', 'folder_regex', { pattern: '/(EVT-\\d+) [^/]+$', target: 'record', keyGroup: 1 })
    assert.deepEqual(resolution.resolveByFolderRegex('/Dropbox/EVENTS/2025/EVT-25028 Festival Aurora 2025', byKey).map(c => c.key), ['EVT-25028'])
    assert.deepEqual(resolution.resolveByFolderRegex('/Dropbox/EVENTS/2025', byKey), [])
    const byRange = step('s2', 'folder_regex', { pattern: '^/Dropbox/DIGITAL PACK/([^/]+)', target: 'attribute', attributeName: 'Collection', valueGroup: 1 })
    assert.deepEqual(resolution.resolveByFolderRegex('/dropbox/digital pack/Pampa SS26/Packshots', byRange).map(c => [c.attributeName, c.attributeValue]), [['Collection', 'Pampa SS26']])
    const attachments = new Map([
        ['a', [{ folderId: 'a', targetKind: 'record', recordKey: 'TOP' }]],
        ['c', [{ folderId: 'c', targetKind: 'attribute', attributeName: 'Collection', attributeValue: 'Aurora' }]],
    ])
    assert.deepEqual(resolution.resolveByFolderAttachment('a.b.', attachments), { folderId: 'a', candidates: [{ strategy: 'manual_folder', stepId: null, kind: 'record', key: 'TOP' }] })
    assert.deepEqual(resolution.resolveByFolderAttachment('a.b.c.d.', attachments).candidates.map(c => c.attributeValue), ['Aurora'])
    assert.deepEqual(resolution.resolveByFolderAttachment('x.y.', attachments).candidates, [])
})

test('merging: agreement keeps one row per strategy, disagreement is a conflict, a range sits beside a record and the primary follows the strategy order', () => {
    const file = key => ({ strategy: 'filename_regex', stepId: 'f', kind: 'record', key, view: '01' })
    const folder = key => ({ strategy: 'folder_regex', stepId: 'g', kind: 'record', key })
    const agree = resolution.mergeCandidates([file('A'), folder('A')], [], catalogue(['A']), null)
    assert.deepEqual([agree.status, agree.primaryRecordId, agree.primaryView, agree.links.length], ['matched', 'id-A', '01', 2])
    assert.deepEqual(agree.links.filter(link => link.isPrimary).map(link => link.strategy), ['filename_regex'])
    const disagree = resolution.mergeCandidates([file('A'), folder('B')], [], catalogue(['A', 'B']), null)
    assert.deepEqual([disagree.status, disagree.primaryRecordId, disagree.keepRecord, disagree.links.some(link => link.isPrimary)], ['conflict', null, true, false])
    const settled = resolution.mergeCandidates([file('A'), folder('B')], [{ targetKind: 'record', recordKey: 'B', strategy: 'manual_file', attributeName: null, attributeValue: null }], catalogue(['A', 'B']), null)
    assert.deepEqual([settled.status, settled.primaryRecordId], ['matched', 'id-B'])
    const withRange = resolution.mergeCandidates([file('A'), { strategy: 'folder_regex', stepId: 'g', kind: 'attribute', attributeName: 'Collection', attributeValue: 'Aurora' }], [], catalogue(['A'], [['Collection', 'Aurora']]), null)
    assert.deepEqual([withRange.status, withRange.primaryRecordId, withRange.links.map(link => [link.targetKind, link.status])], ['matched', 'id-A', [['record', 'active'], ['attribute', 'active']]])
    const tie = resolution.mergeCandidates([folder('Z'), { strategy: 'manual_folder', stepId: null, kind: 'record', key: 'M' }], [], catalogue(['Z', 'M']), 'folder')
    assert.equal(tie.primaryRecordId, 'id-M')
    const dangling = resolution.mergeCandidates([file('NOPE'), { strategy: 'folder_regex', stepId: 'g', kind: 'attribute', attributeName: 'Collection', attributeValue: 'Gone' }], [], catalogue([]), null)
    assert.deepEqual([dangling.status, dangling.reason], ['unmatched', 'no record with key NOPE; no record where Collection = Gone'])
})

test('the pass links files, derives record_id and view, writes nothing the second time, keeps a dangling key and re-attaches after an import', async () => {
    const type = await makeType('Event photos')
    await save(AssetTypeResolverStep, { assetTypeId: type.id, position: 0, strategy: 'filename_regex', config: { pattern: LEGACY, keyGroup: 1, viewGroup: 2 } })
    const record = await makeRecord('EVT-10001')
    const folder = await typedFolder('Pass', type)
    const known = await makeFile(folder, { name: 'EVT-10001-C-01-crowd.jpg', assetTypeId: type.id })
    const unknown = await makeFile(folder, { name: 'EVT-10002-C-02-stage.jpg', assetTypeId: type.id })
    const none = await makeFile(folder, { name: 'IMG_0001.jpg', assetTypeId: type.id })
    await runEnrichmentPass()
    assert.deepEqual([(await fileRow(known.id)).recordId, (await fileRow(known.id)).recordView, await statusOf(known.id)], [record.id, '01', 'matched'])
    assert.deepEqual((await linksOf(unknown.id)).map(link => [link.recordKey, link.status, link.recordId]), [['EVT-10002', 'dangling', null]])
    assert.deepEqual([await statusOf(unknown.id), await statusOf(none.id)], ['unmatched', 'unmatched'])
    assert.equal((await db.getRepository(AssetFileResolution).findOneByOrFail({ assetFileId: unknown.id })).reason, 'no record with key EVT-10002')
    const before = await db.query('SELECT id, updated_at FROM asset_entity_links ORDER BY id')
    const second = (await runEnrichmentPass()).entities
    assert.deepEqual([second.linksAdded, second.linksRemoved, second.linksUpdated, second.filesUpdated], [0, 0, 0, 0])
    assert.deepEqual(await db.query('SELECT id, updated_at FROM asset_entity_links ORDER BY id'), before)
    const imported = await makeRecord('EVT-10002')
    await runEnrichmentPass()
    assert.deepEqual([(await fileRow(unknown.id)).recordId, await statusOf(unknown.id)], [imported.id, 'matched'])
    await db.query('UPDATE asset_files SET record_id = NULL WHERE record_id = $1', [record.id])
    await db.getRepository(DataRecord).delete({ id: record.id })
    await runEnrichmentPass()
    assert.deepEqual((await linksOf(known.id)).map(link => [link.recordKey, link.status]), [['EVT-10001', 'dangling']])
    assert.deepEqual([(await fileRow(known.id)).recordId, (await fileRow(known.id)).recordView, await statusOf(known.id)], [null, '01', 'unmatched'])
    const back = await makeRecord('EVT-10001')
    await runEnrichmentPass()
    assert.equal((await fileRow(known.id)).recordId, back.id)
})

test('a file carries only the record its links give; a type without steps waits in To review only when it holds the pictures', async () => {
    const plain = await makeType('Logos', { isRelatedToRecords: false })
    const stepless = await makeType('No steps yet')
    const record = await makeRecord('EVT-20001')
    const logo = await makeFile(await typedFolder('Logos', plain), { name: 'EVT-20001-C-01.png', assetTypeId: plain.id, recordId: record.id })
    const waiting = await makeFile(await typedFolder('Waiting', stepless), { name: 'EVT-20001-C-02.png', assetTypeId: stepless.id, recordId: record.id })
    await runEnrichmentPass()
    // record_id written before links existed is dropped: nothing links these files.
    assert.deepEqual([await statusOf(logo.id), (await fileRow(logo.id)).recordId], ['not_applicable', null])
    assert.deepEqual([await statusOf(waiting.id), (await fileRow(waiting.id)).recordId], ['unmatched', null])
    assert.equal((await db.getRepository(AssetFileResolution).findOneByOrFail({ assetFileId: waiting.id })).reason, 'this asset type has no matching step')
})

test('a link set by hand survives every pass and settles a conflict; a folder attachment links every file below it, a range included', async () => {
    const admin = caller(fixtures.admin)
    const type = await makeType('Conflicted')
    await save(AssetTypeResolverStep, { assetTypeId: type.id, position: 0, strategy: 'filename_regex', config: { pattern: '^(EVT-\\d+)', keyGroup: 1 } })
    await save(AssetTypeResolverStep, { assetTypeId: type.id, position: 1, strategy: 'folder_regex', config: { pattern: '/(EVT-\\d+) [^/]+$', target: 'record', keyGroup: 1 } })
    await makeRecord('EVT-30001')
    const other = await makeRecord('EVT-30002', { Collection: 'Aurora' })
    const root = await typedFolder('EVT-30002 Aurora', type)
    const deeper = await childFolder(root, 'Selects')
    const file = await makeFile(root, { name: 'EVT-30001-hero.jpg', assetTypeId: type.id })
    const below = await makeFile(deeper, { name: 'IMG_1.jpg', assetTypeId: type.id })
    await runEnrichmentPass()
    assert.equal(await statusOf(file.id), 'conflict')
    const conflicts = await admin.entityResolution.conflicts()
    assert.deepEqual(conflicts.find(row => row.id === file.id).candidates.map(c => [c.key, c.strategy, c.exists]).sort(), [['EVT-30001', 'filename_regex', true], ['EVT-30002', 'folder_regex', true]])
    await admin.entityResolution.attach({ target: { kind: 'record', key: 'EVT-30002' }, fileIds: [file.id] })
    await runEnrichmentPass()
    assert.deepEqual([await statusOf(file.id), (await fileRow(file.id)).recordId], ['matched', other.id])
    assert.ok((await linksOf(file.id)).some(link => link.strategy === 'manual_file' && link.isPrimary))
    assert.equal(await statusOf(below.id), 'unmatched')
    const attached = await admin.entityResolution.attach({ target: { kind: 'attribute', name: 'Collection', value: 'Aurora' }, folderId: deeper.id })
    assert.equal(attached.files, 1)
    assert.deepEqual((await linksOf(below.id)).map(link => [link.targetKind, link.attributeValue, link.strategy, link.status]), [['attribute', 'Aurora', 'manual_folder', 'active']])
    assert.deepEqual([await statusOf(below.id), (await fileRow(below.id)).recordId], ['matched', null])
    const manual = (await linksOf(file.id)).find(link => link.strategy === 'manual_file')
    const ours = (rows) => rows.filter(row => row.id === manual.id || (row.kind === 'folder' && row.name === deeper.name))
    const byHand = ours(await admin.entityResolution.manualLinks())
    assert.deepEqual(byHand.map(row => [row.kind, row.recordKey ?? row.attributeValue, row.files]), [['folder', 'Aurora', 1], ['file', 'EVT-30002', 1]])
    await admin.entityResolution.detach({ linkId: manual.id })
    assert.equal(await statusOf(file.id), 'conflict')
    await assert.rejects(admin.entityResolution.detach({ linkId: (await linksOf(file.id))[0].id }), e => e.code === 'NOT_FOUND')
    await admin.entityResolution.detach({ attachmentId: byHand[0].id })
    assert.equal(await statusOf(below.id), 'unmatched')
    assert.deepEqual(ours(await admin.entityResolution.manualLinks()), [])
})

test('attach creates a missing record only when asked, and a moved file gets the links of its new folder', async () => {
    const admin = caller(fixtures.admin)
    const type = await makeType('Moves')
    await save(AssetTypeResolverStep, { assetTypeId: type.id, position: 0, strategy: 'folder_regex', config: { pattern: '/(MOV-\\d+)$', target: 'record', keyGroup: 1 } })
    await makeRecord('MOV-1')
    await makeRecord('MOV-2')
    const first = await typedFolder('MOV-1', type)
    const second = await typedFolder('MOV-2', type)
    const file = await makeFile(first, { name: 'shot.jpg', assetTypeId: type.id })
    await runEnrichmentPass()
    assert.deepEqual((await linksOf(file.id)).map(link => link.recordKey), ['MOV-1'])
    await db.getRepository(AssetFile).update(file.id, { folderId: second.id })
    await runEnrichmentPass()
    assert.deepEqual((await linksOf(file.id)).map(link => link.recordKey), ['MOV-2'])
    await assert.rejects(admin.entityResolution.attach({ target: { kind: 'record', key: 'NEW-1' }, fileIds: [file.id] }), e => e.code === 'NOT_FOUND')
    const created = await admin.entityResolution.attach({ target: { kind: 'record', key: 'NEW-1', create: true }, fileIds: [file.id] })
    assert.equal(created.recordCreated, true)
    const record = await db.getRepository(DataRecord).findOneByOrFail({ recordKey: 'NEW-1' })
    assert.deepEqual([record.keyColumnName, record.metaData], ['Code', { Code: 'NEW-1' }])
    assert.equal((await fileRow(file.id)).recordId, record.id)
})

test('the matching screen saves ordered steps, refuses a broken one with its position, previews unsaved steps on a folder and lists the queue', async () => {
    const admin = caller(fixtures.admin)
    const type = await makeType('Screen')
    await makeRecord('SCR-1')
    const folder = await typedFolder('Screen folder', type)
    for (let index = 0; index < 45; index++) await makeFile(folder, { name: `SCR-${index % 3}-shot-${String(index).padStart(2, '0')}.jpg`, assetTypeId: type.id })
    await assert.rejects(admin.resolverStep.save({ assetTypeId: type.id, steps: [{ strategy: 'filename_regex', enabled: true, config: { pattern: '^(SCR-\\d)', keyGroup: 1 } }, { strategy: 'filename_regex', enabled: true, config: { pattern: 'SCR' } }] }), e => /Step 2: Put the key part in parentheses/.test(e.message))
    const rows = await admin.resolverStep.preview({ assetTypeId: type.id, folderId: folder.id, steps: [{ strategy: 'filename_regex', enabled: true, config: { pattern: '^(SCR-\\d)', keyGroup: 1 } }] })
    assert.equal(rows.length, 40)
    assert.deepEqual([...new Set(rows.map(row => `${row.recordKey}:${row.status}`))].sort(), ['SCR-0:dangling', 'SCR-1:matched', 'SCR-2:dangling'])
    assert.equal(await db.getRepository(AssetTypeResolverStep).countBy({ assetTypeId: type.id }), 0)
    const saved = await admin.resolverStep.save({ assetTypeId: type.id, steps: [{ strategy: 'filename_regex', enabled: true, config: { pattern: '^(SCR-\\d)', keyGroup: 1 } }] })
    assert.equal(saved.steps.length, 1)
    const reordered = await admin.resolverStep.save({ assetTypeId: type.id, steps: [
        { strategy: 'folder_regex', enabled: false, config: { pattern: '/(SCR-\\d)$', target: 'record', keyGroup: 1 } },
        { id: saved.steps[0].id, strategy: 'filename_regex', enabled: true, config: { pattern: '^(SCR-\\d)', keyGroup: 1 } },
    ] })
    assert.deepEqual(reordered.steps.map(s => [s.position, s.strategy, s.id === saved.steps[0].id]), [[0, 'folder_regex', false], [1, 'filename_regex', true]])
    const listed = await admin.resolverStep.list()
    assert.equal(listed.types.find(t => t.id === type.id).steps.length, 2)
    const counts = await admin.entityResolution.counts()
    assert.ok(counts.unmatched >= 30 && counts.dangling >= 30)
    assert.ok((await admin.entityResolution.unmatchedFolders()).some(row => row.id === folder.id && row.files === 30))
    const files = await admin.entityResolution.unmatchedFiles({ folderId: folder.id })
    assert.deepEqual([files.total, files.files[0].reason], [30, 'no record with key SCR-0'])
    const dangling = await admin.entityResolution.dangling()
    assert.ok(dangling.some(row => row.recordKey === 'SCR-2' && !row.manual))
    await admin.entityResolution.createRecord({ key: 'SCR-2' })
    assert.ok(!(await admin.entityResolution.dangling()).some(row => row.recordKey === 'SCR-2'))
    await assert.rejects(admin.entityResolution.createRecord({ key: 'SCR-2' }), e => e.code === 'BAD_REQUEST')
    const found = await admin.entityResolution.findTargets({ query: 'scr' })
    assert.ok(found.records.some(record => record.key === 'SCR-1'))
    const linked = (await admin.record.get(found.records.find(record => record.key === 'SCR-1').id)).files
    assert.equal(linked.direct.length, 15)
    assert.equal(linked.direct[0].pattern, '^(SCR-\\d)')
})

test('the upgrade gives the product regex to every type still without steps, and matches its files without views', async () => {
    const campaign = await harness.makeType('Campaign shots', { isRelatedToRecords: false })
    const stepped = await makeType('Already stepped')
    await save(AssetTypeResolverStep, { assetTypeId: stepped.id, position: 0, strategy: 'filename_regex', config: { pattern: '^(OWN-\\d+)', keyGroup: 1 } })
    const record = await makeRecord('EVT-60001')
    const folder = await typedFolder('Campaign', campaign)
    const file = await makeFile(folder, { name: 'EVT-60001-C-02-campaign.jpg', assetTypeId: campaign.id })
    const keyless = await makeFile(folder, { name: 'moodboard.jpg', assetTypeId: campaign.id })
    // The old job linked files without a type too; no step can find them again.
    const untyped = await makeFile(await harness.makeFolder({ name: 'Unsorted' }), { name: 'EVT-60001-C-04.jpg', recordId: record.id })
    process.env.PRODUCT_MATCHING_REGEX = LEGACY
    try {
        while ((await db.query("SELECT 1 FROM migrations WHERE name = 'SingleMatching1792886400000'")).length) await db.undoLastMigration()
        await db.runMigrations()
    } finally {
        delete process.env.PRODUCT_MATCHING_REGEX
    }
    const stepsOf = async type => (await db.getRepository(AssetTypeResolverStep).findBy({ assetTypeId: type.id })).map(s => s.config)
    assert.deepEqual(await stepsOf(campaign), [{ pattern: LEGACY, keyGroup: 1, viewGroup: 2 }])
    assert.deepEqual(await stepsOf(stepped), [{ pattern: '^(OWN-\\d+)', keyGroup: 1 }], 'a type with steps keeps them')
    await runEnrichmentPass()
    assert.deepEqual([(await fileRow(file.id)).recordId, (await fileRow(file.id)).recordView, await statusOf(file.id)], [record.id, null, 'matched'])
    assert.equal(await statusOf(keyless.id), 'not_applicable', 'only a missing picture waits in To review')
    assert.deepEqual((await linksOf(untyped.id)).map(link => [link.recordId, link.strategy, link.isPrimary]), [[record.id, 'manual_file', true]])
    assert.deepEqual([(await fileRow(untyped.id)).recordId, await statusOf(untyped.id)], [record.id, 'matched'])
})

test('search shows a file once across collections and lists files covering the range of the records a query finds', async () => {
    const type = await makeType('Searchable')
    await save(RecordAttribute, { name: 'Collection', searchable: true, facetable: false, viewable: false })
    await makeRecord('RNG-1', { Collection: 'Borealis' })
    await makeRecord('RNG-2', { Collection: 'Borealis' })
    const folder = await typedFolder('Range search', type)
    const first = await makeCollection({ name: 'First', assetFolderId: folder.id })
    const second = await makeCollection({ name: 'Second' })
    const exact = await makeFile(folder, { name: 'RNG-1-front.jpg', assetTypeId: type.id })
    const range = await makeFile(folder, { name: 'borealis-banner.jpg', assetTypeId: type.id })
    const both = await makeFile(folder, { name: 'RNG-1-back.jpg', assetTypeId: type.id })
    for (const file of [exact, range, both]) await save(CollectionFile, { collectionId: first.id, assetFileId: file.id })
    await save(CollectionFile, { collectionId: second.id, assetFileId: exact.id })
    await save(AssetEntityLink, { assetFileId: range.id, targetKind: 'attribute', attributeName: 'Collection', attributeValue: 'Borealis', strategy: 'manual_file' })
    await save(AssetEntityLink, { assetFileId: both.id, targetKind: 'attribute', attributeName: 'Collection', attributeValue: 'Borealis', strategy: 'manual_file' })
    const member = caller(fixtures.member)
    const found = await member.collection.search({ query: 'RNG-1' })
    assert.deepEqual(found.results.map(file => file.name).sort(), ['RNG-1-back.jpg', 'RNG-1-front.jpg'])
    assert.equal(found.total, 2)
    assert.deepEqual([found.rangeResults.map(file => file.name), found.rangeTotal], [['borealis-banner.jpg'], 1])
    assert.equal(found.facets.assetTypes[type.id], 2)
    const all = await member.collection.rangeSearch({ query: 'RNG-1' })
    assert.deepEqual(all.results.map(file => file.name), ['borealis-banner.jpg'])
    assert.deepEqual((await member.collection.search({})).rangeResults, [])
    const draft = await makeCollection({ name: 'Hidden', draft: true })
    const hidden = await makeFile(folder, { name: 'hidden-borealis.jpg', assetTypeId: type.id })
    await save(CollectionFile, { collectionId: draft.id, assetFileId: hidden.id })
    await save(AssetEntityLink, { assetFileId: hidden.id, targetKind: 'attribute', attributeName: 'Collection', attributeValue: 'Borealis', strategy: 'manual_file' })
    assert.deepEqual((await member.collection.search({ query: 'RNG-1' })).rangeResults.map(file => file.name), ['borealis-banner.jpg'])
})

test('matching and the unmatched queue require an approved and verified admin', async () => {
    const id = randomUUID()
    for (const user of [null, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.resolverStep.list())
        await forbidden(as.resolverStep.save({ assetTypeId: id, steps: [] }))
        await forbidden(as.resolverStep.preview({ assetTypeId: id, folderId: id, steps: [] }))
        await forbidden(as.resolverStep.rerun())
        await forbidden(as.entityResolution.counts())
        await forbidden(as.entityResolution.unmatchedFolders())
        await forbidden(as.entityResolution.unmatchedFiles({}))
        await forbidden(as.entityResolution.conflicts())
        await forbidden(as.entityResolution.dangling())
        await forbidden(as.entityResolution.findTargets({ query: '' }))
        await forbidden(as.entityResolution.manualLinks())
        await forbidden(as.entityResolution.attach({ target: { kind: 'record', key: 'X' }, fileIds: [id] }))
        await forbidden(as.entityResolution.detach({ linkId: id }))
        await forbidden(as.entityResolution.fileLinks(id))
        await forbidden(as.entityResolution.createRecord({ key: 'X' }))
        await forbidden(as.record.get(id))
    }
})

test('the upgrade turns the product regex into a first step of every record-related type and backfills links from record_id', async () => {
    const type = await makeType('Seeded')
    const record = await makeRecord('EVT-50001')
    const folder = await typedFolder('Seed', type)
    const file = await makeFile(folder, { name: 'EVT-50001-C-03.jpg', assetTypeId: type.id, recordId: record.id, recordView: '03' })
    process.env.PRODUCT_MATCHING_REGEX = LEGACY
    process.env.PIM_PRODUCT_VIEW = '03'
    try {
        while ((await db.query("SELECT 1 FROM migrations WHERE name = 'EntityLinks1790640000000'")).length) await db.undoLastMigration()
        await db.runMigrations()
    } finally {
        delete process.env.PRODUCT_MATCHING_REGEX
        delete process.env.PIM_PRODUCT_VIEW
    }
    const steps = await db.getRepository(AssetTypeResolverStep).findBy({ assetTypeId: type.id })
    assert.deepEqual(steps.map(s => [s.position, s.strategy, s.config]), [[0, 'filename_regex', { pattern: LEGACY, keyGroup: 1, viewGroup: 2 }]])
    assert.deepEqual((await linksOf(file.id)).map(link => [link.recordId, link.strategy, link.isPrimary, link.resolverStepId]), [[record.id, 'filename_regex', true, steps[0].id]])
    assert.equal((await db.query('SELECT thumbnail_view FROM enrichment_settings'))[0].thumbnail_view, '03')
    const before = await db.query('SELECT id, updated_at FROM asset_entity_links WHERE asset_file_id = $1', [file.id])
    await runEnrichmentPass()
    assert.deepEqual(await db.query('SELECT id, updated_at FROM asset_entity_links WHERE asset_file_id = $1', [file.id]), before)
    assert.deepEqual([(await fileRow(file.id)).recordId, (await fileRow(file.id)).recordView, await statusOf(file.id)], [record.id, '03', 'matched'])
})

test('an admin finds a folder by its path and sees what linking it would change before linking it', async () => {
    const admin = caller(fixtures.admin)
    const photos = await makeType('Preview photos')
    const campaign = await harness.makeType('Preview campaign', { isRelatedToRecords: false })
    const root = await typedFolder('PREVIEW 100% SS25', photos)
    const shoot = await childFolder(root, 'PREVIEW SHOOT')
    const nested = await childFolder(shoot, 'PREVIEW NESTED')
    await makeRecord('PRV-1')
    await makeFile(shoot, { name: 'PRV-1.00.jpg', assetTypeId: photos.id })
    await makeFile(shoot, { name: 'mood.jpg', assetTypeId: campaign.id })
    await makeFile(nested, { name: 'mood 2.jpg', assetTypeId: campaign.id })
    await runEnrichmentPass()
    const before = await admin.entityResolution.folderPreview(shoot.id)
    assert.deepEqual([before.files, before.types.map(row => [row.type, row.files, row.linked])], [3, [['Preview campaign', 2, 0], ['Preview photos', 1, 0]]])
    assert.deepEqual([before.linkedAbove, before.subfoldersLinked], [null, 0])
    await admin.entityResolution.attach({ target: { kind: 'record', key: 'PRV-1' }, folderId: root.id })
    await admin.entityResolution.attach({ target: { kind: 'attribute', name: 'Collection', value: 'Aurora' }, folderId: nested.id })

    const found = await admin.entityResolution.folderSearch({ query: 'preview shoot' })
    assert.deepEqual(found.map(folder => [folder.id, folder.files]), [[shoot.id, 3], [nested.id, 1]])
    assert.equal((await admin.entityResolution.folderSearch({ query: '100%' }))[0].id, root.id)
    assert.deepEqual(await admin.entityResolution.folderSearch({ query: 'PREVIEW 1_0' }), [], '_ and % are characters, not wildcards')

    const preview = await admin.entityResolution.folderPreview(shoot.id)
    assert.deepEqual(preview.types.map(row => [row.type, row.files, row.linked]), [['Preview campaign', 2, 1], ['Preview photos', 1, 1]], 'the parent links every type below it, except where a nearer folder has its own link')
    assert.deepEqual(preview.linkedHere, [])
    assert.deepEqual(preview.linkedAbove, { path: (await db.getRepository(AssetFolder).findOneBy({ id: root.id })).path, target: 'PRV-1' })
    assert.equal(preview.subfoldersLinked, 1)
    await forbidden(caller(fixtures.member).entityResolution.folderPreview(shoot.id))
    await forbidden(caller(fixtures.member).entityResolution.folderSearch({ query: 'preview' }))
})
