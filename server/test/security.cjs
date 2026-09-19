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
const { join } = require('node:path')
const { Readable } = require('node:stream')
const { sign } = require('jsonwebtoken')
const harness = require('./lib/helpers.cjs')
const { env, db, worker, server, storage, state, fixtures, save, caller, makeUser, makeCollection, forbidden } = harness
const { User, Group, UserGroup, Collection, CollectionFile, CollectionInvitation, AssetFolder, AssetFile, License, Product, Download } = harness.entities
const { credentials, users, collections } = harness.services
const { createDownloadArchive } = harness.services.download
const { queued, processors, sentMails, removedKeys, fetchedFiles } = state
let group, region, admin, member, manager, guest, legacyChild
before(async () => ({ group, region, admin, member, manager, guest, legacyChild } = await harness.setup()))
after(() => harness.teardown())

test('upgrade repairs existing restrictions; invited guests do not join the default group', async () => {
    assert.deepEqual((await db.getRepository(Collection).findOneByOrFail({ id: legacyChild.id })).limitedToGroupIds, [group.id])
    assert.equal(await db.getRepository(UserGroup).countBy({ userId: fixtures.legacyGuestId }), 0)
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: fixtures.legacyGuestId })).resetPasswordToken, null)
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

const { StorageUsage } = require('../dist/entity/storage-usage')
const assets = require('../dist/services/asset')
const storageService = require('../dist/services/storage')

async function resetStorageUsage(values = {}) {
    await db.getRepository(StorageUsage).update({ id: 1 }, { usedBytes: '0', reservedBytes: '0', alertLevel: 0, diskAlertLevel: 0, quotaReachedAt: null, ...values })
    state.bucketObjects = []
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

test('once the plan is reached every download waits, even a file that would fit, until a measurement finds room', async () => {
    await resetStorageUsage({ usedBytes: '90' })
    env.storageQuota = () => 100
    try {
        const big = await pendingAsset()
        await runUpdateJob(big.id)
        assert((await storageRow()).quotaReachedAt instanceof Date)
        const small = await pendingAsset()
        await db.getRepository(AssetFile).update({ id: small.id }, { size: '1' })
        const fetchedBefore = fetchedFiles.length
        await runUpdateJob(small.id)
        assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: small.id })).status, 'creating')
        assert.equal(fetchedFiles.length, fetchedBefore)
        await assert.rejects(caller(admin).dashboard.retryPendingAssets(), e => e.code === 'BAD_REQUEST' && /paused/.test(e.message))
        const summary = await caller(admin).dashboard.summary()
        assert.equal(summary.sync.paused, true)
        assert.equal((await caller(admin).asset.sources()).sync.paused, true)
        await db.query('UPDATE storage_usage SET quota_reached_at = NULL WHERE id = 1')
        await runUpdateJob(small.id)
        assert.equal((await db.getRepository(AssetFile).findOneByOrFail({ id: small.id })).status, 'up_to_date')
        assert.equal((await caller(admin).dashboard.summary()).sync.paused, false)
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
        state.bucketObjects = [{ name: 'asset-file/a', size: 850, lastModified: new Date() }]
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
        state.bucketObjects = [{ name: 'asset-file/a', size: 960, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 2)
        assert.match(sentMails[1].subject, /critical/)
        assert.equal((await storageRow()).alertLevel, 95)
        state.bucketObjects = [{ name: 'asset-file/a', size: 700, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.equal(sentMails.length, 2)
        const row = await storageRow()
        assert.equal(row.alertLevel, 0)
        assert.equal(row.usedBytes, '700')
        assert(row.measuredAt instanceof Date)
        const previousConfig = env.mailConfig
        env.mailConfig = () => ({})
        try {
            state.bucketObjects = [{ name: 'asset-file/a', size: 1000, lastModified: new Date() }]
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
        state.bucketObjects = [{ name: 'asset-file/a', size: 500, lastModified: new Date() }]
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
        state.bucketObjects = [{ name: 'asset-file/a', size: 900, lastModified: new Date() }]
        await storageService.measureStorageUsage()
        assert.notEqual((await storageRow()).quotaReachedAt, null)
        assert(!queued.some(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === outdated.id))
        env.storageQuota = () => 5000
        const raised = await storageService.measureStorageUsage()
        assert.equal((await storageRow()).quotaReachedAt, null)
        assert(raised.retriedAssets >= 1)
        assert(queued.some(job => job.name === 'assetUpdateContentQueue' && job.assetFileId === outdated.id))
        await resetStorageUsage({ usedBytes: '900', quotaReachedAt: new Date() })
        state.bucketObjects = [{ name: 'asset-file/a', size: 900, lastModified: new Date() }]
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
    assert.equal(summary.collections.total, await db.getRepository(Collection).count())
    assert.equal(summary.folders.total, await db.getRepository(AssetFolder).count())
    assert(summary.recentFiles.length <= 3)
    for (const [index, file] of summary.recentFiles.entries()) {
        assert.deepEqual(Object.keys(file).sort(), ['folderId', 'id', 'name', 'size', 'status', 'updatedAt'])
        if (index) assert(summary.recentFiles[index - 1].updatedAt >= file.updatedAt)
    }
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

test('insights are admin only; each action is recorded once and survives the removal of its user', async () => {
    const { ActivityEvent } = require('../dist/entity/activity-event')
    const { pruneActivityEvents } = require('../dist/services/analytics')
    const range = { from: new Date(Date.now() - 86400000), to: new Date(Date.now() + 86400000) }
    for (const user of [null, guest, member, manager, { ...admin, approved: false }]) {
        for (const section of ['overview', 'assets', 'users', 'searches', 'collections']) await forbidden(caller(user).analytics[section](range))
    }
    const { user, license, file } = await exportFixture()
    const events = type => db.getRepository(ActivityEvent).countBy({ userId: user.id, type })
    await caller(user).user.me()
    await caller(user).user.me()
    assert.equal(await events('login'), 1)
    assert.notEqual((await db.getRepository(User).findOneByOrFail({ id: user.id })).lastLoginAt, null)
    await forbidden(caller(null).analytics.trackView({ collectionFileId: file.id }))
    await caller(user).analytics.trackView({ collectionFileId: file.id })
    await caller(user).collection.search({ query: ' Fixture ' })
    await caller(user).collection.search({ query: 'fixture', attributes: {} })
    await caller(user).collection.search({ query: 'fixture', page: 2 })
    await caller(user).collection.search({ query: 'no-such-file' })
    await caller(user).download.create({ ...downloadOptions, downloadType: 'direct', collectionFileIds: [file.id] })
    await caller(user).favorite.add({ collectionFileId: file.id })
    await caller(admin).collection.invitation.create({ collectionId: file.collectionId, email: user.email, expiresAt: '2099-01-01' })
    assert.deepEqual(await Promise.all(['asset_view', 'search', 'asset_download', 'favorite'].map(events)), [1, 2, 1, 1])
    await db.getRepository(License).update(license.id, { usageTo: '2000-01-01' })
    await assert.rejects(caller(user).analytics.trackView({ collectionFileId: file.id }), e => e.code === 'NOT_FOUND')
    await assert.rejects(caller(user).download.create({ ...downloadOptions, downloadType: 'direct', collectionFileIds: [file.id] }), /no longer available/)
    assert.equal(await events('asset_download'), 1)
    const overview = await caller(admin).analytics.overview(range)
    assert.equal(typeof overview.totals.downloads, 'number')
    assert(overview.totals.views >= 1 && overview.totals.downloadRequests >= 1 && overview.totals.shares >= 1 && overview.totals.activeUsers >= 1)
    assert(overview.series.some(day => day.downloads >= 1 && day.activeUsers >= 1))
    const assets = await caller(admin).analytics.assets(range)
    assert.deepEqual(assets.topDownloaded.find(row => row.id === file.assetFileId), { id: file.assetFileId, name: 'fixture.png', mimeType: 'image/png', assetType: null, downloads: 1, views: 1 })
    assert(!assets.neverDownloaded.files.some(row => row.id === file.assetFileId))
    assert.equal(typeof assets.storageByType[0].bytes, 'number')
    const people = await caller(admin).analytics.users(range)
    assert.equal(people.topDownloaders.find(row => row.id === user.id).downloads, 1)
    assert(people.byRole.some(row => row.name === 'member' && row.activeUsers >= 1))
    const searches = await caller(admin).analytics.searches(range)
    assert.equal(searches.topTerms.find(row => row.term === 'fixture').searches, 1)
    assert.deepEqual(searches.zeroResultTerms.find(row => row.term === 'no-such-file'), { term: 'no-such-file', searches: 1 })
    const shared = await caller(admin).analytics.collections(range)
    assert.equal(shared.mostShared.find(row => row.id === file.collectionId).shares, 1)
    assert((await caller(admin).user.list()).some(row => row.id === user.id && row.lastLoginAt))
    const recorded = await db.getRepository(ActivityEvent).countBy({ userId: user.id })
    await users.removeUser(await db.getRepository(User).findOneByOrFail({ id: user.id }))
    assert.equal(await db.getRepository(ActivityEvent).countBy({ userId: user.id }), 0)
    assert((await caller(admin).analytics.overview(range)).totals.downloads >= 1)
    await db.query(`UPDATE activity_events SET created_at = now() - interval '400 days' WHERE type = 'favorite'`)
    assert(await pruneActivityEvents() >= 1)
    assert.equal(await db.getRepository(ActivityEvent).countBy({ type: 'favorite' }), 0)
    assert(await db.getRepository(ActivityEvent).count() >= recorded - 1)
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
    state.bucketObjects = [
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

test('two measurements at the same time send one alert and queue the recovery once', async () => {
    await resetStorageUsage({ usedBytes: '900', quotaReachedAt: new Date() })
    env.storageQuota = () => 1000
    try {
        const outdated = await pendingAsset('outdated')
        state.bucketObjects = [{ name: 'asset-file/a', size: 850, lastModified: new Date() }]
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
        state.bucketObjects = [{ name: 'asset-file/a', size: 100, lastModified: new Date() }]
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
    state.disk = { totalBytes: 10000, freeBytes: 500 }
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
    } finally { env.serverAlertEmails = () => []; state.disk = { totalBytes: 10000, freeBytes: 9000 } }
})

test('only admins can designate an admin as maintenance contact, and no designated admin means no mail', async () => {
    await resetStorageUsage()
    env.storageQuota = () => 1000
    await db.getRepository(User).update({ maintenanceContact: true }, { maintenanceContact: false })
    try {
        state.bucketObjects = [{ name: 'asset-file/a', size: 850, lastModified: new Date() }]
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
    state.disk = { totalBytes: 10000, freeBytes: 500 }
    const previousTransporter = env.mailTransporter
    env.mailTransporter = () => ({ sendMail: async () => { throw new Error('Fixture SMTP outage') } })
    try {
        state.bucketObjects = [{ name: 'asset-file/a', size: 950, lastModified: new Date() }]
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
        state.bucketObjects = [{ name: 'asset-file/a', size: 950, lastModified: new Date() }]
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
        state.disk = { totalBytes: 10000, freeBytes: 9000 }
    }
})


test('host controls admin branding; clients cannot override it', async () => {
    const original = process.env.ADMIN_CLIENT_LOGO
    const alias = process.env['ADMIN-CLIENT-LOGO']
    try {
        delete process.env.ADMIN_CLIENT_LOGO
        delete process.env['ADMIN-CLIENT-LOGO']
        assert.deepEqual(await caller(admin).settings.getAdminBranding(), { useClientLogo: false })
        process.env.ADMIN_CLIENT_LOGO = 'true'
        assert.deepEqual(await caller(manager).settings.getAdminBranding(), { useClientLogo: true })
        process.env['ADMIN-CLIENT-LOGO'] = 'false'
        assert.deepEqual(await caller(admin).settings.getAdminBranding(), { useClientLogo: false })
        process.env['ADMIN-CLIENT-LOGO'] = 'true'
        assert.deepEqual(await caller(admin).settings.getAdminBranding(), { useClientLogo: true })
        for (const user of [null, guest, member, { ...admin, approved: false }]) {
            await forbidden(caller(user).settings.getAdminBranding())
        }
        for (const user of [null, guest, member, manager, { ...admin, emailVerified: false }]) {
            await forbidden(caller(user).settings.getClientLogoUpload({ contentType: 'image/png' }))
            await forbidden(caller(user).settings.processClientLogo({ uploadId: randomUUID() }))
            await forbidden(caller(user).settings.removeClientLogo())
        }
        await assert.rejects(caller(admin).settings.updateAdminBranding({ logoSource: 'tenant' }))
        await assert.rejects(caller(admin).settings.getClientLogoUpload({ contentType: 'text/html' }))
        await assert.rejects(caller(admin).settings.processClientLogo({ uploadId: '../logo' }))
    } finally {
        if (original === undefined) delete process.env.ADMIN_CLIENT_LOGO; else process.env.ADMIN_CLIENT_LOGO = original
        if (alias === undefined) delete process.env['ADMIN-CLIENT-LOGO']; else process.env['ADMIN-CLIENT-LOGO'] = alias
    }
})

test('logo uploads validate bytes, rasterise SVG, replace the previous object and clean staged files', async () => {
    const sharp = require('sharp')
    const { Client } = require('minio')
    const { LOGO_KEY, LOGO_TEMP_PREFIX, MAX_LOGO_BYTES } = require('../dist/services/branding')
    const previousS3 = env.mainS3
    const objects = new Map()
    const deleted = []
    const policies = []
    let revision = 0
    const fixtureClient = new Client({ endPoint: 'localhost', accessKey: 'fixture', secretKey: 'fixture-secret' })
    const notFound = () => Object.assign(new Error('missing'), { code: 'NoSuchKey' })
    env.mainS3 = () => ({
        newPostPolicy: () => fixtureClient.newPostPolicy(),
        presignedPostPolicy: async policy => { policies.push(policy); return { postURL: 'https://example.test/upload', formData: policy.formData } },
        statObject: async (_bucket, key) => {
            if (!objects.has(key)) throw notFound()
            const entry = objects.get(key)
            return { size: entry.size ?? entry.buffer.length, versionId: entry.versionId }
        },
        getObject: async (_bucket, key) => Readable.from([objects.get(key).buffer]),
        putObject: async (_bucket, key, buffer, _size, metadata) => {
            assert.equal(metadata['Content-Type'], 'image/webp')
            objects.set(key, { buffer, versionId: String(++revision) })
        },
        removeObject: async (_bucket, key, options) => {
            deleted.push({ key, versionId: options?.versionId })
            if (!options?.versionId || objects.get(key)?.versionId === options.versionId) objects.delete(key)
        },
        presignedGetObject: async (_bucket, key) => `https://example.test/${key}`,
        listObjects: (_bucket, prefix) => Readable.from([...objects].filter(([key]) => key.startsWith(prefix)).map(([name, item]) => ({ name, size: item.buffer.length, lastModified: item.lastModified ?? new Date() }))),
        removeObjects: async (_bucket, keys) => { keys.forEach(key => objects.delete(key)) },
    })
    const stage = buffer => {
        const uploadId = randomUUID()
        const key = `${LOGO_TEMP_PREFIX}${admin.id}/${uploadId}`
        objects.set(key, { buffer })
        return { uploadId, key }
    }
    try {
        assert.deepEqual(await caller(null).settings.getClientLogo(), { exists: false, imageUrl: null })
        const upload = await caller(admin).settings.getClientLogoUpload({ contentType: 'image/png' })
        assert.equal(upload.fields.key, `${LOGO_TEMP_PREFIX}${admin.id}/${upload.uploadId}`)
        assert(policies[0].policy.conditions.some(condition => condition[0] === 'content-length-range' && condition[2] === MAX_LOGO_BYTES))
        assert(new Date(policies[0].policy.expiration).getTime() <= Date.now() + 600_000)
        const svg = stage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><script>alert(1)</script><rect width="40" height="20" fill="blue"/></svg>'))
        await caller(admin).settings.processClientLogo({ uploadId: svg.uploadId })
        assert(!objects.has(svg.key))
        assert.equal((await sharp(objects.get(LOGO_KEY).buffer).metadata()).format, 'webp')
        assert.equal((await caller(null).settings.getClientLogo()).exists, true)
        const firstVersion = objects.get(LOGO_KEY).versionId
        const png = stage(await sharp({ create: { width: 80, height: 40, channels: 4, background: '#ff0000' } }).png().toBuffer())
        await caller(admin).settings.processClientLogo({ uploadId: png.uploadId })
        assert(deleted.some(item => item.key === LOGO_KEY && item.versionId === firstVersion))
        assert.equal(objects.size, 1)
        const retained = objects.get(LOGO_KEY).buffer
        const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).jpeg().toBuffer()
        for (const bytes of [Buffer.from('<html>not an image</html>'), jpeg, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>')]) {
            const invalid = stage(bytes)
            await assert.rejects(caller(admin).settings.processClientLogo({ uploadId: invalid.uploadId }))
            assert(!objects.has(invalid.key))
            assert.deepEqual(objects.get(LOGO_KEY).buffer, retained)
        }
        const oversized = stage(Buffer.from('x'))
        objects.get(oversized.key).size = MAX_LOGO_BYTES + 1
        await assert.rejects(caller(admin).settings.processClientLogo({ uploadId: oversized.uploadId }))
        assert(!objects.has(oversized.key))
        const otherAdmin = await makeUser('admin')
        const owned = stage(retained)
        await assert.rejects(caller(otherAdmin).settings.processClientLogo({ uploadId: owned.uploadId }))
        assert(objects.has(owned.key))
        await caller(admin).settings.processClientLogo({ uploadId: owned.uploadId }) // WebP accepted.
        const abandoned = stage(retained)
        objects.get(abandoned.key).lastModified = new Date(Date.now() - 2 * 86400_000)
        await storageService.removeOrphanObjects()
        assert(!objects.has(abandoned.key))
        assert(objects.has(LOGO_KEY))
        await caller(admin).settings.removeClientLogo()
        assert.equal(objects.size, 0)
    } finally { env.mainS3 = previousS3 }
})


test('search demand compares exact periods, detects daily spikes and surfaces gaps outside the top 50', async () => {
    const { ActivityEvent } = require('../dist/entity/activity-event')
    const range = { from: new Date('2030-06-08T00:00:00Z'), to: new Date('2030-06-15T00:00:00Z') }
    const events = []
    const record = (term, day, count, total = 1, userId = member.id) => {
        for (let index = 0; index < count; index++) events.push({ type: 'search', userId, metadata: { query: term, total }, createdAt: new Date(`2030-06-${day}T12:00:00Z`) })
    }
    for (let day = 1; day <= 7; day++) record('summer launch', String(day).padStart(2, '0'), 1)
    record('summer launch', '08', 15, 0)
    record('summer launch', '15', 70, 0)
    record('new product', '09', 5)
    record('quiet term', '10', 4)
    record('missing content', '11', 3, 0)
    for (let index = 0; index < 51; index++) record(`regular term ${index}`, '12', 4)
    await db.getRepository(ActivityEvent).insert(events)
    try {
        const report = await caller(admin).analytics.searches(range)
        const term = report.topTerms.find(row => row.term === 'summer launch')
        assert.equal(term.searches, 15)
        assert.equal(term.previousSearches, 7)
        assert.equal(term.zeroResults, 15)
        assert.equal(term.users, 1)
        assert.deepEqual(term.spike, { day: '2030-06-08', count: 15, baseline: 1 })
        assert.equal(report.totals.spikes, 2)
        assert.equal(report.totals.searches, 231)
        assert.equal(report.totals.zeroResults, 18)
        assert.equal(report.volume.reduce((sum, row) => sum + row.count, 0), 231)
        assert.equal(report.volume.find(row => row.day === '2030-06-08').zeroResults, 15)
        assert(!report.topTerms.some(row => row.term === 'missing content'))
        assert(report.signals.some(row => row.term === 'missing content'))
        assert(!report.signals.some(row => row.term === 'quiet term'))
        const empty = await caller(admin).analytics.searches({ from: new Date('2029-01-01Z'), to: new Date('2029-01-02Z') })
        assert.equal(empty.totals.searches, 0)
        assert.deepEqual(empty.signals, [])
        const partial = await caller(admin).analytics.searches({ from: new Date('2030-06-08T13:00:00Z'), to: range.to })
        assert.equal(partial.volume.reduce((sum, row) => sum + row.count, 0), partial.totals.searches)
        assert(!partial.signals.some(row => row.term === 'summer launch'))
    } finally {
        await db.query("DELETE FROM activity_events WHERE created_at >= '2030-06-01' AND created_at < '2030-06-16'")
    }
})

test('search audience is admin-only, exact-term scoped, and excludes non-contactable accounts', async () => {
    const { ActivityEvent } = require('../dist/entity/activity-event')
    const range = { from: new Date('2031-01-01T00:00:00Z'), to: new Date('2031-01-02T00:00:00Z') }
    const unverified = await makeUser('member', { emailVerified: false })
    const unapproved = await makeUser('member', { approved: false })
    const people = [member, guest, unverified, unapproved]
    await db.getRepository(ActivityEvent).insert([
        ...people.map(user => ({ type: 'search', userId: user.id, metadata: { query: 'launch', total: 0 }, createdAt: range.from })),
        { type: 'search', userId: null, metadata: { query: 'launch', total: 0 }, createdAt: range.from },
        { type: 'search', userId: admin.id, metadata: { query: 'launch extra', total: 1 }, createdAt: range.from },
    ])
    try {
        for (const user of [null, guest, member, manager, { ...admin, approved: false }]) {
            await forbidden(caller(user).analytics.searchTerm({ ...range, term: 'launch' }))
        }
        const details = await caller(admin).analytics.searchTerm({ ...range, term: 'launch' })
        assert.equal(details.audienceCount, 1)
        assert.deepEqual(details.audience.map(row => row.id), [member.id])
        assert.equal(details.audience[0].zeroResults, 1)
        assert.equal(details.volume[0].count, 5)
        assert.deepEqual((await caller(admin).analytics.searchTerm({ ...range, term: "launch' OR 1=1 --" })).audience, [])
        for (const invalid of [{ from: range.to, to: range.from }, { from: range.from, to: range.from }, { from: range.from, to: new Date('2033-01-01Z') }]) {
            await assert.rejects(caller(admin).analytics.searches(invalid), error => error.code === 'BAD_REQUEST')
            await assert.rejects(caller(admin).analytics.searchTerm({ ...invalid, term: 'launch' }), error => error.code === 'BAD_REQUEST')
        }
    } finally {
        await db.query("DELETE FROM activity_events WHERE created_at >= '2031-01-01' AND created_at < '2031-01-02'")
    }
})
