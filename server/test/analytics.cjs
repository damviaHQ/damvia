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
// Insights: activity events and the search reports.
// See docs/administration/insights.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { IsNull } = require('typeorm')
const harness = require('./lib/helpers.cjs')
const { db, caller, makeUser, forbidden, downloadOptions, exportFixture } = harness
const { User, License, ActivityEvent } = harness.entities
const { users } = harness.services
const { pruneActivityEvents } = require('../dist/services/analytics')
const { searchInsights, searchTermDetails } = require('../dist/services/search-insights')
let admin, member, manager, guest
before(async () => ({ admin, member, manager, guest } = await harness.setup()))
after(() => harness.teardown())

test('insights are admin only; each action is recorded once and survives the removal of its user', async () => {
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
    await assert.rejects(caller(user).download.create({ ...downloadOptions, downloadType: 'direct', collectionFileIds: [file.id] }), error => error.code === 'BAD_REQUEST' && /No files are available/.test(error.message))
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
    const anonymous = await db.getRepository(ActivityEvent).countBy({ userId: IsNull() })
    const downloads = (await caller(admin).analytics.overview(range)).totals.downloads
    await users.removeUser(await db.getRepository(User).findOneByOrFail({ id: user.id }))
    assert.equal(await db.getRepository(ActivityEvent).countBy({ userId: user.id }), 0)
    assert.equal(await db.getRepository(ActivityEvent).countBy({ userId: IsNull() }), anonymous + recorded)
    assert.equal((await caller(admin).analytics.overview(range)).totals.downloads, downloads)
    const favorites = await db.getRepository(ActivityEvent).countBy({ type: 'favorite' })
    const total = await db.getRepository(ActivityEvent).count()
    await db.query(`UPDATE activity_events SET created_at = now() - interval '400 days' WHERE type = 'favorite'`)
    assert.equal(await pruneActivityEvents(), favorites)
    assert.equal(await db.getRepository(ActivityEvent).countBy({ type: 'favorite' }), 0)
    assert.equal(await db.getRepository(ActivityEvent).count(), total - favorites)
})

test('search demand compares exact periods, detects daily spikes and surfaces gaps outside the top 50', async () => {
    const range = { from: new Date('2030-06-08T00:00:00Z'), to: new Date('2030-06-15T00:00:00Z') }
    const events = []
    const record = (term, day, count, total = 1, userId = member.id) => {
        for (let index = 0; index < count; index++) events.push({ type: 'search', userId, metadata: { query: term, total }, createdAt: new Date(`2030-06-${day}T12:00:00Z`) })
    }
    for (let day = 1; day <= 7; day++) record('summer launch', String(day).padStart(2, '0'), 1)
    record('summer launch', '08', 15, 0)
    record('summer launch', '15', 70, 0)
    record('new record', '09', 5)
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

test('search reports average the results, count people once, skip empty queries and rank signals', async () => {
    const range = { from: new Date('2032-03-10T00:00:00Z'), to: new Date('2032-03-11T00:00:00Z') }
    const other = await makeUser()
    const at = hour => new Date(`2032-03-10T${String(hour).padStart(2, '0')}:00:00Z`)
    const event = (userId, query, total, hour) => ({ type: 'search', userId, metadata: { query, total }, createdAt: at(hour) })
    await db.getRepository(ActivityEvent).insert([
        event(member.id, 'catalogue', 4, 1), event(member.id, 'catalogue', 8, 2), event(other.id, 'catalogue', 0, 3),
        event(member.id, 'lost term', 0, 4), event(other.id, 'lost term', 0, 5), event(null, 'lost term', 0, 6),
        event(member.id, 'rare gap', 0, 7), event(member.id, 'rare gap', 0, 8), event(other.id, 'rare gap', 0, 9), event(other.id, 'rare gap', 0, 10),
        event(member.id, '', 0, 11),
        { type: 'search', userId: member.id, metadata: { query: 'catalogue', total: 1 }, createdAt: new Date('2032-03-11T00:00:00Z') },
    ])
    try {
        const report = await searchInsights(range)
        assert.deepEqual(report.totals, { searches: 11, users: 2, zeroResults: 9, terms: 3, spikes: 0 })
        assert.deepEqual(report.topTerms.map(row => [row.term, row.searches, row.users, row.avgResults, row.zeroResults]), [
            ['rare gap', 4, 2, 0, 4], ['catalogue', 3, 2, 4, 1], ['lost term', 3, 2, 0, 3],
        ])
        assert.deepEqual(report.signals.map(row => row.term), ['rare gap', 'lost term'])
        assert.equal(report.signalCount, 2)
        assert.deepEqual(report.zeroResultTerms, [{ term: 'rare gap', searches: 4 }, { term: 'lost term', searches: 3 }, { term: 'catalogue', searches: 1 }])
        assert.deepEqual(report.volume, [{ day: '2032-03-10', count: 10, zeroResults: 8 }])
        assert.deepEqual(await caller(admin).analytics.searches(range), JSON.parse(JSON.stringify(report)))
        const details = await searchTermDetails({ ...range, term: 'rare gap' })
        assert.deepEqual(details.audience.map(row => [row.id, row.searches, row.zeroResults, new Date(row.lastSearchAt).toISOString()]), [
            [member.id, 2, 2, at(8).toISOString()], [other.id, 2, 2, at(10).toISOString()],
        ].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
        assert.equal(details.audienceCount, 2)
        assert.deepEqual(details.volume, [{ day: '2032-03-10', count: 4, zeroResults: 4 }])
    } finally {
        await db.query("DELETE FROM activity_events WHERE created_at >= '2032-03-10' AND created_at <= '2032-03-11'")
    }
})
