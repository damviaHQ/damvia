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
// The admin dashboard. See docs/administration/dashboard.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, server, state, caller, makeFolder, makeFile, forbidden } = harness
const { Collection, AssetFolder } = harness.entities
const { queued } = state
let admin, member, manager, guest
before(async () => ({ admin, member, manager, guest } = await harness.setup()))
after(() => harness.teardown())

test('the dashboard and its actions are admin only and expose numbers, not strings', async () => {
    for (const user of [null, guest, member, manager, { ...admin, approved: false }]) {
        await forbidden(caller(user).dashboard.summary())
        await forbidden(caller(user).dashboard.retryPendingAssets())
        await forbidden(caller(user).dashboard.measureStorage())
    }
    const folder = await makeFolder()
    await makeFile(folder)
    await makeFile(folder, { status: 'outdated' })
    const summary = await caller(admin).dashboard.summary()
    assert.equal(typeof summary.storage.usedBytes, 'number')
    assert.equal(summary.storage.quotaBytes, null)
    assert.equal(summary.storage.disk, null)
    assert.deepEqual(summary.storage.serverContactEmails, [])
    assert.equal(summary.storage.percent, null)
    const byStatus = await db.query('SELECT status, count(*)::int AS n FROM asset_files GROUP BY status')
    assert.deepEqual(summary.assets.byStatus, Object.fromEntries(byStatus.map(row => [row.status, row.n])))
    assert.ok(summary.assets.byStatus.up_to_date >= 1 && summary.assets.byStatus.outdated >= 1)
    assert.equal(summary.collections.total, await db.getRepository(Collection).count())
    assert.equal(summary.folders.total, await db.getRepository(AssetFolder).count())
    assert(summary.recentFiles.length <= 3)
    for (const [index, file] of summary.recentFiles.entries()) {
        assert.deepEqual(Object.keys(file).sort(), ['folderId', 'id', 'name', 'size', 'status', 'updatedAt'])
        if (index) assert(summary.recentFiles[index - 1].updatedAt >= file.updatedAt)
    }
    assert.equal(typeof summary.users.total, 'number')
    assert.equal(typeof summary.users.maintenanceContacts, 'number')
    assert.equal(typeof summary.users.byRole.admin, 'number')
    const queuedBefore = queued.length
    const retry = await caller(admin).dashboard.retryPendingAssets()
    assert.equal(typeof retry.queued, 'number')
    assert.equal(queued.length - queuedBefore, retry.queued)
    await caller(admin).dashboard.measureStorage()
    assert.equal(queued.at(-1).name, 'storageMeasureUsageQueue')
    const response = await server.inject({ method: 'GET', url: '/trpc/dashboard.summary' })
    assert.equal(response.statusCode, 401)
    const publicEnv = await caller(null).env()
    assert(!('storage' in publicEnv))
})
