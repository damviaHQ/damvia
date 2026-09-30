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
// Modules: packages listed in DAMVIA_MODULES that add tables, a router and
// queues to the core. See docs/contributing/modules.md.
// The suite runs against the fixtures in test/fixtures, loaded like packages.
process.env.DAMVIA_MODULES = ' ./test/fixtures/module-hello.cjs, , '
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, save, caller, makeUser, forbidden, state, worker, fixtures } = harness
const { Group, Region } = harness.entities
const { moduleEntries, modules } = require('../dist/modules')
const hello = require('./fixtures/module-hello.cjs')

// Not harness.setup(): it replays the core upgrade migrations and expects the
// core's to be the last applied, while this suite adds the module's on top.
before(async () => {
    await db.initialize()
    await worker.startQueues({ enableWorker: true })
    fixtures.group = await save(Group, { name: `Modules ${randomUUID()}` })
    fixtures.region = await save(Region, { name: `Modules ${randomUUID()}`, defaultGroupId: fixtures.group.id })
    fixtures.admin = await makeUser('admin')
    fixtures.member = await makeUser('member')
    fixtures.guest = await makeUser('guest')
})
after(async () => {
    const [last] = await db.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1')
    if (last?.name === 'HelloNotes1893456000000') await db.undoLastMigration()
    await harness.teardown()
})

test('DAMVIA_MODULES lists packages or paths separated by commas, blanks ignored', () => {
    assert.deepEqual(moduleEntries(' a, ,./b ,@scope/c'), ['a', './b', '@scope/c'])
    assert.deepEqual(moduleEntries(undefined), [])
    assert.deepEqual(modules.map(module => module.name), ['hello'])
})

test('a module migration creates its table after the core ones, and its entity is usable', async () => {
    const [last] = await db.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1')
    assert.equal(last.name, 'HelloNotes1893456000000')
    const note = await db.getRepository('HelloNote').save({ text: 'direct', authorId: fixtures.admin.id })
    assert.equal((await db.getRepository('HelloNote').findOneByOrFail({ id: note.id })).text, 'direct')
})

test('a module router is served at modules.<name> behind the core role checks', async () => {
    const added = await caller(fixtures.member).modules.hello.add({ text: 'from a member' })
    assert.equal(added.authorId, fixtures.member.id)
    await forbidden(caller(null).modules.hello.add({ text: 'anonymous' }))
    await forbidden(caller(fixtures.guest).modules.hello.add({ text: 'guest' }))
    await forbidden(caller(fixtures.member).modules.hello.list())
    await assert.rejects(caller(fixtures.member).modules.hello.add({ text: '' }), error => error.code === 'BAD_REQUEST')
    assert((await caller(fixtures.admin).modules.hello.list()).some(note => note.id === added.id))
    const response = await harness.server.inject({ method: 'GET', url: '/trpc/modules.hello.list' })
    assert.equal(response.statusCode, 401)
    const forged = await harness.server.inject({ method: 'POST', url: '/trpc/modules.hello.add', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, payload: { text: 'forged' } })
    assert.equal(forged.statusCode, 403)
    assert.equal(response.headers['cache-control'], 'no-store')
})

test('module queues are named after the module and run like core queues', async () => {
    assert(state.processors.has('hello/digest'))
    await state.processors.get('hello/digest')([{ id: randomUUID(), name: 'hello/digest', data: { reason: 'test' } }])
    assert.deepEqual(hello.received.at(-1), { digest: { reason: 'test' } })
})

test('the server refuses to start with an invalid or a duplicated module', () => {
    const start = modules => {
        try {
            execFileSync(process.execPath, ['-e', `require('./dist/trpc')`], { env: { ...process.env, DAMVIA_MODULES: modules }, stdio: 'pipe' })
            return 'started'
        } catch (error) { return error.stderr.toString() }
    }
    assert.match(start('./test/fixtures/module-invalid.cjs'), /Module \.\/test\/fixtures\/module-invalid\.cjs must export a name in camelCase/)
    assert.match(start('./test/fixtures/module-hello.cjs,./test/fixtures/module-hello.cjs'), /Two modules are named hello/)
    assert.match(start('./test/fixtures/missing.cjs'), /Cannot find module/)
    assert.equal(start(''), 'started')
})
