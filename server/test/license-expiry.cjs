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
const { db, env, state, save, makeUser } = harness
const { License } = harness.entities
const { expiringLicenses, notifyExpiringLicenses } = require('../dist/services/license-expiry')
let fixtures
before(async () => { fixtures = await harness.setup() })
after(() => harness.teardown())

const today = new Date('2026-10-01T09:00:00Z')
const inDays = days => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10)

test('admins hear about a licence 30, 7 and 1 days before it ends, once per notice day', async () => {
    await db.query('DELETE FROM licenses')
    const tag = randomUUID().slice(0, 6)
    for (const days of [30, 29, 7, 1, 0, -1]) await save(License, { name: `L${days} ${tag}`, scopes: [], usageTo: inDays(days) })
    await save(License, { name: `Open ${tag}`, scopes: [] })
    assert.deepEqual((await expiringLicenses(today, [30, 7, 1])).map(l => [l.name, l.days]), [[`L1 ${tag}`, 1], [`L7 ${tag}`, 7], [`L30 ${tag}`, 30]])
    assert.deepEqual(await expiringLicenses(today, []), [])
    assert.equal((await expiringLicenses(today, [0])).length, 1)

    const suspended = await makeUser('admin', { suspendedAt: new Date() })
    state.sentMails.length = 0
    assert.equal(await notifyExpiringLicenses(today), 3)
    const mail = state.sentMails.at(-1)
    assert(mail.to.includes(fixtures.admin.email))
    assert(!mail.to.includes(suspended.email))
    assert(!mail.to.includes(fixtures.manager.email))
    assert.equal(mail.subject, '3 licences end soon')
    assert(mail.text.includes(`- L7 ${tag}: ends ${inDays(7)} (7 days left)`))
    assert(mail.text.includes(`- L1 ${tag}: ends ${inDays(1)} (1 day left)`))
    assert(mail.text.includes('/admin/licenses'))

    state.sentMails.length = 0
    assert.equal(await notifyExpiringLicenses(new Date('2026-12-25T09:00:00Z')), 0)
    assert.equal(state.sentMails.length, 0)
})

test('notice days are validated', () => {
    assert.deepEqual(env.parseLicenseNoticeDays(undefined), [30, 7, 1])
    assert.deepEqual(env.parseLicenseNoticeDays('14, 3,3'), [14, 3])
    assert.deepEqual(env.parseLicenseNoticeDays(''), [])
    assert.throws(() => env.parseLicenseNoticeDays('7,soon'))
})
