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
const { db, state, save, makeUser, makeCollection, makeFolder, makeFile } = harness
const { sign, decode } = require('jsonwebtoken')
const { User, UserGroup, AuthorizedDomain } = harness.entities
const { createUser, createGuestUser, generateAuthToken, getUserFromRequest } = harness.services.users
const { env } = harness
let fixtures
const fromHeader = authorization => getUserFromRequest({ headers: authorization === undefined ? {} : { authorization } })
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

test('sessions embed the user id and auth version and last 180 days', async () => {
    const token = await generateAuthToken(fixtures.member)
    const payload = decode(token)
    assert.equal(payload.userId, fixtures.member.id)
    assert.equal(payload.authVersion, fixtures.member.authVersion)
    assert.equal(payload.exp - payload.iat, 180 * 86400)
})

test('only tokens signed with the app secret for a current auth version resolve to a user', async () => {
    const user = await makeUser('member')
    await save(UserGroup, { userId: user.id, groupId: fixtures.group.id })
    const resolved = await fromHeader(await generateAuthToken(user))
    assert.equal(resolved.id, user.id)
    assert.equal(resolved.userGroups[0].group.id, fixtures.group.id)
    const payload = { userId: user.id, authVersion: user.authVersion }
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`
    for (const header of [
        undefined,
        '',
        'garbage',
        unsigned,
        sign(payload, 'another-secret-that-is-long-enough-for-tests'),
        sign({ ...payload, authVersion: user.authVersion + 1 }, process.env.APP_SECRET),
        sign({ ...payload, authVersion: 'one' }, process.env.APP_SECRET),
        sign({ authVersion: user.authVersion }, process.env.APP_SECRET),
        sign({ ...payload, userId: randomUUID() }, process.env.APP_SECRET),
        sign(payload, process.env.APP_SECRET, { expiresIn: -10 }),
    ]) assert.equal(await fromHeader(header), null, `accepted ${header}`)
    await db.getRepository(User).update(user.id, { authVersion: user.authVersion + 1 })
    assert.equal(await fromHeader(await generateAuthToken(user)), null)
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
