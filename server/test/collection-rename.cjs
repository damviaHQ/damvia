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
const harness = require('./lib/helpers.cjs')
const { db, caller, makeCollection, makeFolder, forbidden } = harness
const { Collection } = harness.entities
let member, admin
before(async () => ({ member, admin } = await harness.setup()))
after(() => harness.teardown())

test('rename changes only the name and does not propagate visibility or restrictions to children', async () => {
  const parent = await makeCollection({ name: 'Before', public: false, owner: member, draft: true, description: 'Keep description' })
  const child = await makeCollection({ parent, public: false, owner: member, draft: false, name: 'Child' })
  const renamed = await caller(member).collection.rename({ id: parent.id, name: '  After  ' })
  assert.equal(renamed.name, 'After')
  const stored = await db.getRepository(Collection).findOneByOrFail({ id: parent.id })
  assert.equal(stored.description, 'Keep description')
  assert.equal(stored.draft, true)
  assert.equal(stored.public, false)
  assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: child.id })).draft, false)
  const publicCollection = await makeCollection({ name: 'Public name' })
  await caller(admin).collection.rename({ id: publicCollection.id, name: 'Admin name' })
  assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: publicCollection.id })).name, 'Admin name')
})

test('rename enforces edit permission, synchronization and valid names', async () => {
  const publicCollection = await makeCollection({ name: 'Before' })
  await forbidden(caller(null).collection.rename({ id: publicCollection.id, name: 'Changed' }))
  await forbidden(caller(member).collection.rename({ id: publicCollection.id, name: 'Changed' }))
  for (const name of ['   ', 'x'.repeat(81)]) {
    await assert.rejects(caller(admin).collection.rename({ id: publicCollection.id, name }), { code: 'BAD_REQUEST' })
  }
  const folder = await makeFolder()
  const synchronized = await makeCollection({ assetFolderId: folder.id, name: 'Cloud name' })
  await assert.rejects(caller(admin).collection.rename({ id: synchronized.id, name: 'Changed' }), { code: 'BAD_REQUEST' })
  assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: synchronized.id })).name, 'Cloud name')
})
