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
const { writeFile } = require('node:fs/promises')
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
const LATEST_MIGRATION = 'ActivityEvents1789948800000'
const UPGRADE_MIGRATIONS = 6
const state = {
    disk: { totalBytes: 10000, freeBytes: 9000 },
    bucketObjects: [],
    removedKeys: [],
    uploads: [],
    fetchedFiles: [],
    sentMails: [],
    queued: [],
    processors: new Map(),
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
env.assetUpdater = () => ({
    fetchFileContent: async file => {
        state.fetchedFiles.push(file.id)
        const path = join(tmpdir(), `security-test-${randomUUID()}`)
        await writeFile(path, 'fixture-content')
        return path
    },
})
env.mailTransporter = () => ({ sendMail: async mail => { state.sentMails.push(mail) } })
env.storageQuota = () => null
env.diskUsage = async () => state.disk
env.serverAlertEmails = () => []
const entities = {
    User: require('../../dist/entity/user').User,
    Region: require('../../dist/entity/region').Region,
    Group: require('../../dist/entity/group').Group,
    UserGroup: require('../../dist/entity/user-group').UserGroup,
    Collection: require('../../dist/entity/collection').Collection,
    CollectionFile: require('../../dist/entity/collection-file').CollectionFile,
    CollectionInvitation: require('../../dist/entity/collection-invitation').CollectionInvitation,
    AssetFolder: require('../../dist/entity/asset-folder').AssetFolder,
    AssetFile: require('../../dist/entity/asset-file').AssetFile,
    AssetType: require('../../dist/entity/asset-type').AssetType,
    AuthorizedDomain: require('../../dist/entity/authorized-domain').AuthorizedDomain,
    License: require('../../dist/entity/license').License,
    Product: require('../../dist/entity/product').Product,
    ProductAttribute: require('../../dist/entity/product-attribute').ProductAttribute,
    Download: require('../../dist/entity/download').Download,
}
const services = {
    credentials: require('../../dist/services/credentials'),
    users: require('../../dist/services/user'),
    collections: require('../../dist/services/collection'),
    assets: require('../../dist/services/asset'),
    download: require('../../dist/services/download'),
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
const caller = user => appRouter.createCaller({ user, req: {}, res: {} })
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
const forbidden = promise => assert.rejects(promise, e => ['UNAUTHORIZED', 'FORBIDDEN'].includes(e.code))
async function setup() {
    await db.initialize()
    await worker.startQueues({ enableWorker: true })
    const applied = await db.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1')
    assert.equal(applied[0]?.name, LATEST_MIGRATION, 'Update LATEST_MIGRATION and UPGRADE_MIGRATIONS in test/lib/helpers.cjs when adding migrations')
    for (let i = 0; i < UPGRADE_MIGRATIONS; i++) await db.undoLastMigration()
    await db.query('TRUNCATE users, collections, asset_folders, groups, regions, licenses, products, product_attributes CASCADE')
    await db.query('DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA pgboss; CREATE TABLE pgboss.job (name text, state text)')
    fixtures.group = await save(Group, { name: 'Default' })
    fixtures.region = await save(Region, { name: 'Test', defaultGroupId: fixtures.group.id })
    fixtures.legacyGuestId = randomUUID()
    await db.query(`INSERT INTO users(id,name,company,email,role,region_id,reset_password_token) VALUES($1,'Guest','Test',$2,'guest',$3,'old-reset')`, [fixtures.legacyGuestId, `${fixtures.legacyGuestId}@example.test`, fixtures.region.id])
    await save(UserGroup, { userId: fixtures.legacyGuestId, groupId: fixtures.group.id })
    const parent = await makeCollection({ limitedToGroupIds: [fixtures.group.id] })
    fixtures.legacyChild = await makeCollection({ parent })
    await db.runMigrations()
    fixtures.admin = await makeUser('admin')
    fixtures.manager = await makeUser('manager')
    fixtures.member = await makeUser()
    fixtures.guest = await services.users.createGuestUser({ em: db.manager, email: `${randomUUID()}@example.test`, regionId: fixtures.region.id })
    return fixtures
}
async function teardown() { await server.close(); if (db.isInitialized) await db.destroy() }
module.exports = { setup, teardown, env, db, entities, services, appRouter, worker, server, storage, state, fixtures, save, caller, makeUser, makeCollection, makeFolder, makeFile, forbidden, LATEST_MIGRATION }
