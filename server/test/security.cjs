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
env.mainS3 = () => ({ presignedGetObject: async () => 'https://example.test/fixture', removeObjects: async () => {} })
const storage = {
    presignedGetObject: async () => 'https://example.test/fixture',
    fGetObject: async (_bucket, _key, path) => writeFile(path, 'fixture-original'),
    fPutObject: async () => {},
}
env.assetsS3 = () => storage
env.mainS3Bucket = () => 'fixture'
env.assetsS3Bucket = () => 'fixture'
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
    queue.bulkPush = async () => {}
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
    await worker.startWorker()
    // Apply the upgrade to old rows, not just an empty schema.
    const applied = await db.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1')
    assert.equal(applied[0]?.name, 'SecureAccess1789516800000', 'Review the fixture upgrade setup when adding migrations')
    await db.undoLastMigration()
    await db.query('TRUNCATE users, collections, asset_folders, groups, regions, licenses, products, product_attributes CASCADE')
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
    const previous = env.logger.error
    env.logger.error = (...args) => logs.push(args)
    try {
        const response = await server.inject({ method: 'POST', url: '/trpc/user.login', payload: { email: 'absent@example.test', password: 'distinctive-secret-not-for-logs' } })
        assert(response.statusCode >= 400)
        assert(logs.length > 0)
        assert(!JSON.stringify(logs).includes('distinctive-secret-not-for-logs'))
        assert(!JSON.stringify(logs).includes('input'))
    } finally { env.logger.error = previous }
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
