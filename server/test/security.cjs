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
const { randomUUID, createHash } = require('node:crypto')
const { writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { Readable } = require('node:stream')
const { sign } = require('jsonwebtoken')
// This suite migrates and clears its database. Never fall back to the application's .env.
const databaseURL = process.env.SECURITY_TEST_DATABASE_URL
assert(databaseURL, 'Set SECURITY_TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test')
const parsed = new URL(databaseURL)
assert(parsed.pathname.endsWith('_test'), 'The disposable database name must end in _test')
process.env.DOTENV_CONFIG_PATH = '/dev/null'
process.env.DATABASE_URL = databaseURL
process.env.APP_SECRET = 'security-tests-only-random-fixture-secret-20260916'
process.env.ENABLE_PASSWORD_LESS_AUTH = 'false'
const env = require('../dist/env')
const { dataSource: db } = env
// Storage calls return fixture URLs; the suite never contacts a bucket.
env.mainS3 = () => ({ presignedGetObject: async () => 'https://example.test/fixture', removeObjects: async () => {}, listObjects: () => Readable.from([]) })
let bucketObjects = []
const removedKeys = []
const storage = {
    presignedGetObject: async () => 'https://example.test/fixture',
    fGetObject: async (_bucket, _key, path) => writeFile(path, 'fixture-original'),
    fPutObject: async () => {},
    listObjects: (_bucket, prefix) => Readable.from(bucketObjects.filter(object => object.name.startsWith(prefix))),
    removeObjects: async (_bucket, keys) => { removedKeys.push(...keys) },
}
env.assetsS3 = () => storage
env.mainS3Bucket = () => 'fixture'
env.assetsS3Bucket = () => 'fixture'
const fetchedFiles = []
env.assetUpdater = () => ({
    fetchFileContent: async file => {
        fetchedFiles.push(file.id)
        const path = join(tmpdir(), `security-test-${randomUUID()}`)
        await writeFile(path, 'fixture-content')
        return path
    },
})
const sentMails = []
env.mailTransporter = () => ({ sendMail: async mail => { sentMails.push(mail) } })
env.storageQuota = () => null
let disk = { totalBytes: 10000, freeBytes: 9000 }
env.diskUsage = async () => disk
env.serverAlertEmails = () => []
const { User } = require('../dist/entity/user')
const { Region } = require('../dist/entity/region')
const { Group } = require('../dist/entity/group')
const { UserGroup } = require('../dist/entity/user-group')
const { Collection } = require('../dist/entity/collection')
const { CollectionFile } = require('../dist/entity/collection-file')
const { CollectionInvitation } = require('../dist/entity/collection-invitation')
const { AssetFolder } = require('../dist/entity/asset-folder')
const { AssetFile } = require('../dist/entity/asset-file')
const { License } = require('../dist/entity/license')
const { Product } = require('../dist/entity/product')
const { ProductAttribute } = require('../dist/entity/product-attribute')
const { Download } = require('../dist/entity/download')
const credentials = require('../dist/services/credentials')
const users = require('../dist/services/user')
const collections = require('../dist/services/collection')
const { createDownloadArchive } = require('../dist/services/download')
const { appRouter } = require('../dist/trpc')
const worker = require('../dist/worker')
const server = require('../dist/server').default
const queued = []
const processors = new Map()
// Register the real worker callbacks without starting pg-boss or a scheduler.
worker.boss.start = async () => {}
worker.boss.createQueue = async () => {}
worker.boss.schedule = async () => {}
worker.boss.work = async (name, _options, callback) => processors.set(name, callback)
for (const [name, queue] of Object.entries(worker)) {
    if (!name.endsWith('Queue')) continue
    queue.push = async data => queued.push({ name, ...data })
    queue.bulkPush = async jobs => jobs.forEach(job => queued.push({ name, ...job.data }))
}
const save = (entity, values) => db.getRepository(entity).save(db.getRepository(entity).create(values))
const caller = user => appRouter.createCaller({ user, req: {}, res: {} })
const makeUser = (role = 'member', extra = {}) => save(User, {
    name: role, company: 'Test', email: `${randomUUID()}@example.test`, regionId: region.id,
    role, approved: true, emailVerified: true, ...extra,
})
const makeCollection = extra => save(Collection, { name: randomUUID(), public: true, draft: false, ...extra })
const forbidden = promise => assert.rejects(promise, e => ['UNAUTHORIZED', 'FORBIDDEN'].includes(e.code))
let group, region, admin, member, manager, guest, legacyChild
before(async () => {
    await db.initialize()
    await worker.startQueues({ enableWorker: true })
    // Apply the upgrade to old rows, not just an empty schema.
    const applied = await db.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1')
    assert.equal(applied[0]?.name, 'StorageUsage1789603200000', 'Review the fixture upgrade setup when adding migrations')
    await db.undoLastMigration()
    await db.undoLastMigration()
    await db.query('TRUNCATE users, collections, asset_folders, groups, regions, licenses, products, product_attributes CASCADE')
    await db.query('DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA pgboss; CREATE TABLE pgboss.job (name text, state text)')
    group = await save(Group, { name: 'Default' })
    region = await save(Region, { name: 'Test', defaultGroupId: group.id })
    const guestId = randomUUID()
    await db.query(`INSERT INTO users(id,name,company,email,role,region_id,reset_password_token) VALUES($1,'Guest','Test',$2,'guest',$3,'old-reset')`, [guestId, `${guestId}@example.test`, region.id])
    await save(UserGroup, { userId: guestId, groupId: group.id })
    const parent = await makeCollection({ limitedToGroupIds: [group.id] })
    legacyChild = await makeCollection({ parent })
    await db.runMigrations()
    assert.deepEqual((await db.getRepository(Collection).findOneByOrFail({ id: legacyChild.id })).limitedToGroupIds, [group.id])
    assert.equal(await db.getRepository(UserGroup).countBy({ userId: guestId }), 0)
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: guestId })).resetPasswordToken, null)
    admin = await makeUser('admin')
    manager = await makeUser('manager')
    member = await makeUser()
    guest = await users.createGuestUser({ em: db.manager, email: `${randomUUID()}@example.test`, regionId: region.id })
})
after(async () => { await server.close(); if (db.isInitialized) await db.destroy() })

test('upgrade repairs existing restrictions; invited guests do not join the default group', async () => {
    assert.equal(await db.getRepository(UserGroup).countBy({ userId: guest.id }), 0)
    const row = await db.getRepository(Collection).findOneByOrFail({ id: legacyChild.id })
    assert.equal(row.canEditLimitedToGroupIds, false)
})

test('product changes require an approved and verified admin', async () => {
    const product = await save(Product, { productKey: randomUUID(), primaryKeyName: 'SKU', metaData: {} })
    const input = { id: product.id, metaData: { name: 'Changed' } }
    for (const user of [null, member, manager, { ...admin, approved: false }, { ...admin, emailVerified: false }]) {
        await forbidden(caller(user).pim.updateProduct(input))
    }
    assert.deepEqual((await caller(admin).pim.updateProduct(input)).metaData, input.metaData)
})

test('verification resend is self-only and never returns credentials', async () => {
    const unverified = await makeUser('member', { emailVerified: false })
    await forbidden(caller(null).user.resendVerificationEmail(unverified.id))
    await forbidden(caller(member).user.resendVerificationEmail(unverified.id))
    assert.equal(await caller(unverified).user.resendVerificationEmail(unverified.id), undefined)
})

test('managers cannot edit, demote, approve or delete elevated accounts; updates return public fields', async () => {
    const input = { ...admin, role: 'member', groupIds: [] }
    await forbidden(caller(manager).user.update(input))
    const otherManager = await makeUser('manager')
    await forbidden(caller(manager).user.update({ ...otherManager, role: 'member', groupIds: [] }))
    await forbidden(caller(manager).user.remove(admin.id))
    await forbidden(caller(manager).user.remove(otherManager.id))
    const pendingAdmin = await makeUser('admin', { approved: false })
    await forbidden(caller(manager).user.approve(pendingAdmin.id))
    const result = await caller(manager).user.update({ ...member, name: 'Updated', groupIds: [] })
    assert.equal(result.name, 'Updated')
    for (const key of ['password', 'emailVerificationCode', 'resetPasswordToken', 'authVersion']) assert(!(key in result))
    const self = await caller(manager).user.update({ ...manager, role: 'admin', groupIds: [] })
    assert.equal(self.role, 'manager')
})

test('passwords are salted; legacy login upgrades the hash; signup still returns a session', async () => {
    const password = 'fixture-password'
    const a = await credentials.hashPassword(password)
    const b = await credentials.hashPassword(password)
    assert.notEqual(a, b)
    assert(await credentials.verifyPassword(password, a))
    assert.equal(await credentials.verifyPassword('wrong', a), false)
    assert.equal(await credentials.verifyPassword(password, 'scrypt$invalid'), false)
    const user = await makeUser('member', { password: createHash('sha512').update(password).digest('hex') })
    await assert.rejects(caller(null).user.login({ email: user.email, password: 'wrong' }))
    const token = await caller(null).user.login({ email: user.email, password })
    assert.equal((await users.getUserFromRequest({ headers: { authorization: token } })).id, user.id)
    assert.match((await db.getRepository(User).findOneByOrFail({ id: user.id })).password, /^scrypt\$/)
    const signup = await caller(null).user.create({ name: 'Signup', company: 'Test', regionId: region.id, email: `${randomUUID()}@example.test`, password })
    assert.equal(typeof signup, 'string')
})

test('reset links expire, invalidate earlier requests and sessions, and are consumed atomically', async () => {
    const user = await makeUser('member', { emailVerified: false, emailVerificationCode: 'fixture-verification-code' })
    const oldSession = await users.generateAuthToken(user)
    await caller(null).user.sendResetPasswordEmail(user.email)
    const oldReset = queued.at(-1).token
    await caller(null).user.sendResetPasswordEmail(user.email)
    const token = queued.at(-1).token
    const stored = await db.getRepository(User).findOneByOrFail({ id: user.id })
    assert.notEqual(stored.resetPasswordToken, token)
    assert(stored.resetPasswordExpiresAt > new Date())
    await assert.rejects(caller(null).user.resetPassword({ email: user.email, token: oldReset, newPassword: 'new-password' }))
    const attempts = await Promise.allSettled([1, 2].map(() => caller(null).user.resetPassword({ email: user.email, token, newPassword: 'new-password' })))
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1)
    const fresh = attempts.find(r => r.status === 'fulfilled').value
    assert.equal(await users.getUserFromRequest({ headers: { authorization: oldSession } }), null)
    assert.equal((await users.getUserFromRequest({ headers: { authorization: fresh } })).id, user.id)
    // A request holding a pre-reset user object may verify email, but must not restore old credentials.
    await caller(user).user.verifyEmail('fixture-verification-code')
    const afterVerify = await db.getRepository(User).findOneByOrFail({ id: user.id })
    assert.equal(afterVerify.authVersion, 1)
    assert.equal(afterVerify.resetPasswordToken, null)
    assert(await credentials.verifyPassword('new-password', afterVerify.password))
    await caller(null).user.sendResetPasswordEmail(user.email)
    const expired = queued.at(-1).token
    await db.getRepository(User).update(user.id, { resetPasswordExpiresAt: new Date(0) })
    await assert.rejects(caller(null).user.resetPassword({ email: user.email, token: expired, newPassword: 'new-password' }))
    const { sendResetPasswordEmail } = require('../dist/services/mailer')
    await sendResetPasswordEmail(await db.getRepository(User).findOneByOrFail({ id: user.id }), expired)
    await sendResetPasswordEmail(stored, oldReset)
    assert.equal(await caller(null).user.sendResetPasswordEmail('absent@example.test'), undefined)
})

test('invalid signing secrets and tokens from before the upgrade are rejected', async () => {
    for (const secret of [undefined, '', 'Damvia App Secret', 'short']) assert.throws(() => credentials.validateAppSecret(secret))
    const legacy = sign({ userId: admin.id }, env.secret())
    assert.equal(await users.getUserFromRequest({ headers: { authorization: legacy } }), null)
})

test('children inherit restrictions across API creation, SQL sync, duplication and later updates', async () => {
    const parent = await makeCollection({ limitedToGroupIds: [group.id], ownerId: admin.id })
    const result = await caller(admin).collection.create({ name: randomUUID(), parentId: parent.id, public: true, draft: false })
    let child = await db.getRepository(Collection).findOneByOrFail({ id: result.id })
    assert.deepEqual(child.limitedToGroupIds, [group.id])
    assert.equal(child.canEditLimitedToGroupIds, false)
    await db.getRepository(Collection).update(child.id, { limitedToGroupIds: [], canEditLimitedToGroupIds: true })
    child = await db.getRepository(Collection).findOneByOrFail({ id: child.id })
    assert.deepEqual(child.limitedToGroupIds, [group.id])
    const folder = await save(AssetFolder, { name: 'Root', status: 'up_to_date', externalId: randomUUID() })
    await save(AssetFolder, { name: 'Child', status: 'up_to_date', externalId: randomUUID(), parent: folder })
    const synced = await makeCollection({ assetFolderId: folder.id, limitedToGroupIds: [group.id] })
    await collections.synchronizeCollection(db.manager, synced.id)
    const syncedChild = await db.getRepository(Collection).findOneByOrFail({ parentId: synced.id })
    assert.deepEqual(syncedChild.limitedToGroupIds, [group.id])
    const source = await makeCollection({})
    await makeCollection({ parent: source, draft: true })
    await collections.duplicateCollection({ em: db.manager, source, destination: parent, user: admin })
    assert.deepEqual((await db.getRepository(Collection).findOneByOrFail({ parentId: parent.id, name: source.name })).limitedToGroupIds, [group.id])
    await caller(admin).collection.update({ id: parent.id, name: parent.name, public: true, draft: false, limitedToGroupIds: [] })
    assert.deepEqual((await db.getRepository(Collection).findOneByOrFail({ id: child.id })).limitedToGroupIds, [])
    assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: child.id })).canEditLimitedToGroupIds, true)
})

test('licence dates and regions apply to owners, group members and invitees, with an admin exemption', async () => {
    await save(UserGroup, { userId: member.id, groupId: group.id })
    const license = await save(License, { name: 'Restricted', scopes: [], allowedRegionIds: [region.id], usageTo: '2000-01-01' })
    const folder = await save(AssetFolder, { name: 'Licensed', status: 'up_to_date', externalId: randomUUID(), licenseId: license.id })
    const collection = await makeCollection({ assetFolderId: folder.id, ownerId: manager.id, limitedToGroupIds: [group.id] })
    await save(CollectionInvitation, { collectionId: collection.id, userId: guest.id, email: guest.email, expiresAt: '2099-01-01' })
    const asset = await save(AssetFile, { name: 'hidden-secret.png', status: 'up_to_date', externalId: randomUUID(), externalChecksum: 'test', size: '1', mimeType: 'image/png', folderId: folder.id, licenseId: license.id })
    const file = await save(CollectionFile, { collectionId: collection.id, assetFileId: asset.id })
    const canSee = async (user, type) => (type === 'collection' ? collections.userCollectionsQuery(user) : collections.userCollectionFilesQuery(user))
        .andWhere(`${type === 'collection' ? 'collection' : 'collection_file'}.id = :id`, { id: type === 'collection' ? collection.id : file.id }).getExists()
    for (const patch of [{ usageTo: '2000-01-01' }, { usageTo: null, usageFrom: '2099-01-01' }, { usageFrom: null, allowedRegionIds: [] }]) {
        await db.getRepository(License).update(license.id, patch)
        for (const user of [manager, member, guest]) for (const type of ['collection', 'file']) assert.equal(await canSee(user, type), false)
        for (const type of ['collection', 'file']) assert.equal(await canSee(admin, type), true)
    }
    await assert.rejects(caller(member).favorite.add({ collectionFileId: file.id }), e => e.code === 'NOT_FOUND')
    const { UserFavorite } = require('../dist/entity/user-favorite')
    await save(UserFavorite, { userId: member.id, collectionFileId: file.id })
    assert.deepEqual(await caller(member).favorite.list(), [])
    assert.deepEqual(await caller(member).collection.searchNotFound({ query: ['hidden-secret'], searchScope: 'current', collectionId: collection.id }), ['hidden-secret'])
    await assert.rejects(createDownloadArchive({ em: db.manager, download: { userId: member.id, collectionFileIds: [file.id] } }), /no longer available/)
    await makeCollection({ parent: collection, draft: true })
    const destination = await makeCollection({ ownerId: member.id, public: false })
    await collections.duplicateCollection({ em: db.manager, source: collection, destination, user: member })
    const copy = await db.getRepository(Collection).findOneByOrFail({ parentId: destination.id })
    assert.equal(await db.getRepository(CollectionFile).countBy({ collectionId: copy.id }), 0)
    assert.equal(await db.getRepository(Collection).countBy({ parentId: copy.id }), 0)
    await db.getRepository(License).update(license.id, { allowedRegionIds: [region.id], usageTo: () => 'CURRENT_DATE' })
    for (const user of [manager, member, guest]) for (const type of ['collection', 'file']) assert.equal(await canSee(user, type), true)
    assert.equal((await caller(member).favorite.list()).length, 1)
    assert.deepEqual(await caller(member).collection.searchNotFound({ query: ['hidden-secret'], searchScope: 'current_with_sub', collectionId: collection.id }), [])
    await db.getRepository(Collection).update(collection.id, { draft: true })
    assert.equal(await canSee(member, 'file'), false)
    assert.equal(await canSee(guest, 'file'), false)
    assert.equal(await canSee(manager, 'file'), true)
})

test('search treats imported attribute names as data', async () => {
    await save(ProductAttribute, { name: "name'] OR true --", searchable: true })
    for (const exactMatch of [true, false]) {
        const result = await caller(member).collection.search({ query: 'does-not-exist-unique', exactMatch, page: 1 })
        assert.equal(result.total, 0)
    }
})

test('failed HTTP requests do not log submitted credentials or database error details', async () => {
    const logs = []
    const previous = { error: env.logger.error, warn: env.logger.warn }
    env.logger.error = (...args) => logs.push(args)
    env.logger.warn = (...args) => logs.push(args)
    try {
        const response = await server.inject({ method: 'POST', url: '/trpc/user.login', payload: { email: 'absent@example.test', password: 'distinctive-secret-not-for-logs' } })
        assert(response.statusCode >= 400)
        assert(logs.length > 0)
        assert(!JSON.stringify(logs).includes('distinctive-secret-not-for-logs'))
        assert(!JSON.stringify(logs).includes('input'))
    } finally { Object.assign(env.logger, previous) }
})

test('logged errors keep the database message and code, nested included', () => {
    const driverError = Object.assign(new Error('deadlock detected'), { code: '40P01', detail: 'Process 1 waits for ShareLock' })
    const queryError = Object.assign(new Error('deadlock detected'), { name: 'QueryFailedError', code: '40P01', query: 'UPDATE "asset_files" SET 1', driverError })
    const at = new Date('2026-09-21T12:00:00Z')
    const lines = []
    const transport = new (require('winston').transports.Stream)({ stream: new (require('node:stream').Writable)({ write(chunk, _, done) { lines.push(chunk.toString()); done() } }) })
    env.logger.add(transport)
    try {
        env.logger.error('failed to update assets', { source: 'dropbox', error: queryError, at, list: [driverError] })
    } finally { env.logger.remove(transport) }
    const logged = JSON.parse(lines[0].slice(lines[0].indexOf('{')))
    assert.equal(logged.source, 'dropbox')
    assert.equal(logged.error.name, 'QueryFailedError')
    assert.equal(logged.error.message, 'deadlock detected')
    assert.equal(logged.error.code, '40P01')
    assert.equal(logged.error.query, 'UPDATE "asset_files" SET 1')
    assert.equal(logged.at, '2026-09-21T12:00:00.000Z')
    assert.equal(logged.list[0].detail, 'Process 1 waits for ShareLock')
})

// Keep both transactions open deliberately: restrictions must survive either lock order.
test('concurrent child creation and parent restriction changes preserve inheritance', async () => {
    for (const insertFirst of [true, false]) {
        const parent = await makeCollection({})
        const first = db.createQueryRunner()
        const second = db.createQueryRunner()
        await first.connect(); await second.connect()
        await first.startTransaction(); await second.startTransaction()
        try {
            await first.query("SET LOCAL statement_timeout = '5s'")
            await second.query("SET LOCAL statement_timeout = '5s'")
            let child, pending
            if (insertFirst) {
                child = await first.manager.getRepository(Collection).save(first.manager.create(Collection, { name: randomUUID(), public: true, draft: false, parentId: parent.id }))
                pending = second.manager.getRepository(Collection).update(parent.id, { limitedToGroupIds: [group.id] })
            } else {
                await first.manager.getRepository(Collection).update(parent.id, { limitedToGroupIds: [group.id] })
                pending = second.manager.getRepository(Collection).save(second.manager.create(Collection, { name: randomUUID(), public: true, draft: false, parentId: parent.id }))
            }
            await first.commitTransaction()
            const result = await pending
            if (!insertFirst) child = result
            await second.commitTransaction()
            assert.deepEqual((await db.getRepository(Collection).findOneByOrFail({ id: child.id })).limitedToGroupIds, [group.id])
        } finally {
            if (first.isTransactionActive) await first.rollbackTransaction()
            if (second.isTransactionActive) await second.rollbackTransaction()
            await first.release(); await second.release()
        }
    }
})

test('signup token is usable immediately after account creation', async () => {
    const email = `${randomUUID()}@example.test`
    const token = await caller(null).user.create({ name: 'Signup', company: 'Test', regionId: region.id, email, password: 'fixture-password' })
    const authenticated = await users.getUserFromRequest({ headers: { authorization: token } })
    assert.equal(authenticated?.email, email)
    assert.equal(authenticated.authVersion, 0)
})

const downloadOptions = {
    imageFormat: 'original', imageResolution: 'high',
    videoFormat: 'original', videoResolution: 'high',
}

async function exportFixture() {
    const user = await makeUser()
    const license = await save(License, { name: 'Export licence', scopes: [], allowedRegionIds: [region.id] })
    const folder = await save(AssetFolder, { name: 'Export folder', externalId: randomUUID(), status: 'up_to_date', licenseId: license.id })
    const collection = await makeCollection({ assetFolderId: folder.id })
    const asset = await save(AssetFile, {
        name: 'fixture.png', externalId: randomUUID(), externalChecksum: 'fixture',
        status: 'up_to_date', size: '16', mimeType: 'image/png', folderId: folder.id, licenseId: license.id,
    })
    const file = await save(CollectionFile, { collectionId: collection.id, assetFileId: asset.id })
    return { user, license, file }
}

async function runExportJob(downloadId) {
    return processors.get('download/create-archive')([
        { id: randomUUID(), name: 'download/create-archive', data: { downloadId } },
    ])
}

test('direct download runs as the requesting user and inaccessible requests roll back', async () => {
    const { user, license, file } = await exportFixture()
    const input = { ...downloadOptions, downloadType: 'direct', collectionFileIds: [file.id] }
    const result = await caller(user).download.create(input)
    assert.equal(result.status, 'ready')
    assert.equal(result.fileCount, 1)
    assert.equal((await db.getRepository(Download).findOneByOrFail({ id: result.id })).userId, user.id)
    await db.getRepository(License).update(license.id, { usageTo: '2000-01-01' })
    await assert.rejects(caller(user).download.create(input), /no longer available/)
    assert.equal(await db.getRepository(Download).countBy({ userId: user.id }), 1)
})

test('guest token is usable immediately after invitation account creation', async () => {
    const created = await users.createGuestUser({ em: db.manager, email: `${randomUUID()}@example.test`, regionId: region.id })
    const token = await users.generateAuthToken(created)
    const authenticated = await users.getUserFromRequest({ headers: { authorization: token } })
    assert.equal(authenticated?.id, created.id)
    assert.equal(authenticated.role, 'guest')
    assert.equal(authenticated.authVersion, 0)
})

test('new collection responses contain inherited values for manual and synchronised children', async () => {
    const parent = await makeCollection({ limitedToGroupIds: [group.id] })
    const folder = await save(AssetFolder, { name: 'Source', status: 'up_to_date', externalId: randomUUID() })
    const manual = await caller(admin).collection.create({ name: randomUUID(), parentId: parent.id })
    const synchronised = await caller(admin).collection.createFromAsset({ assetFolderId: folder.id, parentId: parent.id })
    for (const response of [manual, synchronised]) {
        assert.deepEqual(response.limitedToGroupIds, [group.id])
        assert.equal(response.canEditLimitedToGroupIds, false)
    }
})

test('email export with revoked access ends in failed and remains visible without a link', async () => {
    const { user, license, file } = await exportFixture()
    const result = await caller(user).download.create({ ...downloadOptions, downloadType: 'email', collectionFileIds: [file.id] })
    await db.getRepository(License).update(license.id, { usageTo: '2000-01-01' })
    let rejected
    await runExportJob(result.id).catch(error => { rejected = error })
    const persisted = await db.getRepository(Download).findOneByOrFail({ id: result.id })
    assert.equal(persisted.status, 'failed')
    assert.equal(rejected, undefined, 'A permanent access failure must finish without scheduling a retry')
    const listed = (await caller(user).download.list()).find(download => download.id === result.id)
    assert.equal(listed?.status, 'failed')
    assert.equal(listed.url, null)
    const response = await server.inject({ method: 'GET', url: `/v1/downloads/${result.id}` })
    assert.equal(response.statusCode, 302)
    assert.match(response.headers.location, /\/link-expired$/)
    assert(!queued.some(job => job.name === 'mailerDownloadReadyQueue' && job.downloadId === result.id))
    assert(!(await caller(member).download.list()).some(download => download.id === result.id))
    // An already failed export must not be revived by duplicate delivery of the job.
    await db.getRepository(License).update(license.id, { usageTo: null })
    await runExportJob(result.id)
    assert.equal((await db.getRepository(Download).findOneByOrFail({ id: result.id })).status, 'failed')
    assert(!queued.some(job => job.name === 'mailerDownloadReadyQueue' && job.downloadId === result.id))
})

test('temporary export failures stay retryable and a successful retry sends the ready notification', async () => {
    const { user, file } = await exportFixture()
    const result = await caller(user).download.create({ ...downloadOptions, downloadType: 'email', collectionFileIds: [file.id] })
    const originalGet = storage.fGetObject
    storage.fGetObject = async () => { throw new Error('Temporary fixture storage failure') }
    try {
        await assert.rejects(runExportJob(result.id), /Temporary fixture storage failure/)
        assert.equal((await db.getRepository(Download).findOneByOrFail({ id: result.id })).status, 'preparing')
        assert(!queued.some(job => job.name === 'mailerDownloadReadyQueue' && job.downloadId === result.id))
    } finally { storage.fGetObject = originalGet }
    await runExportJob(result.id)
    assert.equal((await db.getRepository(Download).findOneByOrFail({ id: result.id })).status, 'ready')
    assert.equal(queued.filter(job => job.name === 'mailerDownloadReadyQueue' && job.downloadId === result.id).length, 1)
})

const { StorageUsage } = require('../dist/entity/storage-usage')
const assets = require('../dist/services/asset')
const storageService = require('../dist/services/storage')

async function resetStorageUsage(values = {}) {
    await db.getRepository(StorageUsage).update({ id: 1 }, { usedBytes: '0', reservedBytes: '0', alertLevel: 0, diskAlertLevel: 0, quotaReachedAt: null, ...values })
    bucketObjects = []
    removedKeys.length = 0
    sentMails.length = 0
    return db.getRepository(StorageUsage).findOneByOrFail({ id: 1 })
}

async function pendingAsset(status = 'creating', size = '16') {
    const folder = await save(AssetFolder, { name: 'Quota folder', externalId: randomUUID(), status: 'up_to_date' })
    return save(AssetFile, { name: 'fixture.bin', externalId: randomUUID(), externalChecksum: 'fixture', status, size, mimeType: 'application/octet-stream', folderId: folder.id })
}

async function runUpdateJob(assetFileId) {
    return processors.get('asset/update-content')([{ id: randomUUID(), name: 'asset/update-content', data: { assetFileId } }])
}

const storageRow = () => db.getRepository(StorageUsage).findOneByOrFail({ id: 1 })

test('a file that does not fit in the quota is left pending without a retry, a download or a reservation', async () => {
    await resetStorageUsage({ usedBytes: '90' })
    env.storageQuota = () => 100
    try {
        const asset = await pendingAsset()
        const fetchedBefore = fetchedFiles.length
        await runUpdateJob(asset.id)
        assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: asset.id })).status, 'creating')
        assert.equal(fetchedFiles.length, fetchedBefore)
        const row = await storageRow()
        assert.equal(row.reservedBytes, '0')
        assert.equal(row.usedBytes, '90')
        assert(row.quotaReachedAt instanceof Date)
    } finally { env.storageQuota = () => null }
})

test('a file that fits is uploaded once, counted once, and a duplicate job does nothing', async () => {
    await resetStorageUsage()
    env.storageQuota = () => 1000
    try {
        const asset = await pendingAsset()
        const fetchedBefore = fetchedFiles.length
        await runUpdateJob(asset.id)
        assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: asset.id })).status, 'up_to_date')
        assert.equal(fetchedFiles.length, fetchedBefore + 1)
        let row = await storageRow()
        assert.equal(row.usedBytes, '16')
        assert.equal(row.reservedBytes, '0')
        await runUpdateJob(asset.id)
        row = await storageRow()
        assert.equal(fetchedFiles.length, fetchedBefore + 1)
        assert.equal(row.usedBytes, '16')
    } finally { env.storageQuota = () => null }
})

test('an upload failure keeps the file pending, releases the reservation and stays retryable', async () => {
    await resetStorageUsage()
    env.storageQuota = () => 1000
    const originalPut = storage.fPutObject
    storage.fPutObject = async () => { throw new Error('Fixture disk full') }
    try {
        const asset = await pendingAsset()
        await assert.rejects(runUpdateJob(asset.id), /Fixture disk full/)
        assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: asset.id })).status, 'creating')
        const row = await storageRow()
        assert.equal(row.reservedBytes, '0')
        assert.equal(row.usedBytes, '0')
    } finally { storage.fPutObject = originalPut; env.storageQuota = () => null }
})

test('storage alerts go to designated admins once per crossing and the level falls back without mail', async () => {
    await resetStorageUsage()
    env.storageQuota = () => 1000
    const silentAdmin = await makeUser('admin')
    await db.getRepository(User).update(admin.id, { maintenanceContact: true })
    try {
        bucketObjects = [{ name: 'asset-file/a', size: 850, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 1)
        assert(sentMails[0].to.includes(admin.email))
        assert(!sentMails[0].to.includes(silentAdmin.email))
        assert(!sentMails[0].to.includes(manager.email))
        assert(!sentMails[0].to.includes(member.email))
        assert.match(sentMails[0].subject, /warning/)
        assert.match(sentMails[0].text, /85%/)
        assert.equal((await storageRow()).alertLevel, 80)
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 1)
        bucketObjects = [{ name: 'asset-file/a', size: 960, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 2)
        assert.match(sentMails[1].subject, /critical/)
        assert.equal((await storageRow()).alertLevel, 95)
        bucketObjects = [{ name: 'asset-file/a', size: 700, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 2)
        const row = await storageRow()
        assert.equal(row.alertLevel, 0)
        assert.equal(row.usedBytes, '700')
        assert(row.measuredAt instanceof Date)
        const previousConfig = env.mailConfig
        env.mailConfig = () => ({})
        try {
            bucketObjects = [{ name: 'asset-file/a', size: 1000, lastModified: new Date() }]
            await storageService.measureStorageUsage()
            assert.equal(sentMails.length, 2)
            assert.equal((await storageRow()).alertLevel, 0)
        } finally { env.mailConfig = previousConfig }
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 3)
        assert.match(sentMails[2].subject, /full/)
        assert.equal((await storageRow()).alertLevel, 100)
    } finally { env.storageQuota = () => null }
})

test('freed space after a blocked sync queues every pending file again', async () => {
    await resetStorageUsage({ usedBytes: '900', quotaReachedAt: new Date() })
    env.storageQuota = () => 1000
    try {
        const outdated = await pendingAsset('outdated')
        const healthy = await pendingAsset('up_to_date')
        bucketObjects = [{ name: 'asset-file/a', size: 500, lastModified: new Date() }]
        const result = await storageService.measureStorageUsage()
        assert(result.retriedAssets >= 1)
        assert(queued.some(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === outdated.id))
        assert(!queued.some(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === healthy.id))
        assert.equal((await storageRow()).quotaReachedAt, null)
    } finally { env.storageQuota = () => null }
})

test('raising or removing the plan resumes a paused sync without freeing space', async () => {
    await resetStorageUsage({ usedBytes: '900', quotaReachedAt: new Date() })
    env.storageQuota = () => 800
    try {
        const outdated = await pendingAsset('outdated')
        bucketObjects = [{ name: 'asset-file/a', size: 900, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.notEqual((await storageRow()).quotaReachedAt, null)
        assert(!queued.some(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === outdated.id))
        env.storageQuota = () => 5000
        const raised = await storageService.measureStorageUsage()
        assert.equal((await storageRow()).quotaReachedAt, null)
        assert(raised.retriedAssets >= 1)
        assert(queued.some(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === outdated.id))
        await resetStorageUsage({ usedBytes: '900', quotaReachedAt: new Date() })
        bucketObjects = [{ name: 'asset-file/a', size: 900, lastModified: new Date() }]
        env.storageQuota = () => null
        const removed = await storageService.measureStorageUsage()
        assert.equal((await storageRow()).quotaReachedAt, null)
        assert(removed.retriedAssets >= 1)
    } finally { env.storageQuota = () => null }
})

test('the dashboard and its actions are admin only and expose numbers, not strings', async () => {
    for (const user of [null, guest, member, manager, { ...admin, approved: false }]) {
        await forbidden(caller(user).dashboard.summary())
        await forbidden(caller(user).dashboard.retryPendingAssets())
        await forbidden(caller(user).dashboard.measureStorage())
    }
    const summary = await caller(admin).dashboard.summary()
    assert.equal(typeof summary.storage.usedBytes, 'number')
    assert.equal(summary.storage.quotaBytes, null)
    assert.equal(summary.storage.disk, null)
    assert.deepEqual(summary.storage.serverContactEmails, [])
    assert.equal(summary.storage.percent, null)
    assert.equal(typeof summary.assets.byStatus.up_to_date, 'number')
    assert.equal(typeof summary.users.total, 'number')
    assert.equal(typeof summary.users.maintenanceContacts, 'number')
    assert.equal(typeof summary.users.byRole.admin, 'number')
    const queuedBefore = queued.length
    const retry = await caller(admin).dashboard.retryPendingAssets()
    assert.equal(typeof retry.queued, 'number')
    assert.equal(queued.length - queuedBefore, retry.queued)
    await caller(admin).dashboard.measureStorage()
    assert.equal(queued.at(-1).name, 'storageMeasureUsageQueue')
    const response = await server.inject({ method: 'GET', url: '/trpc/dashboard.summary' })
    assert.equal(response.statusCode, 401)
    const publicEnv = await caller(null).env()
    assert(!('storage' in publicEnv))
})

test('the integrity check removes only old orphan objects and archives of finished downloads', async () => {
    await resetStorageUsage()
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const owned = await pendingAsset('up_to_date')
    const { user, file } = await exportFixture()
    const expired = await save(Download, { userId: user.id, collectionFileIds: [file.id], status: 'expired', type: 'email', ...downloadOptions, expiresAt: twoDaysAgo })
    const preparing = await save(Download, { userId: user.id, collectionFileIds: [file.id], status: 'preparing', type: 'email', ...downloadOptions, expiresAt: new Date(Date.now() + 86400000) })
    const oldOrphan = `asset-file/${randomUUID()}`
    const youngOrphan = `asset-file/${randomUUID()}`
    bucketObjects = [
        { name: oldOrphan, size: 10, lastModified: twoDaysAgo },
        { name: `${oldOrphan}-thumbnail`, size: 1, lastModified: twoDaysAgo },
        { name: youngOrphan, size: 10, lastModified: new Date() },
        { name: `asset-file/${owned.id}`, size: 16, lastModified: twoDaysAgo },
        { name: 'asset-file/not-a-uuid', size: 5, lastModified: twoDaysAgo },
        { name: `downloads/${expired.id}`, size: 100, lastModified: twoDaysAgo },
        { name: `downloads/${preparing.id}`, size: 100, lastModified: twoDaysAgo },
    ]
    const result = await storageService.removeOrphanObjects()
    assert.deepEqual(removedKeys.sort(), [oldOrphan, `${oldOrphan}-thumbnail`, `downloads/${expired.id}`].sort())
    assert.equal(result.count, 3)
    assert.equal(result.bytes, 111)
    const row = await storageRow()
    assert.equal(row.orphanObjects, 3)
    assert.equal(row.orphanBytes, '111')
    assert(row.orphansRemovedAt instanceof Date)
})

test('a changed cloud checksum marks the file outdated and queues exactly one refresh', async () => {
    const folder = await save(AssetFolder, { name: 'Sync folder', externalId: randomUUID(), status: 'up_to_date' })
    const options = { externalId: randomUUID(), externalChecksum: 'v1', folderExternalId: folder.externalId, name: 'fixture.bin', size: 16, mimeType: 'application/octet-stream' }
    const created = await assets.upsertFile(options)
    assert.equal(created.status, 'creating')
    assert.equal(queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === created.id).length, 1)
    await db.getRepository(AssetFile).update(created.id, { status: 'up_to_date' })
    const unchanged = await assets.upsertFile(options)
    assert.equal(unchanged.status, 'up_to_date')
    assert.equal(queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === created.id).length, 1)
    const changed = await assets.upsertFile({ ...options, externalChecksum: 'v2' })
    assert.equal(changed.status, 'outdated')
    assert.equal(changed.externalChecksum, 'v2')
    assert.equal(queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === created.id).length, 2)
})

test('STORAGE_QUOTA accepts decimal sizes and rejects anything else', () => {
    assert.equal(env.parseStorageQuota('1.5TB'), 1500000000000)
    assert.equal(env.parseStorageQuota('1500GB'), 1500000000000)
    assert.equal(env.parseStorageQuota('1500 gb'), 1500000000000)
    assert.equal(env.parseStorageQuota('2000000000000'), 2000000000000)
    assert.equal(env.parseStorageQuota(''), null)
    assert.equal(env.parseStorageQuota(undefined), null)
    for (const value of ['abc', '-5GB', '0', '1.5 TiB', '10GB extra']) assert.throws(() => env.parseStorageQuota(value), /STORAGE_QUOTA/)
})

test('two measurements at the same time send one alert and queue the recovery once', async () => {
    await resetStorageUsage({ usedBytes: '900', quotaReachedAt: new Date() })
    env.storageQuota = () => 1000
    try {
        const outdated = await pendingAsset('outdated')
        bucketObjects = [{ name: 'asset-file/a', size: 850, lastModified: new Date() }]
        const queuedBefore = queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === outdated.id).length
        await Promise.all([storageService.measureStorageUsage(), storageService.measureStorageUsage()])
        assert.equal(sentMails.length, 1)
        assert.equal(queued.filter(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === outdated.id).length, queuedBefore + 1)
        assert.equal((await storageRow()).alertLevel, 80)
    } finally { env.storageQuota = () => null }
})

test('a measurement keeps reservations while downloads are active and clears them once none is', async () => {
    await resetStorageUsage({ reservedBytes: '40' })
    env.storageQuota = () => 1000
    try {
        bucketObjects = [{ name: 'asset-file/a', size: 100, lastModified: new Date() }]
        await db.query(`INSERT INTO pgboss.job(name, state) VALUES('asset/update-content', 'active')`)
        await storageService.measureStorageUsage()
        let row = await storageRow()
        assert.equal(row.usedBytes, '100')
        assert.equal(row.reservedBytes, '40')
        await db.query(`UPDATE pgboss.job SET state = 'completed'`)
        await storageService.measureStorageUsage()
        row = await storageRow()
        assert.equal(row.reservedBytes, '0')
    } finally { await db.query('DELETE FROM pgboss.job'); env.storageQuota = () => null }
})

test('the server disk is shown only to the hosting contact and its alerts go only to that contact', async () => {
    await resetStorageUsage()
    disk = { totalBytes: 10000, freeBytes: 500 }
    await storageService.measureStorageUsage()
    assert.equal(sentMails.length, 0)
    assert.equal((await storageRow()).diskAlertLevel, 0)
    assert.equal((await caller(admin).dashboard.summary()).storage.disk, null)
    env.serverAlertEmails = () => ['host@example.test']
    try {
        await resetStorageUsage()
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 1)
        assert.equal(sentMails[0].to, 'host@example.test')
        assert(!sentMails[0].to.includes(admin.email))
        assert.match(sentMails[0].subject, /critical/)
        assert.match(sentMails[0].text, /95%/)
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 1)
        assert.equal((await caller(admin).dashboard.summary()).storage.disk, null)
        const host = await makeUser('admin', { email: 'Host@Example.test' })
        const hostDisk = (await caller(host).dashboard.summary()).storage.disk
        assert.equal(hostDisk.totalBytes, 10000)
        assert.equal(hostDisk.freeBytes, 500)
        assert.equal(typeof hostDisk.orphanObjects, 'number')
        assert.equal(typeof hostDisk.blockedFiles, 'number')
        const customerStorage = (await caller(admin).dashboard.summary()).storage
        assert.deepEqual(customerStorage.serverContactEmails, ['host@example.test'])
        for (const key of ['orphanObjects', 'orphanBytes', 'orphansRemovedAt', 'blockedFiles']) assert(!(key in customerStorage))
        assert.equal((await caller({ ...host, role: 'manager' }).dashboard.summary().catch(e => e.code)), 'UNAUTHORIZED')
    } finally { env.serverAlertEmails = () => []; disk = { totalBytes: 10000, freeBytes: 9000 } }
})

test('only admins can designate an admin as maintenance contact, and no designated admin means no mail', async () => {
    await resetStorageUsage()
    env.storageQuota = () => 1000
    await db.getRepository(User).update({ maintenanceContact: true }, { maintenanceContact: false })
    try {
        bucketObjects = [{ name: 'asset-file/a', size: 850, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 0)
        assert.equal((await storageRow()).alertLevel, 0)
        const target = await makeUser('member')
        await caller(manager).user.update({ ...target, groupIds: [], maintenanceContact: true })
        assert.equal((await db.getRepository(User).findOneByOrFail({ id: target.id })).maintenanceContact, false)
        await caller(admin).user.update({ ...target, groupIds: [], maintenanceContact: true })
        assert.equal((await db.getRepository(User).findOneByOrFail({ id: target.id })).maintenanceContact, false)
        await caller(admin).user.update({ ...target, role: 'admin', groupIds: [], maintenanceContact: true })
        assert.equal((await db.getRepository(User).findOneByOrFail({ id: target.id })).maintenanceContact, true)
        const listed = (await caller(admin).user.list()).find(user => user.id === target.id)
        assert.equal(listed.maintenanceContact, true)
        const seenByManager = (await caller(manager).user.list()).find(user => user.id === target.id)
        assert.equal(seenByManager.maintenanceContact, undefined)
        assert.equal((await caller(admin).dashboard.summary()).users.maintenanceContacts, 1)
        await caller(admin).user.update({ ...target, role: 'member', groupIds: [] })
        assert.equal((await db.getRepository(User).findOneByOrFail({ id: target.id })).maintenanceContact, false)
    } finally { env.storageQuota = () => null }
})

test('measure and retry are refused while their jobs are waiting or running, including two clicks at once', async () => {
    await db.query('DELETE FROM pgboss.job')
    try {
        await db.query(`INSERT INTO pgboss.job(name, state) VALUES('storage/measure-usage', 'created'), ('asset/update-content', 'active')`)
        await assert.rejects(caller(admin).dashboard.measureStorage(), e => e.code === 'BAD_REQUEST')
        await assert.rejects(caller(admin).dashboard.retryPendingAssets(), e => e.code === 'BAD_REQUEST')
        const summary = await caller(admin).dashboard.summary()
        assert.equal(summary.jobs.measuring, true)
        assert.equal(summary.jobs.downloading, 1)
        await db.query(`UPDATE pgboss.job SET state = 'completed'`)
        assert.deepEqual((await caller(admin).dashboard.summary()).jobs, { measuring: false, downloading: 0 })
        const originalPush = worker.storageMeasureUsageQueue.push
        worker.storageMeasureUsageQueue.push = async data => {
            await new Promise(resolve => setTimeout(resolve, 200))
            return originalPush(data)
        }
        try {
            const queuedBefore = queued.filter(job => job.name === 'storageMeasureUsageQueue').length
            const attempts = await Promise.allSettled([caller(admin).dashboard.measureStorage(), caller(admin).dashboard.measureStorage()])
            assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1)
            assert.equal(queued.filter(job => job.name === 'storageMeasureUsageQueue').length, queuedBefore + 1)
        } finally { worker.storageMeasureUsageQueue.push = originalPush }
    } finally { await db.query('DELETE FROM pgboss.job') }
})

test('an alert that could not be sent is sent again at the next measurement', async () => {
    await resetStorageUsage()
    await db.getRepository(User).update(admin.id, { maintenanceContact: true })
    env.storageQuota = () => 1000
    env.serverAlertEmails = () => ['host@example.test']
    disk = { totalBytes: 10000, freeBytes: 500 }
    const previousTransporter = env.mailTransporter
    env.mailTransporter = () => ({ sendMail: async () => { throw new Error('Fixture SMTP outage') } })
    try {
        bucketObjects = [{ name: 'asset-file/a', size: 950, lastModified: new Date() }]
        await assert.rejects(storageService.measureStorageUsage(), /Fixture SMTP outage/)
        let row = await storageRow()
        assert.equal(row.diskAlertLevel, 0)
        assert.equal(row.alertLevel, 0)
        env.mailTransporter = previousTransporter
        await storageService.measureStorageUsage()
        row = await storageRow()
        assert.equal(row.diskAlertLevel, 95)
        assert.equal(row.alertLevel, 95)
        assert.deepEqual(sentMails.map(mail => mail.to.includes('host@example.test')), [true, false])
        await db.getRepository(User).update({ maintenanceContact: true }, { maintenanceContact: false })
        await resetStorageUsage()
        bucketObjects = [{ name: 'asset-file/a', size: 950, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.equal((await storageRow()).alertLevel, 0)
        await db.getRepository(User).update(admin.id, { maintenanceContact: true })
        await storageService.measureStorageUsage()
        assert.equal((await storageRow()).alertLevel, 95)
        assert(sentMails.some(mail => mail.to.includes(admin.email) && /critical/.test(mail.subject)))
    } finally {
        env.mailTransporter = previousTransporter
        env.serverAlertEmails = () => []
        env.storageQuota = () => null
        disk = { totalBytes: 10000, freeBytes: 9000 }
    }
})

test('re-syncing an unchanged root folder leaves its subtree alone', async () => {
    const rootId = randomUUID()
    const root = await assets.upsertFolder({ externalId: rootId, parentExternalId: '', name: 'Synced root' })
    const child = await assets.upsertFolder({ externalId: randomUUID(), parentExternalId: rootId, name: 'Synced child' })
    const childRow = async () => (await db.query('SELECT mpath, updated_at FROM asset_folders WHERE id = $1', [child.id]))[0]
    const before = await childRow()
    const updates = []
    const createQueryRunner = db.createQueryRunner.bind(db)
    db.createQueryRunner = (...args) => {
        const runner = createQueryRunner(...args)
        const query = runner.query.bind(runner)
        runner.query = (sql, ...rest) => { if (/^UPDATE "asset_folders"/.test(sql)) updates.push(sql); return query(sql, ...rest) }
        return runner
    }
    try {
        await assets.upsertFolder({ externalId: rootId, parentExternalId: '', name: 'Synced root' })
        assert.deepEqual(updates, [])
        await assets.upsertFolder({ externalId: rootId, parentExternalId: '', name: 'Renamed root' })
    } finally { db.createQueryRunner = createQueryRunner }
    assert.equal((await db.getRepository(AssetFolder).findOneByOrFail({ id: root.id })).name, 'Renamed root')
    assert.deepEqual(await childRow(), before)
})
