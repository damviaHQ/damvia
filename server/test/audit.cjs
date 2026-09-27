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
const harness = require('./lib/helpers.cjs')
const { db, env, caller, fakeRequest, makeUser, makeCollection, makeFolder, makeFile, save } = harness
const { User, Group, CollectionFile } = harness.entities
const audit = require('../dist/services/audit')
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())
beforeEach(() => harness.services.rateLimit.resetRateLimits())

const entries = (where = '', params = []) => db.query(`SELECT * FROM audit_log ${where} ORDER BY created_at, id`, params)
const lastFor = async (action, targetId) => (await entries('WHERE action = $1 AND target_id = $2', [action, targetId])).at(-1)

test('the audit log is append-only apart from anonymisation and the retention job', async () => {
    const user = await makeUser()
    await audit.recordAudit(null, { actorId: user.id, action: 'test.event', targetType: 'user', targetId: user.id, after: { x: 1 }, req: fakeRequest() })
    const [row] = await entries('WHERE action = $1 AND actor_id = $2', ['test.event', user.id])
    assert.equal(row.actor_label, user.email)
    assert.equal(row.user_agent, 'node-test')
    await assert.rejects(db.query(`UPDATE audit_log SET action = 'forged' WHERE id = $1`, [row.id]), /append-only/)
    await assert.rejects(db.query(`UPDATE audit_log SET after = '{"x":2}' WHERE id = $1`, [row.id]), /append-only/)
    await assert.rejects(db.query(`UPDATE audit_log SET actor_id = $2 WHERE id = $1`, [row.id, fixtures.admin.id]), /append-only/)
    await assert.rejects(db.query(`DELETE FROM audit_log WHERE id = $1`, [row.id]), /append-only/)
    await db.query(`UPDATE audit_log SET actor_id = NULL, actor_label = 'deleted user', ip = NULL, user_agent = NULL WHERE id = $1`, [row.id])
    await db.getRepository(User).delete(user.id)
    assert.equal((await entries('WHERE id = $1', [row.id])).length, 1)
})

test('secrets never reach an entry and large values are bounded', () => {
    const redacted = audit.redact({ email: 'a@b', password: 'p', newPassword: 'p', nested: { token: 't', resetCode: 'c', ok: 1 }, list: Array.from({ length: 205 }, (_, i) => i), long: 'x'.repeat(2500) })
    assert.equal(redacted.password, '[redacted]')
    assert.equal(redacted.newPassword, '[redacted]')
    assert.deepEqual(redacted.nested, { token: '[redacted]', resetCode: '[redacted]', ok: 1 })
    assert.equal(redacted.list.length, 201)
    assert.equal(redacted.long.length, 2001)
    assert.equal(redacted.email, 'a@b')
})

test('admin and manager mutations are recorded with their input, member ones are not', async () => {
    const group = await save(Group, { name: `Audit ${randomUUID()}` })
    await caller(fixtures.admin).group.update({ id: group.id, name: `${group.name} renamed` })
    const [renamed] = await entries(`WHERE action = 'admin.change' AND target_id = 'group.update' AND after->>'id' = $1`, [group.id])
    assert.deepEqual([renamed.actor_id, renamed.target_type, renamed.after.name], [fixtures.admin.id, 'procedure', `${group.name} renamed`])
    const name = `Recorded ${randomUUID()}`
    await caller(fixtures.manager).group.list()
    await caller(fixtures.admin).authorizedDomain.create({ domain: `${randomUUID().slice(0, 8)}.example`, detail: name })
    const [recorded] = await entries(`WHERE action = 'admin.change' AND target_id = 'authorizedDomain.create' AND after->>'detail' = $1`, [name])
    assert.equal(recorded.actor_id, fixtures.admin.id)
    assert.equal((await entries(`WHERE action = 'admin.change' AND actor_id = $1 AND target_id = 'group.list'`, [fixtures.manager.id])).length, 0, 'queries are not recorded')
    const member = await makeUser()
    const folder = await makeFolder()
    const collectionFile = await save(CollectionFile, { collectionId: (await makeCollection({ assetFolderId: folder.id })).id, assetFileId: (await makeFile(folder)).id })
    await caller(member).favorite.add({ collectionFileId: collectionFile.id })
    assert.equal((await caller(member).favorite.list()).length, 1)
    assert.equal((await entries(`WHERE actor_id = $1`, [member.id])).length, 0)
})

test('refused calls by signed-in users are recorded as access denials', async () => {
    const member = await makeUser()
    await assert.rejects(caller(member).user.list())
    const denied = await entries(`WHERE action = 'access.denied' AND actor_id = $1`, [member.id])
    assert.deepEqual(denied.map(row => row.target_id), ['user.list'])
    await assert.rejects(caller(null).user.list())
    assert.equal((await entries(`WHERE action = 'access.denied' AND actor_id IS NULL AND target_id = 'user.list'`)).length, 0)
})

test('account changes carry before and after, and sign-ins and failures are recorded', async () => {
    const member = await makeUser('member', { password: await harness.services.credentials.hashPassword('long enough passphrase') })
    await caller(fixtures.admin).user.update({ id: member.id, name: member.name, company: 'New Co', regionId: member.regionId, email: member.email, role: 'guest', groupIds: [fixtures.group.id] })
    const updated = await lastFor('user.updated', member.id)
    assert.equal(updated.actor_id, fixtures.admin.id)
    assert.equal(updated.before.role, 'member')
    assert.equal(updated.after.role, 'guest')
    assert.equal(updated.after.company, 'New Co')
    assert.deepEqual(updated.after.groupIds, [fixtures.group.id])
    assert.equal((await entries(`WHERE action = 'admin.change' AND target_id = 'user.update'`)).length, 0, 'no duplicate generic entry')
    await assert.rejects(caller(null).auth.login({ email: member.email, password: 'wrong wrong wrong' }))
    assert.equal((await lastFor('auth.sign_in_failed', member.id)).after.failedLoginCount, 1)
    await caller(null).auth.login({ email: member.email, password: 'long enough passphrase' })
    const created = await lastFor('session.created', member.id)
    assert.equal(created.after.method, 'password')
    assert.equal(created.actor_id, member.id)
    const unknown = `${randomUUID()}@example.test`
    await assert.rejects(caller(null).auth.login({ email: unknown, password: 'whatever it is' }))
    assert(await lastFor('auth.sign_in_failed', unknown))
    await caller(fixtures.admin).user.suspend(member.id)
    assert(await lastFor('user.suspended', member.id))
    await caller(fixtures.admin).user.resume(member.id)
    assert(await lastFor('user.resumed', member.id))
})

test('old entries are pruned by the retention job only', async () => {
    const days = env.auditRetentionDays
    // Triggers are off on one connection only, so the back-dated row cannot
    // leak that state into the pool.
    const runner = db.createQueryRunner()
    await runner.connect()
    let old
    try {
        await runner.query('SET session_replication_role = replica')
        ;[old] = await runner.query(`INSERT INTO audit_log (action, target_type, created_at) VALUES ('test.old', 'test', now() - interval '800 days') RETURNING id`)
    } finally {
        await runner.query('SET session_replication_role = DEFAULT')
        await runner.release()
    }
    const recent = await makeUser()
    await audit.recordAudit(null, { actorId: recent.id, action: 'test.recent', targetType: 'user', targetId: recent.id })
    try {
        env.auditRetentionDays = () => null
        assert.equal(await audit.pruneAuditLog(), 0)
        assert.equal((await entries('WHERE id = $1', [old.id])).length, 1)
        env.auditRetentionDays = () => 730
        assert(await audit.pruneAuditLog() >= 1)
        assert.equal((await entries('WHERE id = $1', [old.id])).length, 0)
        assert.equal((await entries(`WHERE action = 'test.recent' AND actor_id = $1`, [recent.id])).length, 1, 'recent entries stay')
    } finally {
        env.auditRetentionDays = days
    }
})

test('admins filter, page and export the log; exports are recorded and formula-safe', async () => {
    const member = await makeUser('member', { email: `=cmd${randomUUID().slice(0, 6)}@example.test` })
    await audit.recordAudit(null, { actorId: member.id, action: 'test.export', targetType: 'user', targetId: member.id })
    const page = await caller(fixtures.admin).audit.list({ action: 'test.export', page: 1, pageSize: 10 })
    assert.equal(page.total, 1)
    assert.equal(page.items[0].targetLabel, member.email)
    assert((await caller(fixtures.admin).audit.actions()).includes('test.export'))
    const csv = await caller(fixtures.admin).audit.export({ action: 'test.export' })
    const lines = csv.trim().split('\r\n')
    assert.equal(lines[0], 'createdAt,actorLabel,actorId,action,targetType,targetId,targetLabel,before,after,ip,userAgent')
    assert(lines[1].includes(`'${member.email}`))
    const exported = await entries(`WHERE action = 'audit.exported' AND actor_id = $1 AND target_id IS NULL`, [fixtures.admin.id])
    assert.equal(exported.length, 1)
    assert.deepEqual([exported[0].target_type, exported[0].after.rows, exported[0].after.filters.action], ['audit_log', 1, 'test.export'])
    await harness.forbidden(caller(fixtures.manager).audit.list({ page: 1, pageSize: 10 }))
    const future = await caller(fixtures.admin).audit.list({ action: 'test.export', from: new Date(Date.now() + 86400000), page: 1, pageSize: 10 })
    assert.equal(future.total, 0)
})
