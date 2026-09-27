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
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readdirSync } = require('node:fs')
const { writeFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { Readable } = require('node:stream')
const databaseURL = process.env.SECURITY_TEST_DATABASE_URL
assert(databaseURL, 'Set SECURITY_TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test')
const parsed = new URL(databaseURL)
assert(parsed.pathname.endsWith('_test'), 'The disposable database name must end in _test')
process.env.DOTENV_CONFIG_PATH = '/dev/null'
process.env.DATABASE_URL = databaseURL
process.env.APP_SECRET = 'security-tests-only-random-fixture-secret-20260916'
process.env.ENABLE_PASSWORD_LESS_AUTH = 'false'
const env = require('../../dist/env')
const { dataSource: db } = env
// setup() undoes every migration written after the last one of the original
// schema, seeds rows in that old shape, and runs them again, so each suite
// also checks the upgrade path. Both values follow dist/migrations.
const LEGACY_MIGRATION = 1751187976556
const migrationsDir = join(__dirname, '../../dist/migrations')
const migrationFiles = readdirSync(migrationsDir).filter(name => name.endsWith('.js')).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]))
const UPGRADE_MIGRATIONS = migrationFiles.filter(name => Number(name.split('-')[0]) > LEGACY_MIGRATION).length
const LATEST_MIGRATION = (() => {
    const migration = Object.values(require(join(migrationsDir, migrationFiles.at(-1))))[0]
    return new migration().name ?? migration.name
})()
const state = {
    disk: { totalBytes: 10000, freeBytes: 9000 },
    bucketObjects: [],
    removedKeys: [],
    uploads: [],
    fetchedFiles: [],
    sentMails: [],
    queued: [],
    processors: new Map(),
    tempFiles: [],
}
env.mainS3 = () => ({ presignedGetObject: async () => 'https://example.test/fixture', removeObjects: async () => {}, listObjects: () => Readable.from([]) })
const storage = {
    presignedGetObject: async () => 'https://example.test/fixture',
    fGetObject: async (_bucket, _key, path) => writeFile(path, 'fixture-original'),
    fPutObject: async (_bucket, key, path, metaData) => { state.uploads.push({ key, path, metaData }) },
    listObjects: (_bucket, prefix) => Readable.from(state.bucketObjects.filter(object => object.name.startsWith(prefix))),
    removeObjects: async (_bucket, keys) => { state.removedKeys.push(...keys) },
}
env.assetsS3 = () => storage
env.mainS3Bucket = () => 'fixture'
env.assetsS3Bucket = () => 'fixture'
env.assetUpdaterFor = () => ({
    fetchFileContent: async file => {
        state.fetchedFiles.push(file.id)
        const path = join(tmpdir(), `security-test-${randomUUID()}`)
        state.tempFiles.push(path)
        await writeFile(path, 'fixture-content')
        return path
    },
})
env.mailTransporter = () => ({ sendMail: async mail => { state.sentMails.push(mail) } })
env.storageQuota = () => null
env.diskUsage = async () => state.disk
env.serverAlertEmails = () => []
env.passwordBreachCheck = () => false
const entities = {
    User: require('../../dist/entity/user').User,
    Region: require('../../dist/entity/region').Region,
    Group: require('../../dist/entity/group').Group,
    UserGroup: require('../../dist/entity/user-group').UserGroup,
    Collection: require('../../dist/entity/collection').Collection,
    CollectionFile: require('../../dist/entity/collection-file').CollectionFile,
    CollectionRecord: require('../../dist/entity/collection-record').CollectionRecord,
    CollectionInvitation: require('../../dist/entity/collection-invitation').CollectionInvitation,
    AssetFolder: require('../../dist/entity/asset-folder').AssetFolder,
    AssetFile: require('../../dist/entity/asset-file').AssetFile,
    AssetType: require('../../dist/entity/asset-type').AssetType,
    AssetTypeRule: require('../../dist/entity/asset-type-rule').AssetTypeRule,
    AuthorizedDomain: require('../../dist/entity/authorized-domain').AuthorizedDomain,
    License: require('../../dist/entity/license').License,
    DataRecord: require('../../dist/entity/data-record').DataRecord,
    RecordAttribute: require('../../dist/entity/record-attribute').RecordAttribute,
    RecordChange: require('../../dist/entity/record-change').RecordChange,
    Download: require('../../dist/entity/download').Download,
    UserSession: require('../../dist/entity/user-session').UserSession,
    StorageUsage: require('../../dist/entity/storage-usage').StorageUsage,
    ActivityEvent: require('../../dist/entity/activity-event').ActivityEvent,
    LoginToken: require('../../dist/entity/login-token').LoginToken,
}
const services = {
    credentials: require('../../dist/services/credentials'),
    users: require('../../dist/services/user'),
    collections: require('../../dist/services/collection'),
    assets: require('../../dist/services/asset'),
    assetTypeRules: require('../../dist/services/asset-type-rules'),
    enrichment: require('../../dist/services/enrichment'),
    productCollections: require('../../dist/services/product-collections'),
    readiness: require('../../dist/services/record-readiness'),
    entityResolution: require('../../dist/services/entity-resolution'),
    download: require('../../dist/services/download'),
    session: require('../../dist/services/session'),
    loginToken: require('../../dist/services/login-token'),
    rateLimit: require('../../dist/services/rate-limit'),
    mfa: require('../../dist/services/mfa'),
    passwordPolicy: require('../../dist/services/password-policy'),
}
const { appRouter } = require('../../dist/trpc')
const worker = require('../../dist/worker')
const server = require('../../dist/server').default
worker.boss.start = async () => {}
worker.boss.createQueue = async () => {}
worker.boss.schedule = async () => {}
worker.boss.work = async (name, _options, callback) => state.processors.set(name, callback)
for (const [name, queue] of Object.entries(worker)) {
    if (!name.endsWith('Queue')) continue
    queue.push = async data => state.queued.push({ name, ...data })
    queue.bulkPush = async jobs => jobs.forEach(job => state.queued.push({ name, ...job.data }))
}
const { User, Region, Group, UserGroup, Collection, AssetFolder, AssetFile } = entities
const save = (entity, values) => db.getRepository(entity).save(db.getRepository(entity).create(values))
// A reply that records the cookies a procedure sets, and a request from a
// fresh address so rate limits only bite in the tests that aim for them.
const fakeReply = () => {
    const cookies = {}
    return {
        cookies,
        setCookie(name, value, options) { cookies[name] = { value, options } },
        clearCookie(name, options) { cookies[name] = { value: '', options, cleared: true } },
    }
}
const fakeRequest = (extra = {}) => ({
    headers: { 'user-agent': 'node-test' }, cookies: {},
    ip: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    ...extra,
})
const caller = (user, opts = {}) => appRouter.createCaller({
    user,
    session: opts.session ?? (user ? { id: randomUUID(), method: 'password' } : null),
    req: opts.req ?? fakeRequest(),
    res: opts.res ?? fakeReply(),
})
const fixtures = {}
const makeUser = (role = 'member', extra = {}) => save(User, {
    name: role, company: 'Test', email: `${randomUUID()}@example.test`, regionId: fixtures.region.id,
    role, approved: true, emailVerified: true, ...extra,
})
const makeCollection = extra => save(Collection, { name: randomUUID(), public: true, draft: false, ...extra })
const makeFolder = (extra = {}) => save(AssetFolder, { name: randomUUID(), status: 'up_to_date', externalId: randomUUID(), ...extra })
const makeFile = (folder, extra = {}) => save(AssetFile, {
    name: `${randomUUID()}.png`, status: 'up_to_date', externalId: randomUUID(), externalChecksum: 'c', size: '1', mimeType: 'image/png', folderId: folder.id, ...extra,
})
const { AssetType, DataRecord } = entities
const makeType = (name, extra = {}) => save(AssetType, { name, defaultDisplay: 'grid', listDisplayItems: [], ...extra })
const typedFolder = (name, type, extra = {}) => makeFolder({ name, assetTypeId: type.id, assetTypeSource: 'manual', ...extra })
const makeRecord = (key, metaData = {}) => save(DataRecord, { recordKey: key, keyColumnName: 'Code', metaData: { Code: key, ...metaData } })
const fileRow = id => db.getRepository(AssetFile).findOneByOrFail({ id })
const collectionRow = id => db.getRepository(Collection).findOneByOrFail({ id })
const productId = async recordKey => (await db.query('SELECT id FROM records WHERE record_key = $1', [recordKey]))[0].id
const downloadOptions = { imageFormat: 'original', imageResolution: 'high', videoFormat: 'original', videoResolution: 'high', licenseAccepted: true }
// A member and a file under a licence in a public collection, ready to export.
async function exportFixture() {
    const user = await makeUser()
    const license = await save(entities.License, { name: 'Export licence', scopes: [], allowedRegionIds: [fixtures.region.id] })
    const folder = await makeFolder({ name: 'Export folder', licenseId: license.id })
    const collection = await makeCollection({ assetFolderId: folder.id })
    const asset = await makeFile(folder, { name: 'fixture.png', externalChecksum: 'fixture', size: '16', mimeType: 'image/png', licenseId: license.id })
    const file = await save(entities.CollectionFile, { collectionId: collection.id, assetFileId: asset.id })
    return { user, license, file }
}
const storageRow = () => db.getRepository(entities.StorageUsage).findOneByOrFail({ id: 1 })
async function resetStorageUsage(values = {}) {
    await db.getRepository(entities.StorageUsage).update({ id: 1 }, { usedBytes: '0', reservedBytes: '0', alertLevel: 0, diskAlertLevel: 0, quotaReachedAt: null, ...values })
    state.bucketObjects = []
    state.removedKeys.length = 0
    state.sentMails.length = 0
    return storageRow()
}
// Polls until check() returns something truthy, for work that finishes after
// the call that started it.
async function waitFor(check, { timeout = 5000, interval = 20 } = {}) {
    const deadline = Date.now() + timeout
    for (;;) {
        const value = await check()
        if (value) return value
        assert(Date.now() < deadline, `condition not met within ${timeout} ms`)
        await new Promise(resolve => setTimeout(resolve, interval))
    }
}
// Connections of this database queued behind an advisory lock.
const lockWaiters = async key => (await db.query(
    `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = $1 AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    [key],
))[0].n
const forbidden = promise => assert.rejects(promise, e => ['UNAUTHORIZED', 'FORBIDDEN'].includes(e.code))
// Each setup drops and re-adds the upgrade columns, and Postgres never reuses a
// dropped column's slot. Once a table nears the 1600-column limit, the
// disposable database is recreated before the suite starts.
async function recreateIfWorn() {
    const { Client } = require('pg')
    const probe = new Client({ connectionString: databaseURL })
    await probe.connect()
    let worn
    try {
        const { rows } = await probe.query(`SELECT coalesce(max(a.attnum), 0)::int AS n FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r'`)
        worn = rows[0].n > 1400
    } finally { await probe.end() }
    if (!worn) return
    const maintenance = new URL(databaseURL)
    maintenance.pathname = '/postgres'
    const admin = new Client({ connectionString: maintenance.toString() })
    await admin.connect()
    try {
        const name = admin.escapeIdentifier(parsed.pathname.slice(1))
        await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
        await admin.query(`CREATE DATABASE ${name}`)
    } finally { await admin.end() }
}
async function setup() {
    await recreateIfWorn()
    await db.initialize()
    await worker.startQueues({ enableWorker: true })
    const applied = await db.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1')
    assert.equal(applied[0]?.name, LATEST_MIGRATION, 'the test database is behind dist/migrations: run npm run build')
    for (let i = 0; i < UPGRADE_MIGRATIONS; i++) await db.undoLastMigration()
    await db.query('TRUNCATE users, collections, pages, asset_folders, groups, regions, licenses, products, product_attributes CASCADE')
    await db.query('DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA pgboss; CREATE TABLE pgboss.job (name text, state text)')
    fixtures.group = await save(Group, { name: 'Default' })
    fixtures.region = await save(Region, { name: 'Test', defaultGroupId: fixtures.group.id })
    fixtures.legacyGuestId = randomUUID()
    await db.query(`INSERT INTO users(id,name,company,email,role,region_id,reset_password_token) VALUES($1,'Guest','Test',$2,'guest',$3,'old-reset')`, [fixtures.legacyGuestId, `${fixtures.legacyGuestId}@example.test`, fixtures.region.id])
    await save(UserGroup, { userId: fixtures.legacyGuestId, groupId: fixtures.group.id })
    const [legacyParent] = await db.query(`INSERT INTO collections(name, public, draft, limited_to_group_ids) VALUES ($1, true, false, $2) RETURNING id`, [randomUUID(), [fixtures.group.id]])
    await db.query(`UPDATE collections SET mpath = id::text || '.' WHERE id = $1::uuid`, [legacyParent.id])
    ;[fixtures.legacyChild] = await db.query(`INSERT INTO collections(name, public, draft, parent_id) VALUES ($1, true, false, $2::uuid) RETURNING id`, [randomUUID(), legacyParent.id])
    await db.query(`UPDATE collections SET mpath = $2::text || '.' || id::text || '.' WHERE id = $1::uuid`, [fixtures.legacyChild.id, legacyParent.id])
    await db.runMigrations()
    services.rateLimit.resetRateLimits()
    fixtures.admin = await makeUser('admin')
    fixtures.manager = await makeUser('manager')
    fixtures.member = await makeUser()
    fixtures.guest = await services.users.createGuestUser({ em: db.manager, email: `${randomUUID()}@example.test`, regionId: fixtures.region.id })
    return fixtures
}
async function teardown() {
    await Promise.all(state.tempFiles.splice(0).map(path => rm(path, { force: true })))
    await server.close()
    if (db.isInitialized) await db.destroy()
}
module.exports = {
    setup, teardown, env, db, entities, services, appRouter, worker, server, storage, state, fixtures, save, caller, fakeReply, fakeRequest,
    makeUser, makeCollection, makeFolder, makeFile, makeType, typedFolder, makeRecord, fileRow, collectionRow, productId, waitFor, lockWaiters, forbidden,
    downloadOptions, exportFixture, storageRow, resetStorageUsage,
    LATEST_MIGRATION, UPGRADE_MIGRATIONS,
}
