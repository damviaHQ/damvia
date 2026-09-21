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
// Variants of one creative are grouped per folder and asset type. See
// docs/administration/variants.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeCollection, makeFolder, makeFile, forbidden } = harness
const { AssetFile, AssetType, CollectionFile } = harness.entities
const grouping = require('../dist/services/variant-grouping')
const axes = require('../dist/services/variant-axes')
const { runEnrichmentPass } = harness.services.enrichment
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const blocked = new Set(['v2', 'final', 'img', 'dsc'])
const settings = { minPrefixLength: 4, blocked }
const none = () => ({ excluded: new Set(), forced: [], covers: new Map() })
let counter = 0
const file = (name, extra = {}) => ({ id: `f${String(++counter).padStart(4, '0')}`, name, folderId: 'folder', assetTypeId: 'type', hasThumbnail: true, mimeType: 'image/jpeg', width: 100, height: 100, spans: [], ...extra })
const summary = groups => groups.map(g => [g.displayName, g.members.length, g.columns]).sort((a, b) => a[0].localeCompare(b[0]))
const makeType = (name, extra = {}) => save(AssetType, { name, defaultDisplay: 'grid', listDisplayItems: [], groupVariants: true, ...extra })
const typedFolder = (name, type) => makeFolder({ name, assetTypeId: type.id, assetTypeSource: 'manual' })
const groupRows = () => db.query('SELECT g.id, g.display_name, g.member_count, g.cover_asset_file_id, g.prefix_key FROM variant_groups g ORDER BY g.display_name, g.prefix_key')

test('the tokenizer drops the extension, splits on _ - space and dot, lowercases, turns a matched key into one token and refuses blocked words', () => {
    assert.deepEqual(grouping.tokenizeFileName('Pampa_Banner-9x16 EN.v1.jpg', [], blocked).map(t => [t.text, t.original, t.opaque]), [['pampa', 'Pampa', false], ['banner', 'Banner', false], ['9x16', '9x16', false], ['en', 'EN', false], ['v1', 'v1', false]])
    assert.deepEqual(grouping.tokenizeFileName('77374-228_01.jpg', [[0, 9]], blocked).map(t => [t.text, t.opaque]), [['#77374-228', true], ['01', false]])
    assert.equal(grouping.tokenizeFileName('banner_final.jpg', [], blocked), null)
    assert.equal(grouping.tokenizeFileName('IMG_0001.JPG', [], blocked), null)
})

test('banners and teasers: one group per creative, an axis per varying position, and a group of one is no group', () => {
    const files = ['banner_1x1_en.jpg', 'banner_1x1_fr.jpg', 'banner_9x16_en.jpg', 'teaser_15s.mp4', 'teaser_30s.mp4', 'poster.jpg'].map(name => file(name))
    assert.deepEqual(summary(grouping.groupFolder(files, settings, none())), [
        ['banner', 3, [['1x1', '9x16'], ['en', 'fr']]],
        ['teaser', 2, [['15s', '30s']]],
    ])
    assert.deepEqual(summary(grouping.groupFolder([file('banner_1x1.jpg')], settings, none())), [])
})

test('matched keys keep SKUs apart, short and numeric prefixes are no creative, and two creatives under one word split when both have two files', () => {
    const skus = [file('77374-228_01.jpg', { spans: [[0, 9]] }), file('77374-229_01.jpg', { spans: [[0, 9]] })]
    assert.deepEqual(summary(grouping.groupFolder(skus, settings, none())), [])
    assert.deepEqual(summary(grouping.groupFolder(skus.map(f => ({ ...f, spans: [] })), settings, none())), [['77374', 2, [['228', '229']]]])
    assert.deepEqual(summary(grouping.groupFolder(Array.from({ length: 24 }, (_, i) => file(`${String(i + 1).padStart(2, '0')}.jpg`)), settings, none())), [])
    assert.deepEqual(summary(grouping.groupFolder([file('ab_1.jpg'), file('ab_2.jpg')], settings, none())), [])
    assert.deepEqual(summary(grouping.groupFolder([file('sale_1.jpg'), file('sale_2.jpg')], settings, none())), [['sale', 2, [['1', '2']]]])
    assert.deepEqual(summary(grouping.groupFolder(['pampa_campaign_a.jpg', 'pampa_campaign_b.jpg', 'pampa_teaser_a.jpg', 'pampa_teaser_b.jpg'].map(n => file(n)), settings, none())), [
        ['pampa campaign', 2, [['a', 'b']]], ['pampa teaser', 2, [['a', 'b']]],
    ])
    // Pinned: with one file on each side of "sale", the creatives stay one group; the admin splits by hand.
    assert.deepEqual(summary(grouping.groupFolder(['sale_fr.jpg', 'sale_de.jpg', 'sale_banner_16x9.jpg', 'sale_banner_9x16.jpg'].map(n => file(n)), settings, none())), [
        ['sale', 4, [['banner', 'de', 'fr'], ['', '16x9', '9x16']]],
    ])
})

test('mixed types and uneven names group, only the extension can be the axis, and overrides force, exclude and pick the cover', () => {
    const mixed = [file('hero_16x9.mp4', { mimeType: 'video/mp4' }), file('hero_16x9.jpg'), file('hero.png', { hasThumbnail: false })]
    const [hero] = grouping.groupFolder(mixed, settings, none())
    assert.deepEqual([hero.displayName, hero.columns, hero.members.map(m => m.axisValues)], ['hero', [['', '16x9']], [[''], ['16x9'], ['16x9']]])
    assert.equal(hero.coverFileId, mixed[1].id)
    const [formats] = grouping.groupFolder([file('logo_main.png'), file('logo_main.svg')], settings, none())
    assert.deepEqual(formats.columns, [['png', 'svg']])
    const files = ['visual_a.jpg', 'visual_b.jpg', 'visual_c.jpg', 'odd.jpg'].map(n => file(n))
    const forced = { excluded: new Set([files[2].id]), forced: [{ id: 'o1', fileIds: [files[1].id, files[3].id] }], covers: new Map() }
    assert.deepEqual(grouping.groupFolder(files, settings, forced).map(g => [g.prefixKey, g.members.map(m => m.fileId)]), [['override:o1', [files[3].id, files[1].id]]])
    const covered = { ...none(), covers: new Map([[files[2].id, 'c1']]) }
    assert.equal(grouping.groupFolder(files.slice(0, 3), settings, covered)[0].coverFileId, files[2].id)
    assert.equal(grouping.chooseCover([file('b.jpg', { width: 10, height: 10 }), file('a.jpg', { width: 10, height: 10 })]), `f${String(counter).padStart(4, '0')}`)
})

test('5,000 names in one folder group within a second', () => {
    const files = Array.from({ length: 5000 }, (_, i) => file(`campaign${Math.floor(i / 20)}_${['1x1', '9x16', '16x9', '4x5'][i % 4]}_${['en', 'fr', 'de', 'es', 'it'][Math.floor(i / 4) % 5]}.jpg`))
    const started = performance.now()
    const groups = grouping.groupFolder(files, settings, none())
    assert.ok(performance.now() - started < 1000)
    assert.equal(groups.length, 250)
    assert.equal(groups.reduce((total, g) => total + g.members.length, 0), 5000)
})

test('recognizers name a column only when every value matches, and a column reuses the smallest then oldest axis holding all its values', () => {
    assert.equal(axes.recognizeAxis(['1080x1080', '1920x1080']), 'dimension')
    assert.equal(axes.recognizeAxis(['1x1', '9x16', '']), 'ratio')
    assert.equal(axes.recognizeAxis(['15s', '30s']), 'duration')
    assert.equal(axes.recognizeAxis(['en', 'fr', 'pt']), 'language')
    assert.equal(axes.recognizeAxis(['1080x1080', 'en']), null)
    assert.equal(axes.recognizeAxis(['a', 'b']), null)
    const old = { id: 'b', values: ['de', 'en', 'fr'], createdAt: new Date(1) }
    const small = { id: 'a', values: ['en', 'fr'], createdAt: new Date(2) }
    const twin = { id: 'c', values: ['en', 'fr'], createdAt: new Date(3) }
    assert.equal(axes.attachToExistingAxis(['en', 'fr'], [old, twin, small]).id, 'a')
    assert.equal(axes.attachToExistingAxis(['de', ''], [old, small]).id, 'b')
    assert.equal(axes.attachToExistingAxis(['es'], [old, small]), null)
})

test('the pass groups files of types that ask for it, keeps group ids and writes nothing the second time, and dissolves a group left with one file', async () => {
    const type = await makeType('Web banners')
    const plain = await makeType('Packshots', { groupVariants: false })
    const folder = await typedFolder('Banners', type)
    const other = await typedFolder('Packshots', plain)
    const names = ['summer_1x1_en.jpg', 'summer_1x1_fr.jpg', 'summer_9x16_en.jpg', 'summer_9x16_fr.jpg', 'promo_15s.mp4', 'promo_30s.mp4']
    const files = []
    for (const name of names) files.push(await makeFile(folder, { name, assetTypeId: type.id, mimeType: name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg', hasThumbnail: true }))
    await makeFile(other, { name: 'shoe_01.jpg', assetTypeId: plain.id })
    await makeFile(other, { name: 'shoe_02.jpg', assetTypeId: plain.id })
    const first = (await runEnrichmentPass()).variants
    assert.deepEqual([first.groupsAdded, first.axesCreated], [2, 3])
    const groups = await groupRows()
    assert.deepEqual(groups.map(g => [g.display_name, g.member_count]), [['promo', 2], ['summer', 4]])
    assert.equal(groups[1].cover_asset_file_id, files[0].id)
    const named = await db.query('SELECT name, "values", recognizer FROM variant_axes ORDER BY created_at')
    assert.deepEqual(named.map(a => [a.name, a.values, a.recognizer]), [['Ratio', ['1x1', '9x16'], 'ratio'], ['Language', ['en', 'fr'], 'language'], ['Duration', ['15s', '30s'], 'duration']])
    const second = (await runEnrichmentPass()).variants
    assert.deepEqual([second.groupsAdded, second.groupsRemoved, second.membersWritten, second.axesCreated, second.axesRemoved], [0, 0, 0, 0, 0])
    assert.deepEqual(await groupRows(), groups)
    await db.getRepository(AssetFile).delete({ id: files[5].id })
    await runEnrichmentPass()
    assert.deepEqual((await groupRows()).map(g => g.display_name), ['summer'])
    assert.equal((await db.query("SELECT count(*)::int AS n FROM variant_axes WHERE name = 'Duration'"))[0].n, 1)
    await db.query("UPDATE variant_axes SET name = NULL WHERE name = 'Duration'")
    await runEnrichmentPass()
    assert.equal((await db.query("SELECT count(*)::int AS n FROM variant_axes WHERE \"values\" = '{15s,30s}'"))[0].n, 0)
})

test('search collapses a group into its cover only when asked, counts it once, filters and counts by axis value, and hides members a reader cannot see', async () => {
    const type = await makeType('Social visuals')
    const folder = await typedFolder('Social', type)
    const collection = await makeCollection({ name: 'Social', assetFolderId: folder.id })
    const draft = await makeCollection({ name: 'Social drafts', draft: true })
    const files = []
    for (const name of ['launch_1x1_en.jpg', 'launch_1x1_de.jpg', 'launch_9x16_en.jpg', 'launch_9x16_de.jpg', 'solo.jpg']) {
        const created = await makeFile(folder, { name, assetTypeId: type.id, hasThumbnail: true })
        files.push(created)
        await save(CollectionFile, { collectionId: name === 'launch_9x16_de.jpg' ? draft.id : collection.id, assetFileId: created.id })
    }
    await runEnrichmentPass()
    const member = caller(fixtures.member)
    const scope = { collectionId: collection.id, searchScope: 'current' }
    const flat = await member.collection.search(scope)
    assert.deepEqual([flat.total, flat.results.every(f => f.variantGroup === null)], [4, true])
    const collapsed = await member.collection.search({ ...scope, collapseVariants: true })
    assert.deepEqual(collapsed.results.map(f => f.name).sort(), ['launch_1x1_de.jpg', 'solo.jpg'])
    assert.equal(collapsed.total, 2)
    const card = collapsed.results.find(f => f.variantGroup)
    assert.deepEqual([card.variantGroup.displayName, card.variantGroup.memberCount, card.variantGroup.status], ['launch', 3, 'up_to_date'])
    const language = (await member.variantAxis.listFacets()).find(a => a.values.includes('de'))
    assert.deepEqual(collapsed.facets.variantAxes[language.id], { de: 1, en: 2 })
    const german = await member.collection.search({ ...scope, collapseVariants: true, variantAxes: { [language.id]: ['de'] } })
    assert.deepEqual(german.results.map(f => f.name), ['launch_1x1_de.jpg'])
    const detail = await member.variantGroup.findById(card.variantGroup.id)
    assert.deepEqual(detail.members.map(m => [m.name, m.axisValues]), [['launch_1x1_de.jpg', ['1x1', 'de']], ['launch_1x1_en.jpg', ['1x1', 'en']], ['launch_9x16_en.jpg', ['9x16', 'en']]])
    assert.deepEqual(detail.axes.map(a => a.label), ['Ratio', 'Language'])
    assert.deepEqual(detail.overrides, [])
    const admin = await caller(fixtures.admin).variantGroup.findById(card.variantGroup.id)
    assert.equal(admin.memberCount, 4)
    await assert.rejects(caller(fixtures.guest).variantGroup.findById(card.variantGroup.id), e => e.code === 'NOT_FOUND')
})

test('an admin splits, excludes, sets the cover and undoes it; renames, merges and ignores axes; and changes the settings', async () => {
    const admin = caller(fixtures.admin)
    const type = await makeType('Editable')
    const folder = await typedFolder('Editable', type)
    const files = []
    const collection = await makeCollection({ name: 'Editable', assetFolderId: folder.id })
    for (const name of ['visual_a_en.jpg', 'visual_a_fr.jpg', 'visual_b_en.jpg', 'visual_b_fr.jpg', 'visual_c_en.jpg']) {
        files.push(await makeFile(folder, { name, assetTypeId: type.id, hasThumbnail: true }))
        await save(CollectionFile, { collectionId: collection.id, assetFileId: files[files.length - 1].id })
    }
    await runEnrichmentPass()
    const groupOf = async fileId => (await db.query('SELECT variant_group_id FROM variant_group_members WHERE asset_file_id = $1', [fileId]))[0]?.variant_group_id ?? null
    const kv = await groupOf(files[0].id)
    assert.equal((await groupRows()).find(g => g.id === kv).member_count, 5)
    await admin.variantGroup.setCover({ groupId: kv, assetFileId: files[3].id })
    assert.equal((await groupRows()).find(g => g.id === kv).cover_asset_file_id, files[3].id)
    await admin.variantGroup.forceGroup({ assetFileIds: [files[2].id, files[3].id] })
    const forced = await groupOf(files[2].id)
    assert.notEqual(forced, kv)
    assert.equal((await groupRows()).find(g => g.id === forced).prefix_key.startsWith('override:'), true)
    assert.equal((await admin.variantGroup.findById(forced)).forced, true)
    await admin.variantGroup.exclude({ assetFileIds: [files[4].id] })
    assert.equal(await groupOf(files[4].id), null)
    const overrides = await admin.variantGroup.listOverrides()
    assert.deepEqual(overrides.map(o => [o.kind, o.fileNames.length]).sort(), [['cover', 1], ['exclude', 1], ['force_group', 2]])
    for (const override of overrides) await admin.variantGroup.undoOverride(override.id)
    const restored = await groupOf(files[2].id)
    assert.deepEqual((await groupRows()).filter(g => g.id === restored).map(g => [g.display_name, g.member_count]), [['visual', 5]])
    await assert.rejects(admin.variantGroup.forceGroup({ assetFileIds: [files[0].id, (await makeFile(await makeFolder({ name: 'Elsewhere' }), { name: 'visual_z.jpg' })).id] }), e => /one folder and one asset type/.test(e.message))
    const list = await admin.variantAxis.list()
    const language = list.find(a => a.name === 'Language')
    await admin.variantAxis.rename({ id: language.id, name: 'Market language' })
    await runEnrichmentPass()
    assert.ok((await admin.variantAxis.list()).some(a => a.name === 'Market language'))
    const extra = await db.query(`INSERT INTO variant_axes (name, "values") VALUES (NULL, '{es,it}') RETURNING id`)
    await admin.variantAxis.merge({ fromId: extra[0].id, intoId: language.id })
    assert.deepEqual((await admin.variantAxis.list()).find(a => a.id === language.id).values, ['en', 'es', 'fr', 'it'])
    await admin.variantAxis.ignore({ id: language.id, ignored: true })
    assert.ok(!(await caller(fixtures.member).variantAxis.listFacets()).some(a => a.id === language.id))
    await runEnrichmentPass()
    assert.ok((await admin.variantAxis.list()).some(a => a.id === language.id && a.ignored))
    await admin.variantAxis.updateSettings({ minPrefixLength: 4, blockedTokens: ['visual'] })
    assert.equal(await groupOf(files[0].id), null)
    await assert.rejects(admin.variantAxis.updateSettings({ minPrefixLength: 4, blockedTokens: ['two words'] }), e => e.code === 'BAD_REQUEST')
    await admin.variantAxis.updateSettings({ minPrefixLength: 4, blockedTokens: ['v2', 'v3', 'final', 'ok', 'old', 'new', 'copy', 'img', 'dsc'] })
    await admin.assetType.update({ id: type.id, name: type.name, defaultDisplay: 'grid', listDisplayItems: [], groupVariants: false })
    assert.equal(await groupOf(files[0].id), null)
})

test('variant groups and axes have their guards', async () => {
    const id = randomUUID()
    for (const user of [null, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        const as = caller(user)
        await forbidden(as.variantGroup.setCover({ groupId: id, assetFileId: id }))
        await forbidden(as.variantGroup.forceGroup({ assetFileIds: [id, randomUUID()] }))
        await forbidden(as.variantGroup.exclude({ assetFileIds: [id] }))
        await forbidden(as.variantGroup.listOverrides())
        await forbidden(as.variantGroup.undoOverride(id))
        await forbidden(as.variantAxis.list())
        await forbidden(as.variantAxis.rename({ id, name: 'x' }))
        await forbidden(as.variantAxis.merge({ fromId: id, intoId: randomUUID() }))
        await forbidden(as.variantAxis.ignore({ id, ignored: true }))
        await forbidden(as.variantAxis.settings())
        await forbidden(as.variantAxis.updateSettings({ minPrefixLength: 4, blockedTokens: [] }))
    }
    for (const user of [null, { ...fixtures.member, approved: false }, { ...fixtures.member, emailVerified: false }]) {
        await forbidden(caller(user).variantGroup.findById(id))
        await forbidden(caller(user).variantAxis.listFacets())
    }
})
