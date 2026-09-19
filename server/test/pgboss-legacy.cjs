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
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, db, worker } = require('./lib/helpers.cjs')

before(setup)
after(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${worker.LEGACY_PGBOSS_SCHEMA} CASCADE`)
    await teardown()
})

// Mimics the tables pg-boss 10.2 left behind (schema version 24).
async function seedLegacySchema(version = 24) {
    await db.query('DROP SCHEMA IF EXISTS pgboss CASCADE')
    await db.query(`DROP SCHEMA IF EXISTS ${worker.LEGACY_PGBOSS_SCHEMA} CASCADE`)
    await db.query('CREATE SCHEMA pgboss')
    await db.query('CREATE TABLE pgboss.version (version int primary key)')
    await db.query('INSERT INTO pgboss.version VALUES ($1)', [version])
    await db.query(`CREATE TABLE pgboss.job (id uuid default gen_random_uuid(), name text, data jsonb, state text, singleton_key text, created_on timestamptz default now())`)
}

test('a pg-boss 10 schema is retired and only its pending jobs are replayed', async () => {
    await seedLegacySchema()
    await db.query(`INSERT INTO pgboss.job (name, data, state, singleton_key) VALUES
        ('download/create-archive', '{"downloadId":"d1"}', 'created', null),
        ('download/create-archive', '{"downloadId":"d2"}', 'retry', 'd2'),
        ('download/create-archive', '{"downloadId":"d0"}', 'completed', null),
        ('asset/process-deletion', '{}', 'created', null),
        ('mailer/log-in', '{"userId":"u1"}', 'active', null)`)
    assert.equal(await worker.installedPgBossVersion(), 24)
    assert.equal(await worker.retireLegacyPgBossSchema(), true)
    assert.equal(await worker.installedPgBossVersion(), null)
    const schemas = await db.query(`SELECT nspname FROM pg_namespace WHERE nspname IN ('pgboss', $1)`, [worker.LEGACY_PGBOSS_SCHEMA])
    assert.deepEqual(schemas.map(row => row.nspname), [worker.LEGACY_PGBOSS_SCHEMA])

    const inserted = []
    const replayed = await worker.replayLegacyPgBossJobs(['download/create-archive', 'mailer/log-in'], { insert: async (name, jobs) => { inserted.push([name, jobs]) } })
    assert.deepEqual(replayed, { 'download/create-archive': 2 })
    assert.deepEqual(inserted, [['download/create-archive', [
        { data: { downloadId: 'd1' }, retryBackoff: true, singletonKey: undefined },
        { data: { downloadId: 'd2' }, retryBackoff: true, singletonKey: 'd2' },
    ]]])
})

test('a second boot is a no-op and a current schema is left alone', async () => {
    assert.equal(await worker.retireLegacyPgBossSchema(), false)
    await seedLegacySchema(42)
    assert.equal(await worker.retireLegacyPgBossSchema(), false)
    assert.equal(await worker.installedPgBossVersion(), 42)
})

test('an existing legacy schema stops the boot with an actionable error', async () => {
    await seedLegacySchema(24)
    await db.query(`CREATE SCHEMA ${worker.LEGACY_PGBOSS_SCHEMA}`)
    await assert.rejects(worker.retireLegacyPgBossSchema(), /pgboss_legacy_v10 already exists/)
    assert.equal(await worker.installedPgBossVersion(), 24)
})
