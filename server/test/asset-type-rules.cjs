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
// Folder rules give asset types by regex on the folder path; the pass after
// every sync applies them. See docs/administration/asset-types.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, state, save, caller, makeFolder, makeFile, forbidden } = harness
const { AssetFolder, AssetFile, AssetType, AssetTypeRule } = harness.entities
const { upsertFolder } = harness.services.assets
const { compileRule, resolveFolderAssetTypes, reresolveRule } = harness.services.assetTypeRules
const { runEnrichmentPass } = harness.services.enrichment
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const makeType = name => save(AssetType, { name, defaultDisplay: 'grid', listDisplayItems: [] })
const folderRow = id => db.getRepository(AssetFolder).findOneByOrFail({ id })
const fileRow = id => db.getRepository(AssetFile).findOneByOrFail({ id })
const typed = async id => { const f = await folderRow(id); return [f.assetTypeId, f.assetTypeSource, f.assetTypeRuleId] }
const rule = (id, pattern, assetTypeId, createdAt = new Date(0)) => ({ id, regex: new RegExp(pattern, 'i'), assetTypeId, createdAt })
let seq = 0
function tree(spec, parentId = null, parentPath = '', out = []) {
    for (const [name, extra, children] of spec) {
        const id = extra.id ?? `f${++seq}`
        out.push({ id, parentId, mpath: `${parentId ? out.find(f => f.id === parentId).mpath : ''}${id}.`, path: `${parentPath}/${name}`, assetTypeId: extra.assetTypeId ?? null, assetTypeSource: extra.assetTypeSource ?? null, assetTypeRuleId: extra.assetTypeRuleId ?? null })
        if (children) tree(children, id, `${parentPath}/${name}`, out)
    }
    return out
}
const pick = (resolution, id) => { const r = resolution.resolved.get(id); return [r.assetTypeId, r.assetTypeSource, r.assetTypeRuleId] }

test('a pattern must be non-empty, compile, stay under 500 characters and finish on a sample path; matching ignores case', () => {
    assert.throws(() => compileRule(''), /empty/)
    assert.throws(() => compileRule('('), /Not a valid regular expression/)
    assert.throws(() => compileRule('a'.repeat(501)), /500/)
    assert.throws(() => compileRule('^(.*\\/)*(.+\\s)*x$'), /50 ms/)
    assert.equal(compileRule('^/digital pack/').test('/DIGITAL PACK/PAMPA'), true)
})

test('the rule that starts deepest wins, and a rule starts where it first matches without interruption', () => {
    const folders = tree([['DIGITAL PACK', {}, [['PAMPA SS26', {}, [['PACKSHOTS', {}, [['FRONT', {}]]]]]]]])
    const [dp, pampa, packshots, front] = folders.map(f => f.id)
    const { resolved, changes } = resolveFolderAssetTypes(folders, [rule('A', '^/DIGITAL PACK', 'digital'), rule('B', '^/DIGITAL PACK/.*/PACKSHOTS', 'packshot')])
    assert.deepEqual(pick({ resolved }, dp), ['digital', 'rule', 'A'])
    assert.deepEqual(pick({ resolved }, pampa), ['digital', 'rule', 'A'])
    assert.deepEqual(pick({ resolved }, packshots), ['packshot', 'rule', 'B'])
    assert.deepEqual(pick({ resolved }, front), ['packshot', 'rule', 'B'])
    assert.equal(changes.length, 4)
    const catchAll = resolveFolderAssetTypes(folders, [rule('ALL', '^/', 'any'), rule('B', 'PACKSHOTS', 'packshot')])
    assert.deepEqual(pick(catchAll, pampa), ['any', 'rule', 'ALL'])
    assert.deepEqual(pick(catchAll, front), ['packshot', 'rule', 'B'])
    assert.deepEqual(catchAll.overlaps, [])
})

test('a same-level tie goes to the oldest rule, then the lowest id, and is reported as an overlap', () => {
    const folders = tree([['SHOOTS', {}, [['SS26', {}]]]])
    const young = rule('Z', '^/SHOOTS', 'young', new Date(10))
    const old = rule('Y', '^/SHOOTS', 'old', new Date(0))
    const twin = rule('X', '^/SHOOTS', 'twin', new Date(0))
    const { resolved, overlaps, wins } = resolveFolderAssetTypes(folders, [twin, old, young])
    assert.deepEqual(pick({ resolved }, folders[0].id), ['twin', 'rule', 'X'])
    assert.deepEqual(overlaps.map(o => [o.ruleId, o.otherRuleId, o.path]), [['X', 'Y', '/SHOOTS'], ['X', 'Z', '/SHOOTS'], ['X', 'Y', '/SHOOTS/SS26'], ['X', 'Z', '/SHOOTS/SS26']])
    assert.deepEqual([...wins.keys()], ['X'])
})

test('a hand-set folder is left alone and anchors its descendants; only a rule starting deeper can override below it', () => {
    const folders = tree([['SHOOTS', { assetTypeId: 'shooting', assetTypeSource: 'manual' }, [
        ['SS26', {}, [['PACKSHOTS', {}, [['FRONT', {}]]], ['LOOKS', {}]]],
    ]]])
    const [shoots, ss26, packshots, front, looks] = folders.map(f => f.id)
    const { resolved, changes } = resolveFolderAssetTypes(folders, [rule('ALL', '^/', 'any'), rule('B', 'PACKSHOTS', 'packshot')])
    assert.deepEqual(pick({ resolved }, shoots), ['shooting', 'manual', null])
    assert.deepEqual(pick({ resolved }, ss26), ['shooting', 'inherited', null])
    assert.deepEqual(pick({ resolved }, looks), ['shooting', 'inherited', null])
    assert.deepEqual(pick({ resolved }, packshots), ['packshot', 'rule', 'B'])
    assert.deepEqual(pick({ resolved }, front), ['packshot', 'rule', 'B'])
    assert.ok(!changes.some(c => c.id === shoots))
    const nested = tree([['ROOT', {}, [['A', { assetTypeId: 'hand', assetTypeSource: 'manual' }, [['B', {}]]]]]])
    const deeper = resolveFolderAssetTypes(nested, [rule('R', '^/ROOT/A', 'ruled')])
    assert.deepEqual(pick(deeper, nested[1].id), ['hand', 'manual', null])
    assert.deepEqual(pick(deeper, nested[2].id), ['hand', 'inherited', null])
})

test('without a match a folder inherits from the nearest anchor or stays untyped; a root is matched by ^/; a disabled rule is not loaded', async () => {
    const folders = tree([['NAME', {}, [['child', {}, [['grandchild', {}]]]]], ['OTHER', {}]])
    const { resolved } = resolveFolderAssetTypes(folders, [rule('R', '^/NAME$', 'named')])
    assert.deepEqual(pick({ resolved }, folders[0].id), ['named', 'rule', 'R'])
    assert.deepEqual(pick({ resolved }, folders[2].id), ['named', 'inherited', null])
    assert.deepEqual(pick({ resolved }, folders[3].id), [null, null, null])
    const stale = tree([['X', { assetTypeId: 'gone', assetTypeSource: 'rule', assetTypeRuleId: 'deleted' }]])
    assert.deepEqual(pick(resolveFolderAssetTypes(stale, []), stale[0].id), [null, null, null])
    const type = await makeType('Disabled target')
    const root = await makeFolder({ name: 'Disabled root' })
    await save(AssetTypeRule, { pattern: '^/Disabled root', assetTypeId: type.id, enabled: false })
    await runEnrichmentPass()
    assert.deepEqual(await typed(root.id), [null, null, null])
})

test('the pass stores the path, follows renames and moves, keeps a hand-set type through a move and writes nothing the second time', async () => {
    const shooting = await makeType('Shooting')
    const packshot = await makeType('Packshot')
    const root = await upsertFolder({ externalId: randomUUID(), parentExternalId: '', name: 'Library' })
    const season = await upsertFolder({ externalId: randomUUID(), parentExternalId: root.externalId, name: 'SS26' })
    const packs = await upsertFolder({ externalId: randomUUID(), parentExternalId: season.externalId, name: 'Packshots' })
    const looks = await upsertFolder({ externalId: randomUUID(), parentExternalId: season.externalId, name: 'Looks' })
    const file = await makeFile(packs)
    const lookFile = await makeFile(looks)
    await save(AssetTypeRule, { pattern: '^/Library/SS26', assetTypeId: shooting.id })
    await save(AssetTypeRule, { pattern: '/Packshots$', assetTypeId: packshot.id })
    state.fetchedFiles.length = 0
    state.uploads.length = 0
    const first = await runEnrichmentPass()
    assert.deepEqual(first, { paths: 4, folders: 3, files: 2 })
    assert.equal((await folderRow(packs.id)).path, '/Library/SS26/Packshots')
    assert.deepEqual((await typed(season.id)).slice(0, 2), [shooting.id, 'rule'])
    assert.deepEqual((await typed(packs.id)).slice(0, 2), [packshot.id, 'rule'])
    assert.deepEqual((await typed(looks.id)).slice(0, 2), [shooting.id, 'rule'])
    assert.equal((await fileRow(file.id)).assetTypeId, packshot.id)
    assert.equal((await fileRow(lookFile.id)).assetTypeId, shooting.id)
    const before = await db.query('SELECT id, updated_at FROM asset_folders ORDER BY id')
    assert.deepEqual(await runEnrichmentPass(), { paths: 0, folders: 0, files: 0 })
    assert.deepEqual(await db.query('SELECT id, updated_at FROM asset_folders ORDER BY id'), before)
    assert.deepEqual([state.fetchedFiles, state.uploads], [[], []])

    await upsertFolder({ externalId: packs.externalId, parentExternalId: season.externalId, name: 'Renamed' })
    assert.deepEqual(await runEnrichmentPass(), { paths: 1, folders: 1, files: 1 })
    assert.equal((await folderRow(packs.id)).path, '/Library/SS26/Renamed')
    assert.deepEqual((await typed(packs.id)).slice(0, 2), [shooting.id, 'rule'])
    assert.equal((await fileRow(file.id)).assetTypeId, shooting.id)

    await caller(fixtures.admin).asset.update({ id: looks.id, assetTypeId: packshot.id })
    assert.deepEqual((await typed(looks.id)).slice(0, 2), [packshot.id, 'manual'])
    await upsertFolder({ externalId: looks.externalId, parentExternalId: root.externalId, name: 'Looks' })
    assert.deepEqual((await typed(looks.id)).slice(0, 2), [packshot.id, 'manual'])
    await runEnrichmentPass()
    assert.equal((await folderRow(looks.id)).path, '/Library/Looks')
    assert.deepEqual((await typed(looks.id)).slice(0, 2), [packshot.id, 'manual'])
    assert.equal((await fileRow(lookFile.id)).assetTypeId, packshot.id)
})

test('asset.update marks the folder manual and its descendants inherited, clears the rule, and null clears the source so rules apply again', async () => {
    const type = await makeType('Manual type')
    const ruled = await makeType('Ruled type')
    const root = await makeFolder({ name: 'Hand root' })
    const child = await save(AssetFolder, { name: 'child', status: 'up_to_date', externalId: randomUUID(), parentId: root.id, parent: root })
    const file = await makeFile(child)
    const saved = await save(AssetTypeRule, { pattern: '^/Hand root', assetTypeId: ruled.id })
    await runEnrichmentPass()
    assert.deepEqual(await typed(root.id), [ruled.id, 'rule', saved.id])
    await caller(fixtures.admin).asset.update({ id: root.id, assetTypeId: type.id })
    assert.deepEqual(await typed(root.id), [type.id, 'manual', null])
    assert.deepEqual(await typed(child.id), [type.id, 'inherited', null])
    assert.equal((await fileRow(file.id)).assetTypeId, type.id)
    await runEnrichmentPass()
    assert.deepEqual(await typed(root.id), [type.id, 'manual', null])
    assert.deepEqual(await typed(child.id), [type.id, 'inherited', null])
    await caller(fixtures.admin).asset.update({ id: root.id, licenseId: null })
    assert.deepEqual(await typed(root.id), [type.id, 'manual', null])
    await caller(fixtures.admin).asset.update({ id: root.id, assetTypeId: null })
    assert.deepEqual(await typed(root.id), [null, null, null])
    assert.deepEqual(await typed(child.id), [null, null, null])
    await runEnrichmentPass()
    assert.deepEqual(await typed(root.id), [ruled.id, 'rule', saved.id])
    assert.deepEqual(await typed(child.id), [ruled.id, 'rule', saved.id])
    assert.equal((await fileRow(file.id)).assetTypeId, ruled.id)
})

test('a rule that no longer compiles is skipped with its error recorded, the others still apply, and the error clears once fixed', async () => {
    const type = await makeType('Still applied')
    const root = await makeFolder({ name: 'Broken root' })
    const broken = await save(AssetTypeRule, { pattern: '^/Broken root', assetTypeId: type.id })
    await db.query('UPDATE asset_type_rules SET pattern = $2 WHERE id = $1', [broken.id, '('])
    const fine = await save(AssetTypeRule, { pattern: '^/Broken root$', assetTypeId: type.id })
    await runEnrichmentPass()
    assert.match((await db.getRepository(AssetTypeRule).findOneByOrFail({ id: broken.id })).lastError, /Not a valid regular expression/)
    assert.deepEqual(await typed(root.id), [type.id, 'rule', fine.id])
    await db.query('UPDATE asset_type_rules SET pattern = $2 WHERE id = $1', [broken.id, '^/Broken root'])
    await runEnrichmentPass()
    assert.equal((await db.getRepository(AssetTypeRule).findOneByOrFail({ id: broken.id })).lastError, null)
})

test('an edited rule changes nothing until a pass runs; re-applying one rule leaves another edited rule waiting', async () => {
    const a = await makeType('Type A')
    const b = await makeType('Type B')
    const rootA = await makeFolder({ name: 'Scope A' })
    const childA = await save(AssetFolder, { name: 'inside', status: 'up_to_date', externalId: randomUUID(), parentId: rootA.id, parent: rootA })
    const rootB = await makeFolder({ name: 'Scope B' })
    const ruleA = await save(AssetTypeRule, { pattern: '^/Scope A$', assetTypeId: a.id })
    const ruleB = await save(AssetTypeRule, { pattern: '^/Scope B', assetTypeId: b.id })
    await runEnrichmentPass()
    assert.deepEqual(await typed(childA.id), [a.id, 'inherited', null])
    await db.query('UPDATE asset_type_rules SET asset_type_id = $2 WHERE id = $1', [ruleA.id, b.id])
    await db.query('UPDATE asset_type_rules SET asset_type_id = $2 WHERE id = $1', [ruleB.id, a.id])
    assert.deepEqual(await typed(rootA.id), [a.id, 'rule', ruleA.id])
    assert.deepEqual(await reresolveRule(ruleA.id), { folders: 2, files: 0 })
    assert.deepEqual(await typed(rootA.id), [b.id, 'rule', ruleA.id])
    assert.deepEqual(await typed(childA.id), [b.id, 'inherited', null])
    assert.deepEqual(await typed(rootB.id), [b.id, 'rule', ruleB.id])
    await runEnrichmentPass()
    assert.deepEqual(await typed(rootB.id), [a.id, 'rule', ruleB.id])
})

test('the router validates the pattern as a field error, refuses duplicates, lists counts, examples and overlaps, previews what a save would change and applies on save', async () => {
    const admin = caller(fixtures.admin)
    const packshot = await makeType('Router packshot')
    const other = await makeType('Router other')
    const root = await makeFolder({ name: 'Router root' })
    const inner = await save(AssetFolder, { name: 'Shots', status: 'up_to_date', externalId: randomUUID(), parentId: root.id, parent: root })
    const file = await makeFile(inner)
    await runEnrichmentPass()
    await assert.rejects(admin.assetTypeRule.create({ pattern: '(', assetTypeId: packshot.id }), e => /Not a valid regular expression/.test(e.cause?.issues?.[0]?.message ?? e.message))
    await assert.rejects(admin.assetTypeRule.create({ pattern: '^/Router root', assetTypeId: randomUUID() }), e => e.code === 'NOT_FOUND')
    const preview = await admin.assetTypeRule.preview({ pattern: '^/Router root', assetTypeId: packshot.id })
    assert.equal(preview.matches, 2)
    assert.deepEqual(preview.examples, ['/Router root', '/Router root/Shots'])
    assert.deepEqual(preview.changes, { folders: 2, files: 1, groups: [{ count: 2, assetTypeName: null, source: null, rulePattern: null }] })
    const created = await admin.assetTypeRule.create({ pattern: '^/Router root', assetTypeId: packshot.id })
    assert.deepEqual(created.applied, { folders: 2, files: 1 })
    assert.equal(created.rule.createdById, fixtures.admin.id)
    assert.equal((await fileRow(file.id)).assetTypeId, packshot.id)
    await assert.rejects(admin.assetTypeRule.create({ pattern: '^/Router root', assetTypeId: other.id }), e => e.code === 'BAD_REQUEST' && /already exists/.test(e.message))
    const override = await admin.assetTypeRule.preview({ pattern: 'Shots$', assetTypeId: other.id })
    assert.deepEqual(override.changes, { folders: 1, files: 1, groups: [{ count: 1, assetTypeName: 'Router packshot', source: 'rule', rulePattern: '^/Router root' }] })
    await admin.asset.update({ id: inner.id, assetTypeId: packshot.id })
    const manual = await admin.assetTypeRule.preview({ pattern: 'Shots$', assetTypeId: other.id })
    assert.deepEqual(manual.changes, { folders: 0, files: 0, groups: [{ count: 1, assetTypeName: 'Router packshot', source: 'manual', rulePattern: null }] })
    const twin = await admin.assetTypeRule.create({ pattern: '^/Router root$', assetTypeId: other.id })
    const listed = await admin.assetTypeRule.list()
    const mine = listed.rules.find(r => r.id === created.rule.id)
    assert.deepEqual([mine.folders, mine.examples, mine.overlaps, mine.lastError], [2, ['/Router root', '/Router root/Shots'], [twin.rule.id], null])
    const twinListed = listed.rules.find(r => r.id === twin.rule.id)
    assert.deepEqual([twinListed.folders, twinListed.overlaps], [0, [created.rule.id]])
    assert.deepEqual(await typed(root.id), [packshot.id, 'rule', created.rule.id])
    const updated = await admin.assetTypeRule.update({ id: twin.rule.id, pattern: '^/Router root$', assetTypeId: packshot.id, enabled: false })
    assert.deepEqual([updated.rule.enabled, updated.applied], [false, { folders: 0, files: 0 }])
    assert.deepEqual(await typed(root.id), [packshot.id, 'rule', created.rule.id])
    assert.deepEqual(await admin.assetTypeRule.reresolve(created.rule.id), { folders: 0, files: 0 })
    await admin.assetTypeRule.remove(created.rule.id)
    assert.deepEqual(await typed(root.id), [packshot.id, 'rule', null])
    await runEnrichmentPass()
    assert.deepEqual(await typed(root.id), [null, null, null])
    assert.deepEqual(await typed(inner.id), [packshot.id, 'manual', null])
    await admin.assetType.remove(packshot.id)
    assert.equal(await db.getRepository(AssetTypeRule).countBy({ id: twin.rule.id }), 0)
})

test('folder rules require an approved and verified admin', async () => {
    const type = await makeType('Guarded')
    const input = { pattern: '^/Guarded', assetTypeId: type.id }
    for (const user of [null, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        await forbidden(caller(user).assetTypeRule.list())
        await forbidden(caller(user).assetTypeRule.preview(input))
        await forbidden(caller(user).assetTypeRule.create(input))
        await forbidden(caller(user).assetTypeRule.update({ id: randomUUID(), ...input }))
        await forbidden(caller(user).assetTypeRule.remove(randomUUID()))
        await forbidden(caller(user).assetTypeRule.reresolve(randomUUID()))
    }
})
