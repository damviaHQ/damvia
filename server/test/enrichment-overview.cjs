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
// The overview of data enrichment and the record of each pass. See
// docs/administration/records.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeFolder, makeFile, waitFor, lockWaiters, forbidden } = harness
const { AssetType } = harness.entities
const { runEnrichmentPass } = harness.services.enrichment
const { ENRICHMENT_LOCK } = harness.services.assetTypeRules
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const runs = () => db.query('SELECT trigger, started_by_id, finished_at IS NOT NULL AS finished, stats IS NOT NULL AS has_stats, error FROM enrichment_runs ORDER BY started_at DESC')

test('the overview says whether anything is synced, and a pass is recorded with the counts of each stage', async () => {
    const admin = caller(fixtures.admin)
    const empty = await admin.enrichment.overview()
    const [{ folders }] = await db.query('SELECT count(*)::int AS folders FROM asset_folders')
    assert.deepEqual([empty.synced, empty.running], [folders > 0, null])
    const badges = await admin.enrichment.badges()
    const type = await save(AssetType, { name: 'Overview', defaultDisplay: 'grid', listDisplayItems: [], isRelatedToRecords: true })
    const folder = await makeFolder({ name: 'Overview', assetTypeId: type.id, assetTypeSource: 'manual' })
    await makeFile(folder, { name: 'nothing-to-match.jpg', assetTypeId: type.id })
    await makeFolder({ name: 'Untyped' })
    await runEnrichmentPass()
    const [run] = await runs()
    assert.deepEqual([run.trigger, run.started_by_id, run.finished, run.has_stats, run.error], ['sync', null, true, true, null])
    const overview = await admin.enrichment.overview()
    assert.equal(overview.synced, true)
    assert.deepEqual(Object.keys(overview).sort(), ['lastRun', 'running', 'synced'])
    const [latest] = await db.query('SELECT id, started_at, finished_at FROM enrichment_runs ORDER BY started_at DESC LIMIT 1')
    assert.equal(overview.lastRun.id, latest.id)
    assert.equal(overview.lastRun.trigger, 'sync')
    assert.equal(overview.lastRun.durationMs, latest.finished_at.getTime() - latest.started_at.getTime())
    assert.deepEqual(Object.keys(overview.lastRun.stats).sort(), ['assetTypes', 'entities', 'families', 'metadata', 'productRules', 'readiness', 'variants'])
    assert.deepEqual(await admin.enrichment.badges(), { unmatched: badges.unmatched + 1, unnamedAxes: badges.unnamedAxes })
})

test('a pass that fails is recorded with its error, and only the last 50 passes are kept', async () => {
    await db.query('ALTER TABLE variant_grouping_settings RENAME TO variant_grouping_settings_away')
    try {
        await assert.rejects(runEnrichmentPass())
    } finally {
        await db.query('ALTER TABLE variant_grouping_settings_away RENAME TO variant_grouping_settings')
    }
    const [failed] = await runs()
    assert.deepEqual([failed.finished, failed.has_stats], [true, false])
    assert.match(failed.error, /variant_grouping_settings/)
    assert.equal((await caller(fixtures.admin).enrichment.overview()).lastRun.error, failed.error)
    await db.query("INSERT INTO enrichment_runs (trigger, started_at, finished_at) SELECT 'sync', now() - make_interval(mins => g), now() FROM generate_series(1, 60) g")
    await runEnrichmentPass()
    assert.equal((await runs()).length, 50)
})

test('while a pass runs the overview says since when, and Run now queues the next one', async () => {
    const admin = caller(fixtures.admin)
    const holder = db.createQueryRunner()
    await holder.connect()
    await holder.query('SELECT pg_advisory_lock($1)', [ENRICHMENT_LOCK])
    let released = false
    try {
        const overview = await admin.enrichment.overview()
        assert.notEqual(overview.running, null)
        const before = (await runs()).length
        assert.deepEqual(await admin.enrichment.run(), { queued: true })
        await waitFor(async () => await lockWaiters(ENRICHMENT_LOCK) === 1)
        assert.equal((await runs()).length, before, 'the queued pass waits for the lock before it is recorded')
        await holder.query('SELECT pg_advisory_unlock($1)', [ENRICHMENT_LOCK])
        released = true
        await waitFor(async () => (await runs()).some((run) => run.trigger === 'admin' && run.finished))
        const [latest] = await runs()
        assert.deepEqual([latest.trigger, latest.started_by_id, latest.finished], ['admin', fixtures.admin.id, true])
        assert.equal((await admin.enrichment.overview()).running, null)
    } finally {
        if (!released) await holder.query('SELECT pg_advisory_unlock($1)', [ENRICHMENT_LOCK])
        await holder.release()
    }
})

test('the overview, Run now and the menu badges require an approved and verified admin', async () => {
    for (const user of [null, fixtures.member, fixtures.manager, { ...fixtures.admin, approved: false }, { ...fixtures.admin, emailVerified: false }]) {
        await forbidden(caller(user).enrichment.overview())
        await forbidden(caller(user).enrichment.run())
        await forbidden(caller(user).enrichment.badges())
    }
})
