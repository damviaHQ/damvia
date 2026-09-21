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
// Pins what the record matching cron does today, before the resolver steps
// of the data enrichment work replace it.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, save, makeFolder, makeFile } = harness
const { AssetFile, DataRecord } = harness.entities
const { assignProductsToAssetFiles } = harness.services.assets
before(() => harness.setup())
after(() => harness.teardown())

const fileRow = id => db.getRepository(AssetFile).findOneByOrFail({ id })

test('group 1 gives the record key and group 2 the view; a name without a match is left alone', async () => {
    process.env.PRODUCT_MATCHING_REGEX = '^(.{6}-\\d{3})(?:\\.(\\d{2}))?'
    const record = await save(DataRecord, { recordKey: '773742-228', keyColumnName: 'SKU', metaData: {} })
    const folder = await makeFolder()
    const front = await makeFile(folder, { name: '773742-228.01.jpg' })
    const noView = await makeFile(folder, { name: '773742-228_campaign.jpg' })
    const other = await makeFile(folder, { name: 'banner.jpg', recordId: record.id, recordView: 'kept' })
    await assignProductsToAssetFiles()
    assert.equal((await fileRow(front.id)).recordId, record.id)
    assert.equal((await fileRow(front.id)).recordView, '01')
    assert.equal((await fileRow(noView.id)).recordId, record.id)
    assert.equal((await fileRow(noView.id)).recordView, null)
    assert.equal((await fileRow(other.id)).recordId, record.id)
    assert.equal((await fileRow(other.id)).recordView, 'kept')
})

test('a key with no record erases an earlier link, and the cron is a no-op without the regex', async () => {
    process.env.PRODUCT_MATCHING_REGEX = '^(.{6}-\\d{3})(?:\\.(\\d{2}))?'
    const folder = await makeFolder()
    const orphan = await makeFile(folder, { name: '773742-999.00.jpg' })
    const linked = await save(DataRecord, { recordKey: '773742-230', keyColumnName: 'SKU', metaData: {} })
    await db.getRepository(AssetFile).update(orphan.id, { recordId: linked.id })
    await assignProductsToAssetFiles()
    assert.equal((await fileRow(orphan.id)).recordId, null)
    assert.equal((await fileRow(orphan.id)).recordView, '00')
    delete process.env.PRODUCT_MATCHING_REGEX
    await db.getRepository(AssetFile).update(orphan.id, { recordId: linked.id })
    await assignProductsToAssetFiles()
    assert.equal((await fileRow(orphan.id)).recordId, linked.id)
})
