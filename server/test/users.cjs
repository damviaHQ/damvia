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
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, env, state, save, caller, makeUser, forbidden } = harness
const { User, Region, AuthorizedDomain } = harness.entities
const { createUser, createGuestUser } = harness.services.users
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

test('signup joins the region default group, stays unapproved unless the domain is authorised and queues one verification mail', async () => {
    state.queued.length = 0
    const user = await createUser({ name: 'New', company: 'Co', regionId: fixtures.region.id, email: `${randomUUID()}@pending.test`, password: 'fixture-password' })
    const stored = await db.getRepository(User).findOneOrFail({ where: { id: user.id }, relations: { userGroups: true } })
    assert.equal(stored.role, 'member')
    assert.equal(stored.approved, false)
    assert.equal(stored.emailVerified, false)
    assert.match(stored.emailVerificationCode, /^[a-f0-9]{24}$/)
    assert.match(stored.password, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
    assert.deepEqual(stored.userGroups.map(g => g.groupId), [fixtures.group.id])
    assert.deepEqual(state.queued, [{ name: 'mailerEmailVerificationQueue', userId: user.id }])
    await save(AuthorizedDomain, { domain: 'approved.test' })
    const approved = await createUser({ name: 'Auto', company: 'Co', regionId: fixtures.region.id, email: `${randomUUID()}@approved.test`, password: 'fixture-password' })
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: approved.id })).approved, true)
})

test('password-less installations store no password hash', async () => {
    env.passwordLessAuth = () => true
    try {
        const user = await createUser({ name: 'NoPass', company: 'Co', regionId: fixtures.region.id, email: `${randomUUID()}@pending.test`, password: null })
        assert.equal((await db.getRepository(User).findOneByOrFail({ id: user.id })).password, null)
    } finally { env.passwordLessAuth = () => false }
})

test('invited guests are created approved and verified without any group', async () => {
    const guest = await createGuestUser({ em: db.manager, email: `${randomUUID()}@guest.test`, regionId: fixtures.region.id })
    const stored = await db.getRepository(User).findOneOrFail({ where: { id: guest.id }, relations: { userGroups: true } })
    assert.equal(stored.role, 'guest')
    assert.equal(stored.approved, true)
    assert.equal(stored.emailVerified, true)
    assert.equal(stored.regionId, fixtures.region.id)
    assert.deepEqual(stored.userGroups, [])
})

const PUBLIC_FIELDS = ['approved', 'company', 'email', 'emailVerified', 'id', 'name', 'region', 'regionId', 'role']
const auditRows = (action, targetId) => db.query('SELECT actor_id, before, after FROM audit_log WHERE action = $1 AND target_id = $2 ORDER BY created_at', [action, targetId])

test('a manager reads accounts of their own region, an admin reads any, and only public fields come back', async () => {
    const otherRegion = await save(Region, { name: randomUUID(), defaultGroupId: fixtures.group.id })
    const near = await makeUser('member', { password: 'scrypt$not-for-readers', emailVerificationCode: 'secret-code' })
    const far = await makeUser('member', { regionId: otherRegion.id })
    const found = await caller(fixtures.manager).user.findById(near.id)
    assert.deepEqual(Object.keys(found).sort(), PUBLIC_FIELDS)
    assert.deepEqual([found.id, found.email, found.regionId, found.region], [near.id, near.email, fixtures.region.id, null])
    await assert.rejects(caller(fixtures.manager).user.findById(far.id), error => error.code === 'NOT_FOUND')
    assert.equal((await caller(fixtures.admin).user.findById(far.id)).id, far.id)
    await assert.rejects(caller(fixtures.admin).user.findById(randomUUID()), error => error.code === 'NOT_FOUND')
    for (const user of [null, fixtures.guest, fixtures.member, { ...fixtures.manager, approved: false }]) {
        await forbidden(caller(user).user.findById(near.id))
    }
})

test('a person edits their name and company; only an admin changes their own email, which then needs verifying again', async () => {
    const member = await makeUser()
    state.queued.length = 0
    const updated = await caller(member).user.updateProfile({ name: 'Renamed', company: 'New Co', email: `${randomUUID()}@example.test` })
    assert.deepEqual(Object.keys(updated).sort(), PUBLIC_FIELDS)
    let stored = await db.getRepository(User).findOneByOrFail({ id: member.id })
    assert.deepEqual([stored.name, stored.company, stored.email, stored.emailVerified], ['Renamed', 'New Co', member.email, true])
    assert.deepEqual(state.queued, [])
    const [change] = await auditRows('user.updated', member.id)
    assert.deepEqual([change.actor_id, change.before.company, change.after.company, change.after.email], [member.id, 'Test', 'New Co', member.email])
    const admin = await makeUser('admin')
    const email = `${randomUUID()}@example.test`
    await caller(admin).user.updateProfile({ name: admin.name, company: admin.company, email })
    stored = await db.getRepository(User).findOneByOrFail({ id: admin.id })
    assert.deepEqual([stored.email, stored.emailVerified], [email, false])
    assert.match(stored.emailVerificationCode, /^[a-f0-9]{16}$/)
    assert.deepEqual(state.queued, [{ name: 'mailerEmailVerificationQueue', userId: admin.id }])
    await assert.rejects(caller(null).user.updateProfile({ name: 'x', company: 'y', email }), error => error.code === 'UNAUTHORIZED')
    await assert.rejects(caller(member).user.updateProfile({ name: '', company: 'y', email: member.email }), error => error.code === 'BAD_REQUEST')
})

test('managers and admins resend a verification mail for an unverified account they manage, and it is recorded', async () => {
    const otherRegion = await save(Region, { name: randomUUID(), defaultGroupId: fixtures.group.id })
    const pending = await makeUser('member', { emailVerified: false })
    state.queued.length = 0
    assert.equal(await caller(fixtures.manager).user.resendVerificationEmailFor(pending.id), undefined)
    assert.deepEqual(state.queued, [{ name: 'mailerEmailVerificationQueue', userId: pending.id }])
    assert.equal((await auditRows('user.verification_resent', pending.id))[0].actor_id, fixtures.manager.id)
    await assert.rejects(caller(fixtures.manager).user.resendVerificationEmailFor(fixtures.member.id), error => error.code === 'BAD_REQUEST')
    const pendingAdmin = await makeUser('admin', { emailVerified: false })
    await assert.rejects(caller(fixtures.manager).user.resendVerificationEmailFor(pendingAdmin.id), error => error.code === 'FORBIDDEN')
    const far = await makeUser('member', { emailVerified: false, regionId: otherRegion.id })
    await assert.rejects(caller(fixtures.manager).user.resendVerificationEmailFor(far.id), error => error.code === 'NOT_FOUND')
    await caller(fixtures.admin).user.resendVerificationEmailFor(far.id)
    for (const user of [null, fixtures.guest, fixtures.member, { ...fixtures.manager, emailVerified: false }]) {
        await forbidden(caller(user).user.resendVerificationEmailFor(pending.id))
    }
    assert.deepEqual(state.queued.map(job => job.userId), [pending.id, far.id])
})

test('the verification job mails the account its own link to the client', async () => {
    const user = await makeUser('member', { emailVerified: false, emailVerificationCode: 'abc123def456' })
    state.sentMails.length = 0
    await state.processors.get('mailer/email-verification')([{ id: randomUUID(), name: 'mailer/email-verification', data: { userId: user.id } }])
    assert.equal(state.sentMails.length, 1)
    const [mail] = state.sentMails
    const template = env.mailConfig()['email-verification']
    assert.deepEqual([mail.to, mail.from, mail.subject], [user.email, template.from, template.subject])
    const link = new URL(mail.text.match(/https?:\/\/\S+/)[0])
    assert.equal(link.origin, new URL(env.appURL()).origin)
    assert.equal(link.searchParams.get('verificationCode'), 'abc123def456')
})

test('a mail job whose user, download or invitation was deleted sends nothing and does not fail', async () => {
    state.sentMails.length = 0
    const jobs = [
        ['mailer/email-verification', { userId: randomUUID() }],
        ['mailer/log-in', { userId: randomUUID() }],
        ['mailer/password-reset', { userId: randomUUID() }],
        ['email/request-approval', { requesterId: randomUUID() }],
        ['email/user-approved', { userId: randomUUID() }],
        ['mailer/download-ready', { downloadId: randomUUID() }],
        ['mailer/invitation', { invitationId: randomUUID() }],
    ]
    for (const [name, data] of jobs) {
        await state.processors.get(name)([{ id: randomUUID(), name, data }])
    }
    assert.equal(state.sentMails.length, 0)
})
