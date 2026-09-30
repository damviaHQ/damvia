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
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID, createHash, generateKeyPairSync } = require('node:crypto')
const { sign } = require('jsonwebtoken')
const { Secret, TOTP } = require('otpauth')
const harness = require('./lib/helpers.cjs')
const { db, env, state, save, caller, fakeReply, fakeRequest, makeUser, makeCollection, server, forbidden } = harness
const { User, UserSession, LoginToken, CollectionInvitation, Collection, Group, UserGroup, Region } = harness.entities
const { credentials, session: sessions, loginToken, rateLimit, mfa, passwordPolicy } = harness.services
const mailer = require('../dist/services/mailer')
const oidc = require('../dist/services/oidc')
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())
beforeEach(() => { rateLimit.resetRateLimits(); state.queued.length = 0; state.sentMails.length = 0 })

const PASSWORD = 'correct horse battery staple'
const withPassword = async (role = 'member', extra = {}) => makeUser(role, { password: await credentials.hashPassword(PASSWORD), ...extra })
const cookieOf = res => res.cookies.damvia_session?.value
const resolve = token => sessions.sessionFromRequest({ cookies: token ? { damvia_session: token } : {}, headers: {} })
async function signIn(user, password = PASSWORD, req = fakeRequest()) {
    const res = fakeReply()
    const result = await caller(null, { req, res }).auth.login({ email: user.email, password })
    return { result, res, token: cookieOf(res) }
}
const codeAt = (base32, offsetSeconds = 0) =>
    new TOTP({ secret: Secret.fromBase32(base32) }).generate({ timestamp: Date.now() + offsetSeconds * 1000 })

test('a password sign-in sets an HttpOnly Lax cookie holding an opaque token stored only as a hash', async () => {
    const user = await withPassword()
    const { result, res, token } = await signIn(user)
    assert.deepEqual(result, { status: 'signed_in' })
    const { options } = res.cookies.damvia_session
    assert.equal(options.httpOnly, true)
    assert.equal(options.sameSite, 'lax')
    assert.equal(options.path, '/')
    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    const stored = await db.getRepository(UserSession).findOneByOrFail({ userId: user.id })
    assert.equal(stored.tokenHash, credentials.hashToken(token))
    assert.equal(stored.method, 'password')
    assert.equal(stored.userAgent, 'node-test')
    assert.equal((await resolve(token)).user.id, user.id)
    for (const other of [undefined, '', 'garbage', token.slice(1)]) assert.equal(await resolve(other), null)
})

test('sessions end after the idle timeout, at their absolute expiry, on suspension and on logout', async () => {
    const user = await withPassword()
    const idle = (await signIn(user)).token
    await db.query(`UPDATE user_sessions SET last_seen_at = now() - interval '13 hours' WHERE token_hash = $1`, [credentials.hashToken(idle)])
    assert.equal(await resolve(idle), null)
    const expired = (await signIn(user)).token
    await db.query(`UPDATE user_sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, [credentials.hashToken(expired)])
    assert.equal(await resolve(expired), null)
    const suspended = (await signIn(user)).token
    await db.getRepository(User).update(user.id, { suspendedAt: new Date() })
    assert.equal(await resolve(suspended), null)
    await db.getRepository(User).update(user.id, { suspendedAt: null })
    assert((await resolve(suspended)).user)
    const found = await resolve(suspended)
    const res = fakeReply()
    await caller(found.user, { session: found.session, res }).auth.logout()
    assert.equal(res.cookies.damvia_session.cleared, true)
    assert.equal(await resolve(suspended), null)
})

test('an active session slides its idle timeout forward', async () => {
    const user = await withPassword()
    const { token } = await signIn(user)
    await db.query(`UPDATE user_sessions SET last_seen_at = now() - interval '11 hours' WHERE token_hash = $1`, [credentials.hashToken(token)])
    assert((await resolve(token)).user)
    const touched = await db.getRepository(UserSession).findOneByOrFail({ tokenHash: credentials.hashToken(token) })
    assert(Date.now() - touched.lastSeenAt.getTime() < 60 * 1000)
})

test('wrong passwords and unknown emails get the same answer, and five failures lock the account', async () => {
    const user = await withPassword()
    await assert.rejects(caller(null).auth.login({ email: `${randomUUID()}@example.test`, password: PASSWORD }),
        error => error.code === 'NOT_FOUND' && error.message === 'Invalid email or password.')
    for (let attempt = 1; attempt <= 5; attempt++) {
        await assert.rejects(signIn(user, 'wrong password'), error => error.code === 'NOT_FOUND' && error.message === 'Invalid email or password.')
    }
    const locked = await db.getRepository(User).findOneByOrFail({ id: user.id })
    assert.equal(locked.failedLoginCount, 5)
    assert(locked.lockedUntil > new Date())
    await assert.rejects(signIn(user), error => error.code === 'TOO_MANY_REQUESTS')
    await db.getRepository(User).update(user.id, { lockedUntil: new Date(Date.now() - 1000) })
    assert.equal((await signIn(user)).result.status, 'signed_in')
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: user.id })).failedLoginCount, 0)
})

test('an unknown address locks after the same number of failures as a real account', async () => {
    const user = await withPassword()
    const unknown = `${randomUUID()}@example.test`
    const answers = async email => {
        const codes = []
        for (let attempt = 0; attempt < 6; attempt++) {
            codes.push(await caller(null).auth.login({ email, password: 'wrong password' }).then(() => 'ok', error => error.code))
        }
        return codes
    }
    assert.deepEqual(await answers(unknown), await answers(user.email))
})

test('lockout grows from one minute to a one-hour cap', () => {
    assert.deepEqual([4, 5, 6, 7, 10, 11, 30].map(rateLimit.lockoutMinutes), [0, 1, 2, 4, 32, 60, 60])
})

test('one address cannot try more than 20 sign-ins a minute', async () => {
    const user = await withPassword()
    const req = fakeRequest()
    for (let attempt = 0; attempt < 20; attempt++) {
        await assert.rejects(caller(null, { req }).auth.login({ email: `${randomUUID()}@example.test`, password: 'x' }), error => error.code === 'NOT_FOUND')
    }
    await assert.rejects(signIn(user, PASSWORD, req), error => error.code === 'TOO_MANY_REQUESTS')
    assert.equal((await signIn(user)).result.status, 'signed_in')
})

test('email sign-in answers the same for every address and only mails known, active accounts', async () => {
    const user = await withPassword()
    const suspended = await withPassword('member', { suspendedAt: new Date() })
    for (const email of [user.email, suspended.email, `${randomUUID()}@example.test`]) {
        assert.deepEqual(await caller(null).auth.login({ email, password: '', magicLink: true }), { status: 'email_sent' })
    }
    assert.deepEqual(state.queued, [{ name: 'mailerLogInQueue', userId: user.id }])
    const req = fakeRequest()
    for (let i = 0; i < 3; i++) await caller(null, { req: fakeRequest() }).auth.login({ email: 'same@example.test', password: '', magicLink: true })
    await assert.rejects(caller(null, { req }).auth.login({ email: 'same@example.test', password: '', magicLink: true }), error => error.code === 'TOO_MANY_REQUESTS')
})

test('email links are single use, expire, and never contain a session', async () => {
    const user = await withPassword()
    await mailer.sendLogInEmail(user)
    const url = new URL(state.sentMails.at(-1).text.match(/https?:\/\/\S+/)[0])
    assert.equal(url.pathname, '/login')
    assert.equal(url.searchParams.get('token'), null)
    const link = url.searchParams.get('link')
    const stored = await db.getRepository(LoginToken).findOneByOrFail({ userId: user.id })
    assert.equal(stored.tokenHash, credentials.hashToken(link))
    assert(stored.expiresAt.getTime() - Date.now() <= 15 * 60 * 1000)
    const res = fakeReply()
    const attempts = await Promise.allSettled([1, 2].map(() => caller(null, { res }).auth.exchangeLink({ token: link })))
    assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1)
    assert.equal((await resolve(cookieOf(res))).session.method, 'email_link')
    const expired = await loginToken.createLoginToken(user.id, 'login')
    await db.query(`UPDATE login_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, [credentials.hashToken(expired)])
    await assert.rejects(caller(null).auth.exchangeLink({ token: expired }), error => error.code === 'BAD_REQUEST')
    await mailer.sendUserApprovedEmail(user)
    const approved = new URL(state.sentMails.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('link')
    assert.equal((await caller(null).auth.exchangeLink({ token: approved })).status, 'signed_in')
})

test('invitation links open sessions that end with the invitation', async () => {
    const guest = await makeUser('guest')
    const collection = await makeCollection()
    const invitation = await save(CollectionInvitation, { collectionId: collection.id, email: guest.email, userId: guest.id, expiresAt: new Date(Date.now() + 86400000) })
    await mailer.sendInvitation(await db.getRepository(CollectionInvitation).findOneOrFail({ where: { id: invitation.id }, relations: { user: true } }))
    const url = new URL(state.sentMails.at(-1).text.match(/https?:\/\/\S+/)[0])
    assert.equal(url.searchParams.get('dam_token'), null)
    const token = url.searchParams.get('invite')
    assert(token.startsWith(`${invitation.id}.`))
    const res = fakeReply()
    const result = await caller(null, { res }).auth.exchangeInvitation({ token })
    assert.deepEqual(result, { status: 'signed_in', collectionId: collection.id })
    const opened = cookieOf(res)
    assert.equal((await resolve(opened)).session.invitationId, invitation.id)
    // The same link works again while the invitation lasts.
    assert.equal((await caller(null).auth.exchangeInvitation({ token })).status, 'signed_in')
    await assert.rejects(caller(null).auth.exchangeInvitation({ token: `${invitation.id}.${'x'.repeat(43)}` }), error => error.code === 'BAD_REQUEST')
    await db.getRepository(CollectionInvitation).update(invitation.id, { expiresAt: new Date(Date.now() - 86400000) })
    assert.equal(await resolve(opened), null)
    await assert.rejects(caller(null).auth.exchangeInvitation({ token }), error => error.code === 'BAD_REQUEST')
    await db.getRepository(CollectionInvitation).update(invitation.id, { expiresAt: new Date(Date.now() + 86400000) })
    assert((await resolve(opened)).user)
    await db.getRepository(CollectionInvitation).delete(invitation.id)
    assert.equal(await resolve(opened), null)
    assert.equal(await db.getRepository(UserSession).countBy({ userId: guest.id }), 0)
})

test('a JWT from before server-side sessions is traded once for a session and is accepted nowhere else', async () => {
    const user = await withPassword()
    const legacy = sign({ userId: user.id, authVersion: user.authVersion }, process.env.APP_SECRET, { expiresIn: '180d' })
    assert.equal(await sessions.sessionFromRequest({ cookies: {}, headers: { authorization: legacy } }), null)
    const res = fakeReply()
    await caller(null, { req: fakeRequest({ headers: { authorization: legacy } }), res }).auth.upgradeLegacyToken()
    assert.equal((await resolve(cookieOf(res))).session.method, 'legacy')
    for (const token of [
        sign({ userId: user.id, authVersion: user.authVersion + 1 }, process.env.APP_SECRET),
        sign({ userId: user.id, authVersion: user.authVersion }, 'another-secret-that-is-long-enough-for-tests'),
        sign({ userId: user.id }, process.env.APP_SECRET),
        undefined,
    ]) {
        await assert.rejects(caller(null, { req: fakeRequest({ headers: token ? { authorization: token } : {} }) }).auth.upgradeLegacyToken(), error => error.code === 'BAD_REQUEST')
    }
})

test('a JWT from before server-side sessions still asks for the second factor', async () => {
    const user = await withPassword()
    const found = await resolve((await signIn(user)).token)
    const own = caller(found.user, { session: found.session })
    const { secret } = await own.auth.mfaSetup()
    await own.auth.mfaEnable({ code: codeAt(secret) })
    const legacy = sign({ userId: user.id, authVersion: user.authVersion }, process.env.APP_SECRET, { expiresIn: '180d' })
    const res = fakeReply()
    const result = await caller(null, { req: fakeRequest({ headers: { authorization: legacy } }), res }).auth.upgradeLegacyToken()
    assert.equal(result.status, 'mfa_required')
    assert.equal(cookieOf(res), undefined)
})

test('wrong codes lock the account, and the right password alone does not clear the count', async () => {
    const user = await withPassword()
    const found = await resolve((await signIn(user)).token)
    const own = caller(found.user, { session: found.session })
    const { secret } = await own.auth.mfaSetup()
    await own.auth.mfaEnable({ code: codeAt(secret) })
    for (let i = 0; i < 4; i++) {
        rateLimit.resetRateLimits()
        const { result } = await signIn(user)
        await assert.rejects(caller(null).auth.verifyMfa({ challenge: result.challenge, code: '123456' }), error => error.code === 'BAD_REQUEST')
    }
    rateLimit.resetRateLimits()
    const { result } = await signIn(user)
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: user.id })).failedLoginCount, 4)
    await assert.rejects(caller(null).auth.verifyMfa({ challenge: result.challenge, code: '123456' }), error => error.code === 'BAD_REQUEST')
    await assert.rejects(caller(null).auth.verifyMfa({ challenge: result.challenge, code: codeAt(secret, 30) }), error => error.code === 'TOO_MANY_REQUESTS')
    await assert.rejects(signIn(user), error => error.code === 'TOO_MANY_REQUESTS')
    await db.getRepository(User).update(user.id, { lockedUntil: null })
    const next = await signIn(user)
    assert.equal((await caller(null).auth.verifyMfa({ challenge: next.result.challenge, code: codeAt(secret, 30) })).status, 'signed_in')
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: user.id })).failedLoginCount, 0)
})

test('turning MFA on twice at once keeps the first answer\'s recovery codes valid', async () => {
    const user = await withPassword()
    const found = await resolve((await signIn(user)).token)
    const own = caller(found.user, { session: found.session })
    const { secret } = await own.auth.mfaSetup()
    const results = await Promise.allSettled([own.auth.mfaEnable({ code: codeAt(secret) }), own.auth.mfaEnable({ code: codeAt(secret) })])
    assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected'])
    const { recoveryCodes } = results.find(result => result.status === 'fulfilled').value
    rateLimit.resetRateLimits()
    const { result } = await signIn(user)
    assert.equal((await caller(null).auth.verifyMfa({ challenge: result.challenge, code: recoveryCodes[0] })).status, 'signed_in')
    await assert.rejects(own.auth.mfaSetup(), error => error.code === 'BAD_REQUEST')
})

test('two-step verification: setup, sign-in challenge, no code replay, single-use recovery codes', async () => {
    const user = await withPassword()
    const found = await resolve((await signIn(user)).token)
    const own = caller(found.user, { session: found.session })
    const { secret, uri, qrSvg } = await own.auth.mfaSetup()
    assert.match(uri, /^otpauth:\/\/totp\//)
    assert.match(qrSvg, /^<svg/)
    const stored = await db.getRepository(User).createQueryBuilder('user').addSelect('user.mfaSecret').where('user.id = :id', { id: user.id }).getOneOrFail()
    assert(!stored.mfaSecret.includes(secret))
    assert.equal(mfa.decryptMfaSecret(stored.mfaSecret), secret)
    await assert.rejects(own.auth.mfaEnable({ code: '000000' }), error => error.code === 'BAD_REQUEST')
    const other = (await signIn(user)).token
    const { recoveryCodes } = await own.auth.mfaEnable({ code: codeAt(secret) })
    assert.equal(recoveryCodes.length, 10)
    assert.equal(await resolve(other), null, 'turning MFA on ends the other sessions')
    rateLimit.resetRateLimits()

    const first = await signIn(user)
    assert.equal(first.result.status, 'mfa_required')
    assert.equal(first.token, undefined)
    const next = codeAt(secret, 30)
    const res = fakeReply()
    assert.deepEqual(await caller(null, { res }).auth.verifyMfa({ challenge: first.result.challenge, code: next }), { status: 'signed_in' })
    assert.equal((await resolve(cookieOf(res))).session.method, 'password')
    const second = await signIn(user)
    await assert.rejects(caller(null).auth.verifyMfa({ challenge: second.result.challenge, code: next }), error => error.code === 'BAD_REQUEST')
    assert.equal((await caller(null).auth.verifyMfa({ challenge: second.result.challenge, code: recoveryCodes[0] })).status, 'signed_in')
    await assert.rejects(caller(null).auth.verifyMfa({ challenge: second.result.challenge, code: recoveryCodes[0] }), error => error.code === 'BAD_REQUEST')
    await assert.rejects(caller(null).auth.verifyMfa({ challenge: 'forged', code: next }), error => error.code === 'UNAUTHORIZED')
    const expiredChallenge = sign({ purpose: 'mfa', userId: user.id, method: 'password' }, process.env.APP_SECRET, { expiresIn: -1 })
    await assert.rejects(caller(null).auth.verifyMfa({ challenge: expiredChallenge, code: recoveryCodes[1] }), error => error.code === 'UNAUTHORIZED')
    // Five attempts in five minutes, then the account's challenges are rate limited.
    rateLimit.resetRateLimits()
    await db.getRepository(User).update(user.id, { failedLoginCount: 0 })
    const third = await signIn(user)
    for (let i = 0; i < 5; i++) await assert.rejects(caller(null).auth.verifyMfa({ challenge: third.result.challenge, code: '123456' }), error => error.code === 'BAD_REQUEST')
    await assert.rejects(caller(null).auth.verifyMfa({ challenge: third.result.challenge, code: recoveryCodes[1] }), error => error.code === 'TOO_MANY_REQUESTS')
})

test('a role that requires MFA can only enrol, and cannot turn it off', async () => {
    const required = env.mfaRequiredRoles
    env.mfaRequiredRoles = () => ['admin']
    try {
        const admin = await withPassword('admin')
        const found = await resolve((await signIn(admin)).token)
        const own = caller(found.user, { session: found.session })
        assert.equal((await own.user.me()).mfaSetupRequired, true)
        await assert.rejects(own.user.list(), error => error.code === 'FORBIDDEN' && /two-step/.test(error.message))
        const { secret } = await own.auth.mfaSetup()
        await own.auth.mfaEnable({ code: codeAt(secret) })
        const refreshed = await db.getRepository(User).findOneByOrFail({ id: admin.id })
        const after = caller(refreshed, { session: found.session })
        assert.equal((await after.user.me()).mfaSetupRequired, false)
        assert(Array.isArray(await after.user.list()))
        await assert.rejects(after.auth.mfaDisable({ code: codeAt(secret, 60) }), error => error.code === 'FORBIDDEN')
        const sso = caller(await makeUser('admin'), { session: { id: randomUUID(), method: 'sso' } })
        assert(Array.isArray(await sso.user.list()), 'single sign-on leaves MFA to the identity provider')
    } finally {
        env.mfaRequiredRoles = required
    }
})

test('TOTP secrets are encrypted with authentication and codes outside one step are refused', () => {
    const secret = mfa.generateMfaSecret()
    const encrypted = mfa.encryptMfaSecret(secret)
    assert.notEqual(mfa.encryptMfaSecret(secret), encrypted)
    const tampered = encrypted.slice(0, -2) + (encrypted.endsWith('A') ? 'BB' : 'AA')
    assert.throws(() => mfa.decryptMfaSecret(tampered))
    const now = Date.now()
    const step = Math.floor(now / 30000)
    assert.equal(mfa.verifyTotp(secret, codeAt(secret), null, now) !== null, true)
    assert.equal(mfa.verifyTotp(secret, codeAt(secret, 120), null, now), null)
    assert.equal(mfa.verifyTotp(secret, codeAt(secret), step, now), null)
    assert.equal(mfa.verifyTotp(secret, 'abcdef', null, now), null)
})

test('new passwords need 12 characters, cannot be the email, and are checked against breaches', async () => {
    const email = `${randomUUID()}@example.test`
    await assert.rejects(caller(null).user.create({ name: 'N', company: 'C', regionId: fixtures.region.id, email, password: 'short-pass1' }), error => error.code === 'BAD_REQUEST')
    await assert.rejects(caller(null).user.create({ name: 'N', company: 'C', regionId: fixtures.region.id, email, password: email }), error => /email address/.test(error.message))
    const res = fakeReply()
    assert.deepEqual(await caller(null, { res }).user.create({ name: 'N', company: 'C', regionId: fixtures.region.id, email, password: PASSWORD }), { status: 'signed_in' })
    assert.equal((await resolve(cookieOf(res))).session.method, 'sign_up')
    const suffix = createHash('sha1').update('password123456').digest('hex').toUpperCase().slice(5)
    const breached = async () => new Response(`0000000000000000000000000000000000A:2\r\n${suffix}:3861493\r\n`)
    assert.equal(await passwordPolicy.passwordIsBreached('password123456', breached), true)
    assert.equal(await passwordPolicy.passwordIsBreached('a much rarer passphrase', breached), false)
    assert.equal(await passwordPolicy.passwordIsBreached('anything', async () => { throw new Error('offline') }), false)
    let requested
    await passwordPolicy.passwordIsBreached('password123456', async (url, init) => { requested = { url, init }; return new Response('') })
    assert.equal(requested.url, 'https://api.pwnedpasswords.com/range/' + createHash('sha1').update('password123456').digest('hex').toUpperCase().slice(0, 5))
    assert.equal(requested.init.headers['Add-Padding'], 'true')
})

test('password resets create their token in the mail job and end every session', async () => {
    const user = await withPassword()
    const before = (await signIn(user)).token
    await caller(null).user.sendResetPasswordEmail(user.email)
    assert.deepEqual(state.queued.at(-1), { name: 'mailerResetPasswordQueue', userId: user.id })
    await mailer.sendResetPasswordEmail(await db.getRepository(User).findOneByOrFail({ id: user.id }))
    const token = new URL(state.sentMails.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('token')
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: user.id })).resetPasswordToken, credentials.hashToken(token))
    await assert.rejects(caller(null).user.resetPassword({ email: user.email, token, newPassword: 'too-short' }))
    const res = fakeReply()
    assert.deepEqual(await caller(null, { res }).user.resetPassword({ email: user.email, token, newPassword: 'another long passphrase' }), { status: 'signed_in' })
    assert.equal(await resolve(before), null)
    assert.equal((await resolve(cookieOf(res))).session.method, 'password_reset')
    await assert.rejects(caller(null).user.resetPassword({ email: user.email, token, newPassword: 'yet another passphrase' }))
    assert.equal(await caller(null).user.sendResetPasswordEmail('absent@example.test'), undefined)
    const suspended = await withPassword('member', { suspendedAt: new Date() })
    state.queued.length = 0
    await caller(null).user.sendResetPasswordEmail(suspended.email)
    assert.deepEqual(state.queued, [])
})

test('managers keep accounts in their region and only admins change another user\'s email', async () => {
    const manager = await makeUser('manager')
    const member = await withPassword()
    const otherRegion = await save(Region, { name: randomUUID(), defaultGroupId: fixtures.group.id })
    const base = { id: member.id, name: member.name, company: member.company, regionId: member.regionId, email: member.email, role: 'member', groupIds: [] }
    await assert.rejects(caller(manager).user.update({ ...base, regionId: otherRegion.id }), error => error.code === 'FORBIDDEN')
    await assert.rejects(caller(manager).user.update({ ...base, email: `${randomUUID()}@attacker.test` }), error => error.code === 'FORBIDDEN')
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: member.id })).email, member.email)
    const session = (await signIn(member)).token
    await caller(null).user.sendResetPasswordEmail(member.email)
    await mailer.sendResetPasswordEmail(await db.getRepository(User).findOneByOrFail({ id: member.id }))
    await caller(fixtures.admin).user.update({ ...base, email: `${randomUUID()}@example.test` })
    const changed = await db.getRepository(User).findOneByOrFail({ id: member.id })
    assert.equal(changed.emailVerified, false)
    assert.equal(changed.resetPasswordToken, null)
    assert.equal(await resolve(session), null)
})

test('approval waits for a verified email', async () => {
    const pending = await makeUser('member', { approved: false, emailVerified: false })
    await assert.rejects(caller(fixtures.admin).user.approve(pending.id), error => /confirmed their email/.test(error.message))
    await db.getRepository(User).update(pending.id, { emailVerified: true })
    await caller(fixtures.admin).user.approve(pending.id)
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: pending.id })).approved, true)
})

test('deleting a user removes their personal collections and keeps their common ones', async () => {
    const user = await makeUser()
    const personal = await makeCollection({ public: false, ownerId: user.id })
    const common = await makeCollection({ public: true, ownerId: user.id })
    await caller(fixtures.admin).user.remove(user.id)
    assert.equal(await db.getRepository(Collection).existsBy({ id: personal.id }), false)
    assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: common.id })).ownerId, null)
    assert.equal(await db.getRepository(User).existsBy({ id: user.id }), false)
})

test('the approval request reaches every admin and the region managers, and links to the user', async () => {
    const otherRegion = await save(Region, { name: randomUUID(), defaultGroupId: fixtures.group.id })
    const farAdmin = await makeUser('admin', { regionId: otherRegion.id })
    const farManager = await makeUser('manager', { regionId: otherRegion.id })
    const requester = await makeUser('member', { approved: false })
    await mailer.sendRequestApprovalEmail(requester)
    const mail = state.sentMails.at(-1)
    assert(mail.to.includes(farAdmin.email))
    assert(mail.to.includes(fixtures.manager.email))
    assert(!mail.to.includes(farManager.email))
    assert(mail.text.includes(`/admin/users/${requester.id}`))
    assert(!mail.text.includes('/edit'))
})

test('suspension, session revocation, MFA reset and the access review', async () => {
    const manager = await makeUser('manager')
    const member = await withPassword('member', { name: '=HYPERLINK("http://evil")' })
    const session = (await signIn(member)).token
    await assert.rejects(caller(manager).user.suspend(fixtures.admin.id), error => error.code === 'FORBIDDEN')
    await assert.rejects(caller(manager).user.suspend(manager.id), error => error.code === 'BAD_REQUEST')
    await caller(manager).user.suspend(member.id)
    assert.equal(await resolve(session), null)
    await assert.rejects(signIn(member), error => error.code === 'FORBIDDEN' && /suspended/.test(error.message))
    await caller(manager).user.resume(member.id)
    const again = (await signIn(member)).token
    await caller(manager).user.revokeSessions(member.id)
    assert.equal(await resolve(again), null)
    await db.getRepository(User).update(member.id, { mfaEnabledAt: new Date() })
    await forbidden(caller(manager).user.resetMfa(member.id))
    await caller(fixtures.admin).user.resetMfa(member.id)
    assert.equal((await db.getRepository(User).findOneByOrFail({ id: member.id })).mfaEnabledAt, null)
    await caller(manager).user.sendPasswordResetFor(member.id)
    assert.deepEqual(state.queued.at(-1), { name: 'mailerResetPasswordQueue', userId: member.id })
    const csv = await caller(fixtures.admin).user.accessReview()
    const lines = csv.trim().split('\r\n')
    assert.equal(lines[0], 'email,name,company,role,region,groups,approved,email_verified,mfa,mfa_required,suspended_at,last_login_at,created_at')
    const row = lines.find(line => line.startsWith(member.email))
    assert(row.includes(`"'=HYPERLINK(""http://evil"")"`), row)
    await assert.rejects(caller(fixtures.member).user.accessReview(), error => error.code === 'UNAUTHORIZED')
})

test('the API sends security headers, allows only the client origin and refuses cross-site mutations', async () => {
    const appOrigin = new URL(env.appURL()).origin
    const response = await server.inject({ method: 'GET', url: '/trpc/env', headers: { origin: appOrigin } })
    assert.equal(response.headers['access-control-allow-origin'], appOrigin)
    assert.equal(response.headers['access-control-allow-credentials'], 'true')
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.equal(response.headers['referrer-policy'], 'no-referrer')
    assert.match(response.headers['content-security-policy'], /default-src 'none'/)
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/)
    assert.match(response.headers['strict-transport-security'], /max-age=/)
    // The one allowed origin is always named, so a browser on another origin refuses to read the answer.
    const foreign = await server.inject({ method: 'GET', url: '/trpc/env', headers: { origin: 'https://evil.example' } })
    assert.equal(foreign.headers['access-control-allow-origin'], appOrigin)
    const forged = await server.inject({ method: 'POST', url: '/trpc/auth.logout', headers: { origin: 'https://evil.example' }, payload: {} })
    assert.equal(forged.statusCode, 403)
    const allowed = await server.inject({ method: 'POST', url: '/trpc/auth.logout', headers: { origin: appOrigin }, payload: {} })
    assert.equal(allowed.statusCode, 200)
})

test('a sign-in over HTTP sets the cookie on the response and the next request is authenticated', async () => {
    const user = await withPassword()
    const login = await server.inject({ method: 'POST', url: '/trpc/auth.login', payload: { email: user.email, password: PASSWORD } })
    assert.equal(login.statusCode, 200)
    const cookie = login.cookies.find(candidate => candidate.name === 'damvia_session')
    assert.equal(cookie.httpOnly, true)
    assert.equal(cookie.sameSite, 'Lax')
    const me = await server.inject({ method: 'GET', url: '/trpc/user.me', cookies: { damvia_session: cookie.value } })
    assert.equal(JSON.parse(me.body).result.data.id, user.id)
    const anonymous = await server.inject({ method: 'GET', url: '/trpc/user.me', headers: { authorization: 'Bearer anything' } })
    assert.equal(anonymous.statusCode, 401)
})

test('proxy settings, cookie policy and role lists are validated', () => {
    assert.equal(env.parseTrustProxy(undefined), 1)
    assert.equal(env.parseTrustProxy('false'), false)
    assert.equal(env.parseTrustProxy('true'), true)
    assert.equal(env.parseTrustProxy('2'), 2)
    assert.deepEqual(env.parseTrustProxy('10.0.0.1, 10.0.0.2'), ['10.0.0.1', '10.0.0.2'])
    assert.deepEqual(env.parseMfaRequiredRoles(' Admin,manager '), ['admin', 'manager'])
    assert.throws(() => env.parseMfaRequiredRoles('admin,root'), /root/)
})

test('expired sessions and old link tokens are pruned', async () => {
    const user = await withPassword()
    const { token } = await signIn(user)
    await db.query(`UPDATE user_sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, [credentials.hashToken(token)])
    const old = await loginToken.createLoginToken(user.id, 'login')
    await db.query(`UPDATE login_tokens SET expires_at = now() - interval '2 days' WHERE token_hash = $1`, [credentials.hashToken(old)])
    await sessions.pruneExpiredSessions()
    assert.equal(await db.getRepository(UserSession).countBy({ tokenHash: credentials.hashToken(token) }), 0)
    assert.equal(await db.getRepository(LoginToken).countBy({ tokenHash: credentials.hashToken(old) }), 0)
})

const oidcBase = {
    issuer: 'https://idp.example.test', clientId: 'damvia', clientSecret: 'secret', label: 'Company login', scopes: 'openid email profile',
    trustEmail: false, autoCreate: false, defaultRegion: null, groupsClaim: null, groupMap: {}, only: false,
}

test('single sign-on links a verified email once, then recognises the subject', async () => {
    const user = await withPassword()
    await assert.rejects(oidc.userFromClaims({ sub: 'u-1', email: user.email.toUpperCase() }, oidcBase), error => error.reason === 'email_unverified')
    const linked = await oidc.userFromClaims({ sub: 'u-1', email: user.email.toUpperCase(), email_verified: true }, oidcBase)
    assert.equal(linked.id, user.id)
    assert.equal(linked.oidcSubject, 'https://idp.example.test|u-1')
    assert.equal((await oidc.userFromClaims({ sub: 'u-1' }, oidcBase)).id, user.id)
    await assert.rejects(oidc.userFromClaims({ sub: 'u-2', email: user.email, email_verified: true }, oidcBase), error => error.reason === 'conflict')
    const trusted = await withPassword()
    assert.equal((await oidc.userFromClaims({ sub: 'u-3', email: trusted.email }, { ...oidcBase, trustEmail: true })).id, trusted.id)
    await assert.rejects(oidc.userFromClaims({ email: trusted.email, email_verified: true }, oidcBase), error => error.reason === 'failed')
})

test('single sign-on creates accounts only when allowed, and syncs mapped groups only', async () => {
    const email = `${randomUUID()}@corp.test`
    await assert.rejects(oidc.userFromClaims({ sub: 'new-1', email, email_verified: true }, oidcBase), error => error.reason === 'no_account')
    const designers = await save(Group, { name: `Designers ${randomUUID()}` })
    const sales = await save(Group, { name: `Sales ${randomUUID()}` })
    const manual = await save(Group, { name: `Manual ${randomUUID()}` })
    const region = await save(Region, { name: `SSO ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    const settings = { ...oidcBase, autoCreate: true, defaultRegion: region.name, groupsClaim: 'groups', groupMap: { 'idp-design': designers.name, 'idp-sales': sales.name } }
    await assert.rejects(oidc.userFromClaims({ sub: 'new-1', email }, settings), error => error.reason === 'email_unverified')
    const created = await oidc.userFromClaims({ sub: 'new-1', email, email_verified: true, name: 'Casey', groups: ['idp-design', 'other'] }, settings)
    assert.equal(created.role, 'member')
    assert.equal(created.approved, true)
    assert.equal(created.emailVerified, true)
    assert.equal(created.password, null)
    assert.equal(created.regionId, region.id)
    const groupsOf = async () => (await db.getRepository(UserGroup).findBy({ userId: created.id })).map(row => row.groupId).sort()
    assert.deepEqual(await groupsOf(), [designers.id])
    await save(UserGroup, { userId: created.id, groupId: manual.id })
    await oidc.userFromClaims({ sub: 'new-1', groups: ['idp-sales'] }, settings)
    assert.deepEqual(await groupsOf(), [manual.id, sales.id].sort())
    await db.getRepository(User).update(created.id, { suspendedAt: new Date() })
    await assert.rejects(oidc.userFromClaims({ sub: 'new-1' }, settings), error => error.reason === 'suspended')
})

test('sign-in redirects stay on the client and the callback fails closed', async () => {
    for (const [input, expected] of [['/collections/1?x=2', '/collections/1?x=2'], ['//evil.example', '/'], ['/\\evil.example', '/'], ['https://evil.example', '/'], [undefined, '/'], ['collections', '/']]) {
        assert.equal(oidc.safeRedirect(input), expected, String(input))
    }
    const previous = env.oidcSettings
    try {
        env.oidcSettings = () => null
        assert.equal((await server.inject({ method: 'GET', url: '/v1/auth/oidc/start' })).statusCode, 404)
        env.oidcSettings = () => oidcBase
        const callback = await server.inject({ method: 'GET', url: '/v1/auth/oidc/callback?code=abc&state=forged' })
        assert.equal(callback.statusCode, 302)
        assert.equal(new URL(callback.headers.location).searchParams.get('sso_error'), 'failed')
        assert.equal(callback.cookies.find(cookie => cookie.name === 'damvia_session'), undefined)
    } finally {
        env.oidcSettings = previous
    }
})

test('with OIDC_ONLY, only guests keep passwords and email links', async () => {
    const previous = env.oidcSettings
    env.oidcSettings = () => ({ ...oidcBase, only: true })
    try {
        const member = await withPassword()
        const guest = await withPassword('guest')
        await assert.rejects(signIn(member), error => error.code === 'FORBIDDEN' && /single sign-on/.test(error.message))
        assert.equal((await signIn(guest)).result.status, 'signed_in')
        await assert.rejects(caller(null).user.create({ name: 'N', company: 'C', regionId: fixtures.region.id, email: `${randomUUID()}@example.test`, password: PASSWORD }), error => error.code === 'FORBIDDEN')
        state.queued.length = 0
        await caller(null).user.sendResetPasswordEmail(member.email)
        await caller(null).auth.login({ email: member.email, password: '', magicLink: true })
        assert.deepEqual(state.queued, [])
        const link = await loginToken.createLoginToken(member.id, 'login')
        await assert.rejects(caller(null).auth.exchangeLink({ token: link }), error => error.code === 'FORBIDDEN')
        assert.deepEqual((await caller(null).env()).sso, { label: 'Company login', only: true })
    } finally {
        env.oidcSettings = previous
    }
})

test('OIDC settings need issuer, client id and secret together, and a string map of groups', () => {
    assert.equal(env.parseOidcSettings({}), null)
    assert.throws(() => env.parseOidcSettings({ OIDC_ISSUER: 'https://idp' }), /together/)
    assert.throws(() => env.parseOidcSettings({ OIDC_ISSUER: 'https://idp', OIDC_CLIENT_ID: 'a', OIDC_CLIENT_SECRET: 's', OIDC_GROUP_MAP: '["x"]' }), /JSON object/)
    const parsed = env.parseOidcSettings({ OIDC_ISSUER: 'https://idp', OIDC_CLIENT_ID: 'a', OIDC_CLIENT_SECRET: 's', OIDC_GROUP_MAP: '{"g1":"Design"}', OIDC_ONLY: 'true' })
    assert.deepEqual({ label: parsed.label, scopes: parsed.scopes, groupMap: parsed.groupMap, only: parsed.only, autoCreate: parsed.autoCreate }, { label: 'Single sign-on', scopes: 'openid email profile', groupMap: { g1: 'Design' }, only: true, autoCreate: false })
})

test('recovery codes carry 80 bits, email sign-in links last 10 minutes, API answers are not cached', async () => {
    const { codes } = mfa.generateRecoveryCodes()
    assert.equal(new Set(codes).size, 10)
    for (const code of codes) assert.match(code, /^[0-9a-f]{5}(-[0-9a-f]{5}){3}$/)
    const user = await withPassword()
    const token = await loginToken.createLoginToken(user.id, 'login')
    const stored = await db.getRepository(LoginToken).findOneByOrFail({ tokenHash: credentials.hashToken(token) })
    assert(stored.expiresAt.getTime() - Date.now() <= 10 * 60 * 1000 + 1000)
    const response = await server.inject({ method: 'GET', url: '/trpc/env' })
    assert.equal(response.headers['cache-control'], 'no-store')
})

test('a person lists their sessions, ends one of their own, or ends every other one', async () => {
    const user = await withPassword()
    const tokens = []
    for (let i = 0; i < 3; i++) tokens.push((await signIn(user)).token)
    const current = await resolve(tokens[0])
    const second = await resolve(tokens[1])
    const own = caller(current.user, { session: current.session })
    const listed = await own.auth.sessions()
    assert.equal(listed.length, 3)
    assert.deepEqual(listed.filter(row => row.current).map(row => row.id), [current.session.id])
    assert.ok(listed.every(row => row.method === 'password' && row.userAgent === 'node-test'))
    assert.deepEqual(Object.keys(listed[0]).sort(), ['createdAt', 'current', 'id', 'lastSeenAt', 'method', 'userAgent'])
    for (let i = 1; i < listed.length; i++) assert.ok(listed[i - 1].lastSeenAt >= listed[i].lastSeenAt)
    const stranger = await withPassword()
    const strangerToken = (await signIn(stranger)).token
    const strangerSession = (await resolve(strangerToken)).session
    await own.auth.revokeSession({ id: strangerSession.id })
    assert.equal((await resolve(strangerToken)).user.id, stranger.id, 'another person\'s session is out of reach')
    assert.equal(await db.query(`SELECT 1 FROM audit_log WHERE action = 'session.revoked' AND after->>'sessionId' = $1`, [strangerSession.id]).then(rows => rows.length), 0)
    await own.auth.revokeSession({ id: second.session.id })
    assert.equal(await resolve(tokens[1]), null)
    assert.equal((await db.query(`SELECT actor_id FROM audit_log WHERE action = 'session.revoked' AND after->>'sessionId' = $1`, [second.session.id]))[0].actor_id, user.id)
    await own.auth.revokeOtherSessions()
    assert.equal(await resolve(tokens[2]), null)
    assert.equal((await resolve(tokens[0])).session.id, current.session.id)
    assert.deepEqual((await own.auth.sessions()).map(row => row.id), [current.session.id])
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'session.revoked' AND actor_id = $1 AND after->>'others' = 'true'`, [user.id]))[0].n, 1)
    for (const call of [c => c.auth.sessions(), c => c.auth.revokeSession({ id: current.session.id }), c => c.auth.revokeOtherSessions()]) {
        await assert.rejects(call(caller(null)), error => error.code === 'UNAUTHORIZED')
    }
    assert.equal((await resolve(tokens[0])).session.id, current.session.id)
})

test('recovery codes are renewed only with a valid second factor, and the previous ones stop working', async () => {
    const user = await withPassword()
    const found = await resolve((await signIn(user)).token)
    const own = caller(found.user, { session: found.session })
    await assert.rejects(own.auth.mfaRegenerateRecoveryCodes({ code: '000000' }), error => error.code === 'BAD_REQUEST')
    const { secret } = await own.auth.mfaSetup()
    const { recoveryCodes: previous } = await own.auth.mfaEnable({ code: codeAt(secret) })
    rateLimit.resetRateLimits()
    await assert.rejects(own.auth.mfaRegenerateRecoveryCodes({ code: '000000' }), error => error.code === 'BAD_REQUEST')
    const { recoveryCodes } = await own.auth.mfaRegenerateRecoveryCodes({ code: previous[0] })
    assert.equal(recoveryCodes.length, 10)
    assert.equal(recoveryCodes.some(code => previous.includes(code)), false)
    const stored = await db.getRepository(User).createQueryBuilder('user').addSelect('user.mfaRecoveryCodes').where('user.id = :id', { id: user.id }).getOneOrFail()
    assert.equal(stored.mfaRecoveryCodes.length, 10)
    assert.equal(stored.mfaRecoveryCodes.some(hash => recoveryCodes.includes(hash)), false, 'only hashes are stored')
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'mfa.recovery_codes_renewed' AND actor_id = $1`, [user.id]))[0].n, 1)
    rateLimit.resetRateLimits()
    const challenge = (await signIn(user)).result.challenge
    await assert.rejects(caller(null).auth.verifyMfa({ challenge, code: previous[1] }), error => error.code === 'BAD_REQUEST')
    assert.equal((await caller(null).auth.verifyMfa({ challenge, code: recoveryCodes[0] })).status, 'signed_in')
    await assert.rejects(caller(null).auth.mfaRegenerateRecoveryCodes({ code: recoveryCodes[1] }), error => error.code === 'UNAUTHORIZED')
})

test('single sign-on completes against a provider that answers correctly and opens an SSO session', async () => {
    const user = await withPassword()
    const issuer = 'https://idp.example.test'
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    const exchanged = []
    let authorize
    // The provider is played by fetch, which openid-client calls for discovery
    // and the code exchange; the ID token is signed with a key made for the run.
    const previousFetch = globalThis.fetch
    globalThis.fetch = async (url, init = {}) => {
        const { origin, pathname } = new URL(url)
        if (origin !== issuer) return previousFetch(url, init)
        if (pathname === '/.well-known/openid-configuration') {
            return json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] })
        }
        if (pathname === '/jwks') return json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'run', alg: 'RS256', use: 'sig' }] })
        const form = new URLSearchParams(init.body)
        exchanged.push({ code: form.get('code'), verified: createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === authorize.searchParams.get('code_challenge') })
        const idToken = sign({ sub: 'sso-subject', email: user.email, email_verified: true, nonce: authorize.searchParams.get('nonce') }, privateKey, { algorithm: 'RS256', keyid: 'run', issuer, audience: 'damvia', expiresIn: '5m' })
        return json({ access_token: 'access', token_type: 'Bearer', expires_in: 300, id_token: idToken })
    }
    const previousSettings = env.oidcSettings
    env.oidcSettings = () => ({ ...oidcBase, issuer })
    try {
        const start = await server.inject({ method: 'GET', url: '/v1/auth/oidc/start?redirect=/collections/1' })
        assert.equal(start.statusCode, 302)
        authorize = new URL(start.headers.location)
        assert.equal(`${authorize.origin}${authorize.pathname}`, `${issuer}/authorize`)
        assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
        const pending = start.cookies.find(cookie => cookie.name === 'damvia_oidc')
        assert.equal(pending.httpOnly, true)
        const callback = state => server.inject({ method: 'GET', url: `/v1/auth/oidc/callback?code=provider-code&state=${state}`, cookies: { damvia_oidc: pending.value } })
        const forged = await callback('another-state')
        assert.equal(new URL(forged.headers.location).searchParams.get('sso_error'), 'failed')
        assert.equal(forged.cookies.find(cookie => cookie.name === 'damvia_session'), undefined)
        const signedIn = await callback(authorize.searchParams.get('state'))
        assert.equal(signedIn.statusCode, 302)
        assert.equal(new URL(signedIn.headers.location).pathname, '/collections/1')
        const found = await resolve(signedIn.cookies.find(cookie => cookie.name === 'damvia_session').value)
        assert.deepEqual([found.user.id, found.session.method], [user.id, 'sso'])
        assert.equal((await db.getRepository(User).findOneByOrFail({ id: user.id })).oidcSubject, `${issuer}|sso-subject`)
        assert.deepEqual(exchanged, [{ code: 'provider-code', verified: true }])
    } finally {
        globalThis.fetch = previousFetch
        env.oidcSettings = previousSettings
    }
})
