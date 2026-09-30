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
// Newsletters sent to everyone or a chosen audience. See docs/administration/newsletters.md.
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Readable } = require('node:stream')
const { Client } = require('minio')
const sharp = require('sharp')
const harness = require('./lib/helpers.cjs')
const { env, db, caller, makeUser, forbidden, state, server, save, entities } = harness
const rateLimit = require('../dist/services/rate-limit')
const newsletters = require('../dist/services/newsletter')
const { sanitizeNewsletterHtml, newsletterImageUrl } = require('../dist/mail/newsletter-sanitize')
const { NEWSLETTER_IMAGE_TEMP_PREFIX } = require('../dist/services/newsletter-image')
let admin, member, manager, guest
before(async () => ({ admin, member, manager, guest } = await harness.setup()))
after(() => harness.teardown())
beforeEach(async () => {
    rateLimit.resetRateLimits()
    state.sentMails.length = 0
    state.queued.length = 0
    await db.query('DELETE FROM newsletters')
    await db.query('DELETE FROM audiences')
    await db.query('UPDATE users SET newsletter_opt_out_at = NULL')
})

const NOBODY = { everyone: false, roles: [], groupIds: [], regionIds: [], includeUserIds: [], excludeUserIds: [] }
const audience = (overrides = {}) => ({ ...NOBODY, ...overrides })
const content = (overrides = {}) => ({ subject: 'News for {{ user.firstName }}', preheader: 'This month', heading: 'Hello {{ user.name }}', bodyHtml: '<p>Hi {{ user.firstName }}, welcome to {{ appName }}.</p>', ...overrides })

async function draft(filter, overrides = {}) {
    const { id } = await caller(admin).newsletter.create({ name: 'Monthly' })
    await caller(admin).newsletter.update({ id, name: 'Monthly', audienceId: null, filter, ...content(overrides) })
    return id
}

// Starts what is due and sends every batch the way the worker does.
async function runSending() {
    await state.processors.get('newsletter/dispatch')([{ id: randomUUID(), name: 'newsletter/dispatch', data: null }])
    const jobs = state.queued.filter(job => job.name === 'newsletterSendQueue')
    state.queued.length = 0
    for (const { name: _name, ...data } of jobs) {
        await state.processors.get('newsletter/send')([{ id: randomUUID(), name: 'newsletter/send', data }])
    }
}

async function team() {
    const group = await save(entities.Group, { name: `Group ${randomUUID()}` })
    const region = await save(entities.Region, { name: `Region ${randomUUID()}`, defaultGroupId: group.id })
    const inGroup = async (user) => { await save(entities.UserGroup, { userId: user.id, groupId: group.id }); return user }
    return {
        group, region,
        guestHere: await inGroup(await makeUser('guest', { regionId: region.id, name: 'Ada Guest' })),
        memberHere: await inGroup(await makeUser('member', { regionId: region.id, name: 'Bea Member' })),
        memberElsewhere: await inGroup(await makeUser('member', { name: 'Cy Elsewhere' })),
        guestNoGroup: await makeUser('guest', { regionId: region.id, name: 'Dee Nogroup' }),
    }
}
const ids = result => result.sample.map(user => user.id).sort()

test('only admins manage newsletters and audiences; the unsubscribe link needs no account', async () => {
    const id = await draft(audience({ everyone: true }))
    for (const user of [null, guest, member, manager, { ...admin, approved: false }]) {
        const as = caller(user).newsletter
        await forbidden(as.list())
        await forbidden(as.get(id))
        await forbidden(as.create({ name: 'x' }))
        await forbidden(as.update({ id, name: 'x', audienceId: null, filter: NOBODY, ...content() }))
        await forbidden(as.duplicate(id))
        await forbidden(as.remove(id))
        await forbidden(as.preview(content()))
        await forbidden(as.sendTest(content()))
        await forbidden(as.schedule({ id, at: null }))
        await forbidden(as.cancel(id))
        await forbidden(as.resume(id))
        await forbidden(as.recipients({ id }))
        await forbidden(as.audienceSize(NOBODY))
        await forbidden(as.people())
        await forbidden(as.audiences())
        await forbidden(as.saveAudience({ name: 'x', filter: NOBODY }))
        await forbidden(as.removeAudience(randomUUID()))
        await forbidden(as.createImageUpload({ contentType: 'image/png' }))
        await forbidden(as.finalizeImageUpload({ uploadId: randomUUID(), newsletterId: null }))
    }
    await forbidden(caller(null).newsletter.mySubscription())
    await assert.rejects(caller(null).newsletter.subscription({ token: 'not-a-real-token' }), /not valid/)
})

test('an audience is everyone, or the people matching every criterion, plus and minus people picked by hand', async () => {
    const t = await team()
    const size = filter => caller(admin).newsletter.audienceSize(audience(filter))

    assert.equal((await size({})).count, 0, 'nothing chosen reaches nobody')
    assert.deepEqual(ids(await size({ regionIds: [t.region.id] })), [t.guestHere.id, t.memberHere.id, t.guestNoGroup.id].sort())
    assert.deepEqual(ids(await size({ groupIds: [t.group.id] })), [t.guestHere.id, t.memberHere.id, t.memberElsewhere.id].sort())
    assert.deepEqual(ids(await size({ groupIds: [t.group.id], regionIds: [t.region.id] })), [t.guestHere.id, t.memberHere.id].sort(), 'criteria combine with AND')
    assert.deepEqual(ids(await size({ roles: ['guest'], regionIds: [t.region.id] })), [t.guestHere.id, t.guestNoGroup.id].sort())
    assert.deepEqual(ids(await size({ roles: ['guest'], regionIds: [t.region.id], includeUserIds: [t.memberElsewhere.id], excludeUserIds: [t.guestNoGroup.id] })),
        [t.guestHere.id, t.memberElsewhere.id].sort())
    assert.deepEqual(ids(await size({ includeUserIds: [t.memberHere.id] })), [t.memberHere.id], 'a hand-picked list on its own')

    const everyone = await size({ everyone: true })
    const [{ count }] = await db.query('SELECT count(*)::int AS count FROM users WHERE approved AND email_verified AND suspended_at IS NULL')
    assert.equal(everyone.count, count)
    assert.equal((await size({ everyone: true, excludeUserIds: [t.memberHere.id] })).count, count - 1)

    // Nobody who cannot receive it, not even when picked by hand.
    const unreachable = [
        await makeUser('member', { regionId: t.region.id, approved: false }),
        await makeUser('member', { regionId: t.region.id, emailVerified: false }),
        await makeUser('member', { regionId: t.region.id, suspendedAt: new Date() }),
        await makeUser('member', { regionId: t.region.id, newsletterOptOutAt: new Date() }),
    ]
    const picked = await size({ regionIds: [t.region.id], includeUserIds: unreachable.map(user => user.id) })
    assert.equal(picked.count, 3)
    assert.equal((await size({ everyone: true })).count, count)

    const people = await caller(admin).newsletter.people()
    assert(people.some(person => person.id === t.guestHere.id && person.reachable))
    assert.equal(people.find(person => person.id === unreachable[3].id).reachable, false)
})

test('saved audiences are reused, counted and audited; a newsletter keeps its own copy of the filter', async () => {
    const t = await team()
    const saved = await caller(admin).newsletter.saveAudience({ name: 'Region guests', filter: audience({ roles: ['guest'], regionIds: [t.region.id] }) })
    const [listed] = await caller(admin).newsletter.audiences()
    assert.equal(listed.name, 'Region guests')
    assert.equal(listed.count, 2)
    const id = await draft(listed.filter)
    await db.query('UPDATE newsletters SET audience_id = $1 WHERE id = $2', [saved.id, id])

    await caller(admin).newsletter.saveAudience({ id: saved.id, name: 'Everyone in region', filter: audience({ regionIds: [t.region.id] }) })
    assert.deepEqual((await caller(admin).newsletter.get(id)).filter.roles, ['guest'], 'editing the audience does not change the newsletter')
    await caller(admin).newsletter.removeAudience(saved.id)
    assert.equal((await caller(admin).newsletter.get(id)).audienceId, null)
    await caller(admin).newsletter.update({ id, name: 'Monthly', audienceId: saved.id, filter: listed.filter, ...content() })
    assert.equal((await caller(admin).newsletter.get(id)).audienceId, null, 'a deleted audience is dropped, not an error')
    const actions = (await db.query(`SELECT action FROM audit_log WHERE target_id = $1 ORDER BY created_at`, [saved.id])).map(row => row.action)
    assert.deepEqual(actions, ['audience.saved', 'audience.saved', 'audience.removed'])
    await assert.rejects(caller(admin).newsletter.saveAudience({ name: 'x', filter: { ...NOBODY, roles: ['owner'] } }))
})

test('a newsletter is scheduled, can be taken back to a draft, and is locked once it starts', async () => {
    const t = await team()
    const id = await draft(audience({ regionIds: [t.region.id] }))
    await assert.rejects(caller(admin).newsletter.schedule({ id, at: new Date(Date.now() - 3600_000) }), /future/)
    const at = new Date(Date.now() + 3600_000)
    const scheduled = await caller(admin).newsletter.schedule({ id, at })
    assert.equal(scheduled.recipients, 3)
    assert.equal((await caller(admin).newsletter.get(id)).status, 'scheduled')
    await assert.rejects(caller(admin).newsletter.update({ id, name: 'x', audienceId: null, filter: NOBODY, ...content() }), /Unschedule/)
    const sneaky = await draft(NOBODY)
    await caller(admin).newsletter.update({ id: sneaky, name: 'x', audienceId: null, filter: NOBODY, ...content(), status: 'sent', createdById: member.id })
    const [row] = await db.query('SELECT status, created_by_id FROM newsletters WHERE id = $1', [sneaky])
    assert.deepEqual([row.status, row.created_by_id], ['draft', admin.id], 'extra fields are ignored')
    await assert.rejects(caller(admin).newsletter.schedule({ id, at }), /already/)
    await assert.rejects(caller(admin).newsletter.remove(id), /draft/)

    await runSending()
    assert.equal((await caller(admin).newsletter.get(id)).status, 'scheduled', 'not due yet')
    await caller(admin).newsletter.cancel(id)
    assert.equal((await caller(admin).newsletter.get(id)).status, 'draft')
    await assert.rejects(caller(admin).newsletter.cancel(id), /started/)

    // Nobody to send to, or nothing written, is refused before it is scheduled.
    const empty = await draft(NOBODY)
    await assert.rejects(caller(admin).newsletter.schedule({ id: empty, at: null }), /Nobody/)
    const blank = await draft(audience({ everyone: true }), { subject: '' })
    await assert.rejects(caller(admin).newsletter.schedule({ id: blank, at: null }), /subject/)
    const noBody = await draft(audience({ everyone: true }), { bodyHtml: '<p> </p>' })
    await assert.rejects(caller(admin).newsletter.schedule({ id: noBody, at: null }), /message/)

    // Starting twice (two workers, or a retried job) sends once.
    await caller(admin).newsletter.schedule({ id, at: null })
    assert(state.queued.some(job => job.name === 'newsletterDispatchQueue'))
    const [first, second] = await Promise.all([newsletters.startDueNewsletters(), newsletters.startDueNewsletters()])
    assert.equal(first.length + second.length, 1)
    assert.equal((await caller(admin).newsletter.get(id)).status, 'sending')
    await assert.rejects(caller(admin).newsletter.cancel(id), /started/)
})

test('each person gets their own message with their name, escaped, and an unsubscribe link', async () => {
    const t = await team()
    const sneaky = await makeUser('guest', { regionId: t.region.id, name: '<img src=x onerror=alert(1)> Eve' })
    const id = await draft(audience({ regionIds: [t.region.id] }))
    await caller(admin).newsletter.schedule({ id, at: null })
    await runSending()

    const newsletter = await caller(admin).newsletter.get(id)
    assert.equal(newsletter.status, 'sent')
    assert.deepEqual({ total: newsletter.counts.total, sent: newsletter.counts.sent, failed: newsletter.counts.failed }, { total: 4, sent: 4, failed: 0 })
    assert.equal(state.sentMails.length, 4)
    for (const mail of state.sentMails) {
        assert.equal(typeof mail.to, 'object', 'one recipient per message')
        assert.match(mail.headers['List-Unsubscribe'], /^<https?:\/\/[^>]+\/v1\/unsubscribe\/[^>]+>$/)
        assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
        assert.match(mail.html, /\/unsubscribe\?token=/)
        assert.match(mail.text, /Unsubscribe: /)
    }
    const ada = state.sentMails.find(mail => mail.to.address === t.guestHere.email)
    assert.equal(ada.subject, 'News for Ada')
    assert.match(ada.html, /Hello Ada Guest/)
    const eve = state.sentMails.find(mail => mail.to.address === sneaky.email)
    assert(!eve.html.includes('<img src=x'), 'a name cannot add markup')
    assert.match(eve.html, /&lt;img src=x onerror=alert\(1\)&gt; Eve/)
    const audit = await db.query(`SELECT action FROM audit_log WHERE target_id = $1 ORDER BY created_at`, [id])
    assert.deepEqual(audit.map(row => row.action), ['newsletter.created', 'newsletter.updated', 'newsletter.scheduled', 'newsletter.sent'])
})

test('failures are kept per person and retried without sending twice; people who leave meanwhile are skipped', async () => {
    const t = await team()
    const id = await draft(audience({ regionIds: [t.region.id] }))
    await caller(admin).newsletter.schedule({ id, at: null })
    await state.processors.get('newsletter/dispatch')([{ id: randomUUID(), name: 'newsletter/dispatch', data: null }])
    await db.query('UPDATE users SET newsletter_opt_out_at = now() WHERE id = $1', [t.guestNoGroup.id])

    const previous = env.newsletterTransporter
    env.newsletterTransporter = () => ({ sendMail: async mail => {
        if (mail.to.address === t.memberHere.email) throw new Error('550 mailbox unavailable')
        state.sentMails.push(mail)
    } })
    try {
        const jobs = state.queued.filter(job => job.name === 'newsletterSendQueue')
        state.queued.length = 0
        for (const { name: _name, ...data } of jobs) {
            await state.processors.get('newsletter/send')([{ id: randomUUID(), name: 'newsletter/send', data }])
            // A job retried after it finished sends nothing again.
            await state.processors.get('newsletter/send')([{ id: randomUUID(), name: 'newsletter/send', data }])
        }
    } finally {
        env.newsletterTransporter = previous
    }
    let newsletter = await caller(admin).newsletter.get(id)
    assert.equal(newsletter.status, 'sent')
    assert.deepEqual({ sent: newsletter.counts.sent, failed: newsletter.counts.failed, skipped: newsletter.counts.skipped }, { sent: 1, failed: 1, skipped: 1 })
    assert.equal(state.sentMails.length, 1)
    const failed = await caller(admin).newsletter.recipients({ id, status: 'failed' })
    assert.equal(failed.total, 1)
    assert.match(failed.items[0].error, /550/)

    state.sentMails.length = 0
    assert.deepEqual(await caller(admin).newsletter.resume(id), { retried: 1 })
    const jobs = state.queued.filter(job => job.name === 'newsletterSendQueue')
    for (const { name: _name, ...data } of jobs) await state.processors.get('newsletter/send')([{ id: randomUUID(), name: 'newsletter/send', data }])
    newsletter = await caller(admin).newsletter.get(id)
    assert.equal(newsletter.status, 'sent')
    assert.equal(newsletter.counts.sent, 2)
    assert.deepEqual(state.sentMails.map(mail => mail.to.address), [t.memberHere.email])
})

test('the body keeps newsletter images and buttons only, and nothing that runs', async () => {
    const image = newsletterImageUrl(randomUUID(), 'png')
    const clean = sanitizeNewsletterHtml([
        `<p><img src="${image}" alt="Team" width="9999" onerror="alert(1)"></p>`,
        '<img src="https://tracker.example/pixel.gif">',
        `<img src="${image.replace('.png', '.png/../../trpc/user.me')}">`,
        '<a data-button="yes" href="https://example.test/go" onclick="x()">Go</a>',
        '<a data-button href="javascript:alert(1)">Bad</a>',
        '<p style="color:red" class="x">Text</p><script>alert(1)</script>',
    ].join(''))
    assert(clean.includes(`<img src="${image}" alt="Team" width="480" />`), clean)
    assert(!clean.includes('tracker.example') && !clean.includes('user.me'))
    assert(clean.includes('<a data-button href="https://example.test/go" rel="noopener noreferrer">Go</a>'), clean)
    assert(!/javascript|onclick|onerror|script|style=|class=/.test(clean), clean)

    const preview = await caller(admin).newsletter.preview(content({ bodyHtml: `<p>Look</p><img src="${image}" alt="Team"><a data-button href="https://example.test/go">Open the portal</a>` }))
    assert.match(preview.html, /<td bgcolor="#[0-9a-f]{6}"[^>]*>\s*<a href="https:\/\/example.test\/go"[^>]*>Open the portal<\/a>/)
    assert.match(preview.html, /<img src="[^"]+" alt="Team" width="480" style="display:block;max-width:100%/)
    assert.equal(preview.subject, `News for ${admin.name.split(' ')[0]}`)

    await assert.rejects(caller(admin).newsletter.preview(content({ bodyHtml: '<p>{% include "x" %}</p>' })), /error/)
})

test('images are stored as PNG or JPEG and served publicly; unknown ones are a plain 404', async () => {
    const previousS3 = env.mainS3
    const objects = new Map()
    const fixtureClient = new Client({ endPoint: 'localhost', accessKey: 'fixture', secretKey: 'fixture-secret' })
    const notFound = () => Object.assign(new Error('missing'), { code: 'NoSuchKey' })
    env.mainS3 = () => ({
        newPostPolicy: () => fixtureClient.newPostPolicy(),
        presignedPostPolicy: async policy => ({ postURL: 'https://example.test/upload', formData: policy.formData }),
        statObject: async (_bucket, key) => { if (!objects.has(key)) throw notFound(); return { size: objects.get(key).length } },
        getObject: async (_bucket, key) => { if (!objects.has(key)) throw notFound(); return Readable.from([objects.get(key)]) },
        putObject: async (_bucket, key, buffer) => { objects.set(key, buffer) },
        removeObject: async (_bucket, key) => { objects.delete(key) },
    })
    try {
        const upload = await caller(admin).newsletter.createImageUpload({ contentType: 'image/webp' })
        const photo = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#3366ff' } }).webp().toBuffer()
        objects.set(`${NEWSLETTER_IMAGE_TEMP_PREFIX}${admin.id}/${upload.uploadId}`, photo)
        const stored = await caller(admin).newsletter.finalizeImageUpload({ uploadId: upload.uploadId, newsletterId: null })
        assert.match(stored.url, /\/v1\/newsletter-images\/[0-9a-f-]{36}\.jpg$/)
        assert.equal(stored.width, 480)
        assert(![...objects.keys()].some(key => key.startsWith(NEWSLETTER_IMAGE_TEMP_PREFIX)), 'the upload is removed')

        const served = await server.inject({ method: 'GET', url: new URL(stored.url).pathname })
        assert.equal(served.statusCode, 200)
        assert.equal(served.headers['content-type'], 'image/jpeg')
        assert.equal(served.headers['cross-origin-resource-policy'], 'cross-origin')
        const metadata = await sharp(served.rawPayload).metadata()
        assert.deepEqual([metadata.format, metadata.width], ['jpeg', 960])

        const logo = await caller(admin).newsletter.createImageUpload({ contentType: 'image/png' })
        objects.set(`${NEWSLETTER_IMAGE_TEMP_PREFIX}${admin.id}/${logo.uploadId}`, await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer())
        assert.match((await caller(admin).newsletter.finalizeImageUpload({ uploadId: logo.uploadId, newsletterId: null })).url, /\.png$/, 'transparency stays PNG')

        const bad = await caller(admin).newsletter.createImageUpload({ contentType: 'image/png' })
        objects.set(`${NEWSLETTER_IMAGE_TEMP_PREFIX}${admin.id}/${bad.uploadId}`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
        await assert.rejects(caller(admin).newsletter.finalizeImageUpload({ uploadId: bad.uploadId, newsletterId: null }), /valid JPEG/)

        for (const url of [`/v1/newsletter-images/${randomUUID()}.jpg`, new URL(stored.url).pathname.replace('.jpg', '.png'), '/v1/newsletter-images/..%2Fsettings.png']) {
            const missing = await server.inject({ method: 'GET', url })
            assert.equal(missing.statusCode, 404, url)
            assert.equal(missing.body, '')
        }
    } finally {
        env.mainS3 = previousS3
    }
})

test('the unsubscribe link and the mail client button stop newsletters for that one account', async () => {
    const reader = await makeUser('guest', { name: 'Reader' })
    const token = await newsletters.createUnsubscribeToken(reader.id)
    const status = await caller(null).newsletter.subscription({ token })
    assert.equal(status.subscribed, true)
    assert(!status.email.includes(reader.email.split('@')[0]), 'the address is masked')
    assert.equal((await db.query('SELECT newsletter_opt_out_at FROM users WHERE id = $1', [reader.id]))[0].newsletter_opt_out_at, null, 'reading the link changes nothing')

    assert.equal((await caller(null).newsletter.unsubscribe({ token })).subscribed, false)
    assert.equal((await caller(admin).newsletter.audienceSize(audience({ includeUserIds: [reader.id] }))).count, 0)
    await caller(null).newsletter.unsubscribe({ token, subscribed: true })
    assert.equal((await caller(reader).newsletter.mySubscription()).subscribed, false, 'the link cannot subscribe again')

    await caller(reader).newsletter.setMySubscription({ subscribed: true })
    assert.equal((await caller(reader).newsletter.mySubscription()).subscribed, true)
    await assert.rejects(caller(null).newsletter.unsubscribe({ token }), /not valid/, 'a change from the account ends the links already sent')
    assert.equal((await server.inject({ method: 'POST', url: `/v1/unsubscribe/${token}` })).statusCode, 400)

    const fresh = await newsletters.createUnsubscribeToken(reader.id)
    const logged = []
    const previousInfo = env.logger.info
    env.logger.info = (message, meta) => { logged.push(meta?.path) }
    const oneClick = await server.inject({ method: 'POST', url: `/v1/unsubscribe/${fresh}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'List-Unsubscribe=One-Click' })
    env.logger.info = previousInfo
    assert.equal(oneClick.statusCode, 200)
    assert(!logged.some(path => path?.includes(fresh)), 'the token is not written to the log')
    assert.equal((await caller(reader).newsletter.mySubscription()).subscribed, false)

    const { sign } = require('jsonwebtoken')
    const forged = [
        sign({ purpose: 'newsletter-unsubscribe', sub: reader.id, v: 1 }, 'another-secret-that-is-long-enough-000'),
        sign({ purpose: 'mfa', sub: reader.id, v: 1 }, env.secret()),
        sign({ purpose: 'newsletter-unsubscribe', sub: reader.id }, env.secret()),
        sign({ purpose: 'newsletter-unsubscribe', sub: reader.id, v: 1, exp: Math.floor(Date.now() / 1000) - 60 }, env.secret()),
        'garbage.token.value',
    ]
    for (const bad of forged) {
        await assert.rejects(caller(null).newsletter.unsubscribe({ token: bad }), /not valid/)
        assert.equal((await server.inject({ method: 'POST', url: `/v1/unsubscribe/${bad}` })).statusCode, 400)
    }
    const actions = (await db.query(`SELECT action FROM audit_log WHERE target_id = $1 AND action LIKE 'newsletter.%' ORDER BY created_at`, [reader.id])).map(row => row.action)
    assert.deepEqual(actions, ['newsletter.unsubscribed', 'newsletter.resubscribed', 'newsletter.unsubscribed'])
})

test('a test goes to the admin who sends it, drafts are duplicated and deleted, previews are not audited', async () => {
    const result = await caller(admin).newsletter.sendTest(content())
    assert.equal(result.sentTo, admin.email)
    assert.equal(state.sentMails.at(-1).to, admin.email)
    assert.match(state.sentMails.at(-1).subject, /^\[Test\] News for /)
    assert.match(state.sentMails.at(-1).html, /\/unsubscribe\?token=/, 'the test shows the unsubscribe link the readers get')
    assert.match(state.sentMails.at(-1).headers['List-Unsubscribe'], /\/v1\/unsubscribe\//)
    for (let index = 0; index < 10; index++) await caller(admin).newsletter.sendTest(content()).catch(() => {})
    await assert.rejects(caller(admin).newsletter.sendTest(content()), /Too many/)

    const id = await draft(audience({ everyone: true }))
    const copy = await caller(admin).newsletter.duplicate(id)
    const duplicated = await caller(admin).newsletter.get(copy.id)
    assert.equal(duplicated.name, 'Copy of Monthly')
    assert.equal(duplicated.status, 'draft')
    assert.equal(duplicated.filter.everyone, true)
    await caller(admin).newsletter.remove(copy.id)
    assert.equal((await caller(admin).newsletter.list()).length, 1)

    await caller(admin).newsletter.preview(content())
    await caller(admin).newsletter.audienceSize(NOBODY)
    const generic = await db.query(`SELECT target_id FROM audit_log WHERE action = 'admin.change' AND target_id IN ('newsletter.preview', 'newsletter.audienceSize', 'newsletter.update')`)
    assert.deepEqual(generic, [], 'previews and counts run on every keystroke; updates record their own entry')
})

test('two jobs holding the same people, a retry and a stuck send racing, send each person one message', async () => {
    const t = await team()
    const id = await draft(audience({ regionIds: [t.region.id] }))
    await caller(admin).newsletter.schedule({ id, at: null })
    await state.processors.get('newsletter/dispatch')([{ id: randomUUID(), name: 'newsletter/dispatch', data: null }])
    const [job] = state.queued.filter(entry => entry.name === 'newsletterSendQueue')
    const previous = env.newsletterTransporter
    env.newsletterTransporter = () => ({ sendMail: async mail => {
        await new Promise(resolve => setTimeout(resolve, 20))
        state.sentMails.push(mail)
    } })
    try {
        await Promise.all([newsletters.sendNewsletterBatch(job), newsletters.sendNewsletterBatch(job), caller(admin).newsletter.resume(id).then(() => {
            const again = state.queued.filter(entry => entry.name === 'newsletterSendQueue').at(-1)
            return newsletters.sendNewsletterBatch(again)
        })])
    } finally {
        env.newsletterTransporter = previous
    }
    const addresses = state.sentMails.map(mail => mail.to.address).sort()
    assert.deepEqual(addresses, [...new Set(addresses)], 'nobody receives it twice')
    assert.equal(addresses.length, 3)
    assert.equal((await caller(admin).newsletter.get(id)).status, 'sent')
})

test('a draft changed while it is being scheduled is checked as it will be sent', async () => {
    const id = await draft(audience({ everyone: true }))
    const results = await Promise.allSettled([
        caller(admin).newsletter.schedule({ id, at: new Date(Date.now() + 3600_000) }),
        caller(admin).newsletter.update({ id, name: 'Monthly', audienceId: null, filter: NOBODY, ...content({ subject: '' }) }),
    ])
    const newsletter = await caller(admin).newsletter.get(id)
    if (newsletter.status === 'scheduled') {
        assert.equal(newsletter.subject, content().subject, results.map(result => result.reason?.message).join(' / '))
        assert.equal(newsletter.filter.everyone, true)
    } else {
        assert.equal(results[0].status, 'rejected')
    }
})

test('deleting an account removes its name and address from newsletters, and the export lists what it received', async () => {
    const reader = await makeUser('guest', { name: 'Leaving Reader' })
    const id = await draft(audience({ includeUserIds: [reader.id] }))
    await caller(admin).newsletter.schedule({ id, at: null })
    await runSending()
    await caller(reader).newsletter.setMySubscription({ subscribed: false })

    const exported = await require('../dist/services/privacy').exportUserData(reader.id)
    assert.equal(exported.newsletters.subscribed, false)
    assert.deepEqual(exported.newsletters.received.map(row => [row.subject, row.status]), [['News for {{ user.firstName }}', 'sent']])

    await harness.services.users.removeUser(reader)
    const rows = await db.query('SELECT email, name FROM newsletter_recipients WHERE newsletter_id = $1', [id])
    assert.equal(rows.length, 1, 'the count of who it reached stays')
    assert(!rows[0].email.includes('@') && !rows[0].name.includes('Leaving'), JSON.stringify(rows))
})

test('a send whose jobs were lost is queued again after a quarter of an hour without progress', async () => {
    const t = await team()
    const id = await draft(audience({ regionIds: [t.region.id] }))
    await caller(admin).newsletter.schedule({ id, at: null })
    await newsletters.startDueNewsletters()
    assert.deepEqual(await newsletters.startDueNewsletters(), [], 'a send in progress is left alone')
    await db.query(`UPDATE newsletters SET started_at = now() - interval '20 minutes' WHERE id = $1`, [id])
    const [batch] = await newsletters.startDueNewsletters()
    assert.equal(batch.recipientIds.length, 3)
    await newsletters.sendNewsletterBatch(batch)
    assert.equal((await caller(admin).newsletter.get(id)).status, 'sent')
    assert.deepEqual(await newsletters.startDueNewsletters(), [])
})

test('the daily limit holds the rest of a big send for the next day, then it resumes', async () => {
    const t = await team()
    const previous = process.env.NEWSLETTER_DAILY_LIMIT
    process.env.NEWSLETTER_DAILY_LIMIT = '2'
    try {
        const id = await draft(audience({ regionIds: [t.region.id] }))
        await caller(admin).newsletter.schedule({ id, at: null })
        await runSending()
        let newsletter = await caller(admin).newsletter.get(id)
        assert.deepEqual([newsletter.status, newsletter.counts.sent, newsletter.counts.pending], ['sending', 2, 1])
        assert.equal(newsletter.pace.remaining, 0)
        assert(newsletter.pace.nextAt > new Date(), 'says when the next messages may leave')

        await db.query(`UPDATE newsletters SET started_at = now() - interval '2 days' WHERE id = $1`, [id])
        assert.deepEqual(await newsletters.startDueNewsletters(), [], 'nothing is queued while the limit holds')

        await db.query(`UPDATE newsletter_recipients SET sent_at = now() - interval '25 hours' WHERE newsletter_id = $1 AND status = 'sent'`, [id])
        const [batch] = await newsletters.startDueNewsletters()
        await newsletters.sendNewsletterBatch(batch)
        newsletter = await caller(admin).newsletter.get(id)
        assert.deepEqual([newsletter.status, newsletter.counts.sent], ['sent', 3])
        assert.equal(state.sentMails.length, 3)

        process.env.NEWSLETTER_DAILY_LIMIT = '0'
        assert.equal((await caller(admin).newsletter.get(id)).pace.limit, null, '0 turns it off')
    } finally {
        if (previous === undefined) delete process.env.NEWSLETTER_DAILY_LIMIT; else process.env.NEWSLETTER_DAILY_LIMIT = previous
    }
})

test('a limit the host mistyped stops the server at startup instead of breaking the screens later', () => {
    for (const [name, value] of [['NEWSLETTER_DAILY_LIMIT', 'lots'], ['NEWSLETTER_DAILY_LIMIT', '-1'], ['NEWSLETTER_RATE_PER_SECOND', '0']]) {
        const result = require('node:child_process').spawnSync(process.execPath, ['-e', "require('./dist/env')"], {
            cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, [name]: value }, encoding: 'utf8',
        })
        assert.notEqual(result.status, 0, `${name}=${value}`)
        assert.match(result.stderr, new RegExp(name))
    }
})

test('bounces and complaints from each provider stop newsletters to that address, until it changes', async () => {
    const previous = process.env.EMAIL_EVENTS_SECRET
    const secret = 'a'.repeat(40)
    const post = (payload, path = secret, type = 'application/json') => server.inject({ method: 'POST', url: `/v1/email-events/${path}`, headers: { 'content-type': type }, payload: typeof payload === 'string' ? payload : JSON.stringify(payload) })
    try {
        delete process.env.EMAIL_EVENTS_SECRET
        assert.equal((await post({})).statusCode, 404, 'off until the host sets a secret')
        process.env.EMAIL_EVENTS_SECRET = secret
        assert.equal((await post({}, 'b'.repeat(40))).statusCode, 404)
        assert.equal((await post({}, 'short')).statusCode, 404)

        const people = {}
        for (const name of ['postmark', 'sendgrid', 'mailgun', 'resend', 'brevo', 'ses', 'complainer', 'soft']) {
            people[name] = await makeUser('guest', { email: `${name}-${randomUUID()}@example.test`, name })
        }
        const id = await draft(audience({ includeUserIds: Object.values(people).map(user => user.id) }))
        await caller(admin).newsletter.schedule({ id, at: null })
        await runSending()

        const email = name => people[name].email.toUpperCase()
        const replies = await Promise.all([
            post({ RecordType: 'Bounce', Type: 'HardBounce', Inactive: true, Email: email('postmark'), Description: 'Mailbox does not exist' }),
            post([{ event: 'bounce', type: 'bounce', email: email('sendgrid'), reason: '550 5.1.1', sg_event_id: 'x' }, { event: 'bounce', type: 'blocked', email: email('soft'), sg_event_id: 'y' }]),
            post({ signature: {}, 'event-data': { event: 'failed', severity: 'permanent', recipient: email('mailgun'), 'delivery-status': { message: 'No such user' } } }),
            post({ type: 'email.bounced', data: { to: [email('resend')], bounce: { type: 'Permanent', message: 'Gone' } } }),
            post({ event: 'hard_bounce', email: email('brevo'), reason: 'unknown user' }),
            post(JSON.stringify({ Type: 'Notification', Message: JSON.stringify({ notificationType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: email('ses'), diagnosticCode: 'smtp; 550' }] } }) }), secret, 'text/plain'),
            post({ RecordType: 'SpamComplaint', Email: email('complainer') }),
            post({ notificationType: 'Bounce', bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: email('soft') }] } }),
        ])
        assert(replies.every(reply => reply.statusCode === 200))

        const rows = await db.query(`SELECT name, email_bounced_at IS NOT NULL AS bounced, email_bounce_reason AS reason, newsletter_opt_out_at IS NOT NULL AS unsubscribed FROM users WHERE id = ANY($1::uuid[]) ORDER BY name`, [Object.values(people).map(user => user.id)])
        assert.deepEqual(rows.map(row => [row.name, row.bounced, row.unsubscribed]), [
            ['brevo', true, false], ['complainer', false, true], ['mailgun', true, false], ['postmark', true, false],
            ['resend', true, false], ['sendgrid', true, false], ['ses', true, false], ['soft', false, false],
        ])
        assert.equal(rows.find(row => row.name === 'postmark').reason, 'Mailbox does not exist')
        const statuses = await db.query(`SELECT name, status FROM newsletter_recipients WHERE newsletter_id = $1 ORDER BY name`, [id])
        assert.deepEqual(statuses.map(row => row.status), ['bounced', 'complained', 'bounced', 'bounced', 'bounced', 'bounced', 'bounced', 'sent'])
        assert.equal((await caller(admin).newsletter.audienceSize(audience({ includeUserIds: [people.postmark.id, people.soft.id] }))).count, 1)
        assert.equal((await db.query(`SELECT count(*)::int AS count FROM audit_log WHERE action IN ('email.bounced', 'email.complained') AND target_id = ANY($1::text[])`, [Object.values(people).map(user => user.id)]))[0].count, 7)

        // The person sees it and can say the address works; a new address clears it too.
        assert.match((await caller(people.postmark).newsletter.mySubscription()).bounceReason, /does not exist/)
        await caller(people.postmark).newsletter.setMySubscription({ subscribed: true })
        assert.equal((await caller(people.postmark).newsletter.mySubscription()).bouncedAt, null)
        await db.query(`UPDATE users SET email = $2 WHERE id = $1`, [people.sendgrid.id, `new-${randomUUID()}@example.test`])
        assert.equal((await db.query('SELECT email_bounced_at FROM users WHERE id = $1', [people.sendgrid.id]))[0].email_bounced_at, null)

        // A replayed report changes nothing more, not even an older newsletter.
        const older = await draft(audience({ includeUserIds: [people.brevo.id, people.complainer.id] }))
        await db.query(`INSERT INTO newsletter_recipients (newsletter_id, user_id, email, name, status, sent_at) SELECT $1, id, email, name, 'sent', now() - interval '2 days' FROM users WHERE id = ANY($2::uuid[])`, [older, [people.brevo.id, people.complainer.id]])
        await post({ RecordType: 'Bounce', Type: 'HardBounce', Email: email('brevo') })
        await post({ RecordType: 'SpamComplaint', Email: email('complainer') })
        assert.equal((await db.query(`SELECT count(*)::int AS count FROM audit_log WHERE action IN ('email.bounced', 'email.complained') AND target_id = ANY($1::text[])`, [[people.brevo.id, people.complainer.id]]))[0].count, 2)
        assert.deepEqual((await db.query(`SELECT DISTINCT status FROM newsletter_recipients WHERE newsletter_id = $1`, [older])).map(row => row.status), ['sent'])
    } finally {
        if (previous === undefined) delete process.env.EMAIL_EVENTS_SECRET; else process.env.EMAIL_EVENTS_SECRET = previous
    }
})

test('Amazon SNS subscriptions are confirmed only at an Amazon SNS address', async () => {
    const previous = process.env.EMAIL_EVENTS_SECRET
    const previousFetch = globalThis.fetch
    const opened = []
    process.env.EMAIL_EVENTS_SECRET = 'c'.repeat(40)
    globalThis.fetch = async (url) => { opened.push(String(url)); return { ok: true } }
    try {
        const confirm = SubscribeURL => server.inject({ method: 'POST', url: `/v1/email-events/${'c'.repeat(40)}`, headers: { 'content-type': 'text/plain' }, payload: JSON.stringify({ Type: 'SubscriptionConfirmation', SubscribeURL }) })
        for (const url of ['http://sns.eu-west-1.amazonaws.com/?Action=Confirm', 'https://169.254.169.254/latest/meta-data', 'https://sns.eu-west-1.amazonaws.com.evil.test/', 'https://sns.eu-west-1.amazonaws.com:8443/', 'https://evil.test/sns.eu-west-1.amazonaws.com']) {
            assert.equal((await confirm(url)).statusCode, 200, url)
        }
        assert.deepEqual(opened, [])
        assert.equal((await confirm('https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=t')).statusCode, 200)
        assert.deepEqual(opened, ['https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=t'])
    } finally {
        globalThis.fetch = previousFetch
        if (previous === undefined) delete process.env.EMAIL_EVENTS_SECRET; else process.env.EMAIL_EVENTS_SECRET = previous
    }
})

test('the daily limit and the pace hold across several workers sending at once', async () => {
    const t = await team()
    const extra = [await makeUser('guest', { regionId: t.region.id }), await makeUser('guest', { regionId: t.region.id })]
    const previous = { limit: process.env.NEWSLETTER_DAILY_LIMIT, rate: process.env.NEWSLETTER_RATE_PER_SECOND }
    process.env.NEWSLETTER_DAILY_LIMIT = '4'
    process.env.NEWSLETTER_RATE_PER_SECOND = '10'
    try {
        const id = await draft(audience({ regionIds: [t.region.id] }))
        await caller(admin).newsletter.schedule({ id, at: null })
        await newsletters.startDueNewsletters()
        const ids = (await db.query(`SELECT id FROM newsletter_recipients WHERE newsletter_id = $1 ORDER BY id`, [id])).map(row => row.id)
        assert.equal(ids.length, 3 + extra.length)
        const started = Date.now()
        await Promise.all([
            newsletters.sendNewsletterBatch({ newsletterId: id, recipientIds: ids.slice(0, 3) }),
            newsletters.sendNewsletterBatch({ newsletterId: id, recipientIds: ids.slice(3) }),
        ])
        assert.equal(state.sentMails.length, 4, 'two workers together stop at the limit')
        assert(Date.now() - started >= 280, 'four messages at ten a second take at least 0.3 s')
        const times = (await db.query(`SELECT sent_at FROM newsletter_recipients WHERE newsletter_id = $1 AND status = 'sent' ORDER BY sent_at`, [id])).map(row => row.sent_at.getTime())
        for (let index = 1; index < times.length; index++) assert(times[index] - times[index - 1] >= 90, `messages ${index} and ${index + 1} are ${times[index] - times[index - 1]} ms apart`)
    } finally {
        for (const [name, value] of [['NEWSLETTER_DAILY_LIMIT', previous.limit], ['NEWSLETTER_RATE_PER_SECOND', previous.rate]]) {
            if (value === undefined) delete process.env[name]; else process.env[name] = value
        }
    }
})

test('images saved under an earlier API address are served from the current one', async () => {
    const id = randomUUID()
    const body = `<p>Hi</p><img src="https://old-api.example.test/v1/newsletter-images/${id}.png" alt="Team">`
    const clean = sanitizeNewsletterHtml(body)
    assert(clean.includes(`src="${newsletterImageUrl(id, 'png')}"`), clean)
    const draftId = await draft(audience({ everyone: true }))
    await db.query('UPDATE newsletters SET body_html = $2 WHERE id = $1', [draftId, body])
    assert((await caller(admin).newsletter.get(draftId)).bodyHtml.includes(newsletterImageUrl(id, 'png')), 'the editor shows it from here')
    const preview = await caller(admin).newsletter.preview(content({ bodyHtml: body }))
    assert(preview.html.includes(newsletterImageUrl(id, 'png')) && !preview.html.includes('old-api'))
    assert(!sanitizeNewsletterHtml('<img src="https://tracker.example/pixel.gif">').includes('<img'))
})
