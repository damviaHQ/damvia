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
const { randomUUID } = require('node:crypto')
const { IsNull } = require('typeorm')
const harness = require('./lib/helpers.cjs')
const { db, env, caller, fakeRequest, fakeReply, makeUser, makeCollection, save } = harness
const { User, UserGroup, RecordChange } = harness.entities
const { recordAudit } = require('../dist/services/audit')
const { recordSearchEvent } = require('../dist/services/analytics')
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())
beforeEach(() => harness.services.rateLimit.resetRateLimits())

async function personWithHistory() {
    const user = await makeUser('member', { password: await harness.services.credentials.hashPassword('a long enough passphrase') })
    await save(UserGroup, { userId: user.id, groupId: fixtures.group.id })
    await harness.services.session.createSession(fakeRequest(), fakeReply(), user, 'password')
    const personal = await makeCollection({ public: false, ownerId: user.id, name: `Mine ${randomUUID()}` })
    await db.query(`INSERT INTO activity_events (user_id, type, metadata) VALUES ($1, 'search', '{"query":"red shoes","total":3}')`, [user.id])
    await db.query(`INSERT INTO record_changes (record_key, action, source, changes, changed_by_id) VALUES ('SKU-1', 'update', 'manual', '{}', $1)`, [user.id])
    await recordAudit(null, { actorId: fixtures.admin.id, action: 'user.updated', targetType: 'user', targetId: user.id, before: { role: 'guest' }, after: { role: 'member' }, req: fakeRequest() })
    return { user, personal }
}

test('a person downloads everything held about them, without secrets or other people\'s addresses', async () => {
    const { user, personal } = await personWithHistory()
    const organisation = await caller(fixtures.admin).organisation.create({ name: `Exported ${randomUUID()}` })
    await db.query('UPDATE users SET organisation_id = $1 WHERE id = $2', [organisation.id, user.id])
    const data = await caller(user).user.exportMyData()
    assert.equal(data.account.email, user.email)
    assert.equal(data.account.organisation, organisation.name)
    assert.deepEqual(data.groups, ['Default'])
    assert.deepEqual(data.collections.map(c => c.name), [personal.name])
    assert.equal(data.activity[0].metadata.query, 'red shoes')
    assert.equal(data.recordChanges[0].recordKey, 'SKU-1')
    assert.equal(data.sessions.length, 1)
    const byAdmin = data.audit.find(entry => entry.action === 'user.updated')
    assert.equal(byAdmin.byYou, false)
    assert.equal(byAdmin.ip, null)
    assert(data.audit.some(entry => entry.action === 'session.created' && entry.byYou && entry.userAgent === 'node-test'))
    const text = JSON.stringify(data)
    const stored = await db.query('SELECT password, token_hash FROM users u JOIN user_sessions s ON s.user_id = u.id WHERE u.id = $1', [user.id])
    for (const secret of ['scrypt$', stored[0].password, stored[0].token_hash, 'mfaSecret', 'tokenHash', 'resetPasswordToken', 'recoveryCodes']) assert(!text.includes(secret), secret)
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'user.data_exported' AND actor_id = $1`, [user.id]))[0].n, 1)
    for (let i = 0; i < 2; i++) await caller(user).user.exportMyData()
    await assert.rejects(caller(user).user.exportMyData(), error => error.code === 'TOO_MANY_REQUESTS')
})

test('only admins export someone else\'s data', async () => {
    const { user } = await personWithHistory()
    assert.equal((await caller(fixtures.admin).user.exportData(user.id)).account.id, user.id)
    await harness.forbidden(caller(fixtures.manager).user.exportData(user.id))
    await harness.forbidden(caller(await makeUser()).user.exportData(user.id))
    await assert.rejects(caller(fixtures.admin).user.exportData(randomUUID()), error => error.code === 'NOT_FOUND')
})

test('deleting an account keeps history and statistics but removes who the person was', async () => {
    const { user, personal } = await personWithHistory()
    await recordAudit(null, { actorId: null, action: 'auth.sign_in_failed', targetType: 'email', targetId: user.email, req: fakeRequest() })
    // A failed sign-in has no actor; one that names the address is labelled with it.
    await db.query(`UPDATE audit_log SET actor_label = $1 WHERE action = 'auth.sign_in_failed' AND target_id = $1`, [user.email])
    await caller(user).user.removeAccount(user.id)
    assert.equal(await db.getRepository(User).existsBy({ id: user.id }), false)
    const own = await db.query(`SELECT actor_id, actor_label, ip, user_agent FROM audit_log WHERE action = 'session.created' AND target_id = $1`, [user.id])
    assert.equal(own.length, 1)
    assert.equal(own[0].actor_id, null)
    assert.match(own[0].actor_label, /^deleted user /)
    assert.equal(own[0].ip, null)
    assert.equal(own[0].user_agent, null)
    const failed = await db.query(`SELECT actor_label FROM audit_log WHERE action = 'auth.sign_in_failed' AND target_id = $1`, [user.email])
    assert.deepEqual(failed.map(row => row.actor_label), [own[0].actor_label])
    const deleted = await db.query(`SELECT before FROM audit_log WHERE action = 'user.deleted' AND target_id = $1`, [user.id])
    assert.deepEqual(Object.keys(deleted[0].before).sort(), ['regionId', 'role'])
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM activity_events WHERE metadata ->> 'query' = 'red shoes' AND user_id IS NULL`))[0].n >= 1, true)
    const change = await db.getRepository(RecordChange).findOneByOrFail({ recordKey: 'SKU-1', changedById: IsNull() })
    assert.equal(change.action, 'update')
    assert.equal(await db.query('SELECT 1 FROM collections WHERE id = $1', [personal.id]).then(rows => rows.length), 0)
})

test('searches are stored named, anonymous or not at all', async () => {
    const user = await makeUser()
    const mode = env.analyticsSearchMode
    const count = term => db.query(`SELECT user_id FROM activity_events WHERE type = 'search' AND metadata ->> 'query' = $1`, [term])
    try {
        const named = `named ${randomUUID()}`
        await recordSearchEvent(user.id, null, named, 1)
        await recordSearchEvent(user.id, null, named, 1)
        assert.deepEqual((await count(named)).map(row => row.user_id), [user.id], 'deduplicated within a minute')
        env.analyticsSearchMode = () => 'anonymous'
        const anonymous = `anonymous ${randomUUID()}`
        await recordSearchEvent(user.id, null, anonymous, 1)
        await recordSearchEvent(fixtures.admin.id, null, anonymous, 1)
        assert.deepEqual((await count(anonymous)).map(row => row.user_id), [null])
        env.analyticsSearchMode = () => 'off'
        const off = `off ${randomUUID()}`
        await recordSearchEvent(user.id, null, off, 1)
        assert.equal((await count(off)).length, 0)
    } finally {
        env.analyticsSearchMode = mode
    }
})

test('the privacy page receives this instance\'s settings', async () => {
    const privacy = (await caller(null).env()).privacy
    assert.deepEqual(privacy, {
        controller: null, contact: null, analyticsRetentionDays: 365, auditRetentionDays: 730, auditLogsAddress: true,
        searchMode: 'named', sessionIdleHours: 12, sessionMaxHours: 720, passwordBreachCheck: false,
    })
})
