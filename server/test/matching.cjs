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
// Pins what the product matching cron does today, before the resolver steps
// of the data enrichment work replace it.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, save, makeFolder, makeFile } = harness
const { AssetFile, Product } = harness.entities
const { assignProductsToAssetFiles } = harness.services.assets
before(() => harness.setup())
after(() => harness.teardown())

const fileRow = id => db.getRepository(AssetFile).findOneByOrFail({ id })

test('group 1 gives the product key and group 2 the view; a name without a match is left alone', async () => {
    process.env.PRODUCT_MATCHING_REGEX = '^(.{6}-\\d{3})(?:\\.(\\d{2}))?'
    const product = await save(Product, { productKey: '773742-228', primaryKeyName: 'SKU', metaData: {} })
    const folder = await makeFolder()
    const front = await makeFile(folder, { name: '773742-228.01.jpg' })
    const noView = await makeFile(folder, { name: '773742-228_campaign.jpg' })
    const other = await makeFile(folder, { name: 'banner.jpg', productId: product.id, productView: 'kept' })
    await assignProductsToAssetFiles()
    assert.equal((await fileRow(front.id)).productId, product.id)
    assert.equal((await fileRow(front.id)).productView, '01')
    assert.equal((await fileRow(noView.id)).productId, product.id)
    assert.equal((await fileRow(noView.id)).productView, null)
    assert.equal((await fileRow(other.id)).productId, product.id)
    assert.equal((await fileRow(other.id)).productView, 'kept')
})

test('a key with no product erases an earlier link, and the cron is a no-op without the regex', async () => {
    process.env.PRODUCT_MATCHING_REGEX = '^(.{6}-\\d{3})(?:\\.(\\d{2}))?'
    const folder = await makeFolder()
    const orphan = await makeFile(folder, { name: '773742-999.00.jpg' })
    const linked = await save(Product, { productKey: '773742-230', primaryKeyName: 'SKU', metaData: {} })
    await db.getRepository(AssetFile).update(orphan.id, { productId: linked.id })
    await assignProductsToAssetFiles()
    assert.equal((await fileRow(orphan.id)).productId, null)
    assert.equal((await fileRow(orphan.id)).productView, '00')
    delete process.env.PRODUCT_MATCHING_REGEX
    await db.getRepository(AssetFile).update(orphan.id, { productId: linked.id })
    await assignProductsToAssetFiles()
    assert.equal((await fileRow(orphan.id)).productId, linked.id)
})
