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
// Storage quota, server disk alerts and the maintenance contact.
// See docs/administration/dashboard.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { env, db, worker, storage, state, caller, makeUser, makeFolder, makeFile, storageRow, resetStorageUsage } = harness
const { User, AssetFile } = harness.entities
const storageService = require('../dist/services/storage')
const { formatBytes } = storageService
const { queued, processors, sentMails, fetchedFiles } = state
let admin, member, manager
before(async () => ({ admin, member, manager } = await harness.setup()))
after(() => harness.teardown())

const pendingAsset = async (status = 'creating', size = '16') =>
    makeFile(await makeFolder({ name: 'Quota folder' }), { name: 'fixture.bin', externalChecksum: 'fixture', status, size, mimeType: 'application/octet-stream' })
const runUpdateJob = assetFileId => processors.get('asset/update-content')([{ id: randomUUID(), name: 'asset/update-content', data: { assetFileId } }])

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
        // A mail server that refuses the alert leaves the level unclaimed for the next run.
        const previousTransporter = env.mailTransporter
        env.mailTransporter = () => ({ sendMail: async () => { throw new Error('Fixture SMTP down') } })
        try {
            state.bucketObjects = [{ name: 'asset-file/a', size: 1000, lastModified: new Date() }]
            await assert.rejects(storageService.measureStorageUsage(), /Fixture SMTP down/)
            assert.equal(sentMails.length, 2)
            assert.equal((await storageRow()).alertLevel, 0)
        } finally { env.mailTransporter = previousTransporter }
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

test('formatBytes uses decimal units with one decimal above bytes', () => {
    assert.equal(formatBytes(0), '0 B')
    assert.equal(formatBytes(999), '999 B')
    assert.equal(formatBytes(1000), '1.0 KB')
    assert.equal(formatBytes(1536), '1.5 KB')
    assert.equal(formatBytes(1500000000000), '1.5 TB')
    assert.equal(formatBytes(1e18), '1000.0 PB')
})
