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
// A collection holds products as well as files, by hand or through rules.
// See docs/administration/catalogue.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, caller, makeCollection, makeUser, forbidden } = harness
const { Collection, CollectionRecord } = harness.entities
const { addRecords, refreshDynamicCollection, refreshAllDynamicCollections } = harness.services.productCollections
let fixtures, admin

const recordId = async recordKey => (await db.query('SELECT id FROM records WHERE record_key = $1', [recordKey]))[0].id
const membersOf = async collectionId => (await db.getRepository(CollectionRecord).findBy({ collectionId }))
    .map(row => row.recordId).sort()
const numberOfRecords = async id => (await db.getRepository(Collection).findOneByOrFail({ id })).numberOfRecords
const refresh = async id => db.transaction(async em => refreshDynamicCollection(em, await em.getRepository(Collection).findOneByOrFail({ id })))

before(async () => {
    fixtures = await harness.setup()
    admin = caller(fixtures.admin)
    await admin.recordAttribute.create({ name: 'season', displayName: 'Season', valueType: 'text', facetable: false, viewable: true, searchable: false })
    for (const [key, season] of [['PC-1', 'Autumn'], ['PC-2', 'Autumn'], ['PC-3', 'Spring'], ['PC-4', 'Spring'], ['PC-5', 'Spring']]) {
        await admin.record.create({ recordKey: key, values: { season } })
    }
})
after(() => harness.teardown())

test('products are added and removed by hand, and the count climbs to the ancestors', async () => {
    const parent = await makeCollection({ name: 'Catalogue' })
    const child = await makeCollection({ name: 'Autumn', parent })
    const first = await recordId('PC-1')
    const second = await recordId('PC-2')
    await db.transaction(em => addRecords(em, child.id, [first, second]))
    assert.deepEqual(await membersOf(child.id), [first, second].sort())
    assert.equal(await numberOfRecords(child.id), 2)
    assert.equal(await numberOfRecords(parent.id), 2)

    // Adding the same product twice changes nothing.
    assert.equal(await db.transaction(em => addRecords(em, child.id, [first])), 0)
    assert.equal(await numberOfRecords(child.id), 2)

    assert.equal(await caller(fixtures.admin).collection.removeRecords({ id: child.id, recordIds: [first] }), 1)
    assert.deepEqual(await membersOf(child.id), [second])
    assert.equal(await numberOfRecords(parent.id), 1)
})

test('rules fill the membership, follow the catalogue and leave hand-picked products alone', async () => {
    const collection = await makeCollection({ name: 'Season' })
    const hand = await recordId('PC-3')
    await db.transaction(em => addRecords(em, collection.id, [hand]))
    await admin.collection.setRecordRules({
        id: collection.id,
        catalogueMode: 'products',
        recordFilters: [{ column: 'season', op: 'is', value: 'Autumn' }],
    })
    const autumn = [await recordId('PC-1'), await recordId('PC-2')].sort()
    assert.deepEqual(await membersOf(collection.id), [...autumn, hand].sort())

    // A product that leaves the season leaves the collection at the next pass,
    // while the hand-picked one stays whatever the rules say.
    await db.query(`UPDATE records SET meta_data = meta_data || 'season=>Spring'::hstore WHERE record_key = 'PC-2'`)
    const result = await refresh(collection.id)
    assert.equal(result.removed, 1)
    const remaining = await recordId('PC-1')
    assert.deepEqual(await membersOf(collection.id), [remaining, hand].sort())
    assert.equal(await numberOfRecords(collection.id), 2)

    // The pass over every dynamic collection reaches it too.
    await db.query(`UPDATE records SET meta_data = meta_data || 'season=>Autumn'::hstore WHERE record_key = 'PC-2'`)
    const pass = await db.transaction(em => refreshAllDynamicCollections(em))
    assert.ok(pass.collections >= 1)
    assert.deepEqual(await membersOf(collection.id), [...autumn, hand].sort())
})

test('rules pointing at a field that no longer exists skip that collection instead of failing the pass', async () => {
    const broken = await makeCollection({ name: 'Broken rules' })
    await db.query(`UPDATE collections SET record_filters = $2 WHERE id = $1`, [broken.id, JSON.stringify([{ column: 'gone', op: 'is', value: 'x' }])])
    const pass = await db.transaction(em => refreshAllDynamicCollections(em))
    assert.ok(pass.collections >= 1)
    assert.deepEqual(await membersOf(broken.id), [])
})

test('a reader adds only the products they can already see, and only an admin opens a collection on the whole catalogue', async () => {
    const member = await makeUser()
    const hidden = await recordId('PC-4')
    const mine = await makeCollection({ name: 'My picks', public: false, ownerId: member.id })
    await forbidden(caller(member).collection.setRecordRules({ id: mine.id, includesAllRecords: true }))

    // Nothing holds PC-3 yet, so the member cannot pull it into their own
    // collection.
    await caller(member).collection.addItems({ id: mine.id, items: [{ id: hidden, type: 'record' }] })
    assert.deepEqual(await membersOf(mine.id), [])

    const shared = await makeCollection({ name: 'Shared products' })
    await db.transaction(em => addRecords(em, shared.id, [hidden]))
    await caller(member).collection.addItems({ id: mine.id, items: [{ id: hidden, type: 'record' }] })
    assert.deepEqual(await membersOf(mine.id), [hidden])
    const saved = await caller(member).collection.findById(mine.id)
    assert.equal(saved.numberOfRecords, 1)
    assert.equal(saved.catalogueMode, 'products')
})

test('a draft collection keeps its products out of reach of a reader', async () => {
    const member = await makeUser()
    const draft = await makeCollection({ name: 'Next season', draft: true })
    const product = await recordId('PC-5')
    await db.transaction(em => addRecords(em, draft.id, [product]))
    const mine = await makeCollection({ name: 'Nope', public: false, ownerId: member.id })
    await caller(member).collection.addItems({ id: mine.id, items: [{ id: product, type: 'record' }] })
    assert.deepEqual(await membersOf(mine.id), [])
})

test('a collection standing for the whole catalogue lets a reader pick any product', async () => {
    const member = await makeUser()
    const everything = await makeCollection({ name: 'All products' })
    await admin.collection.setRecordRules({ id: everything.id, includesAllRecords: true, catalogueMode: 'products' })
    const mine = await makeCollection({ name: 'From everything', public: false, ownerId: member.id })
    const any = await recordId('PC-1')
    await caller(member).collection.addItems({ id: mine.id, items: [{ id: any, type: 'record' }] })
    assert.deepEqual(await membersOf(mine.id), [any])
    // The whole catalogue stays open only while that collection exists.
    await admin.collection.remove(everything.id)
})

test('copying a collection freezes its products and never copies its rules', async () => {
    const source = await makeCollection({ name: 'Autumn selection' })
    await admin.collection.setRecordRules({
        id: source.id,
        catalogueMode: 'products',
        recordFilters: [{ column: 'season', op: 'is', value: 'Autumn' }],
        includesAllRecords: true,
    })
    const target = await makeCollection({ name: 'My assortment', public: false, ownerId: fixtures.member.id })
    await caller(fixtures.member).collection.addItems({ id: target.id, items: [{ id: source.id, type: 'collection' }] })
    const copy = await db.getRepository(Collection).findOneByOrFail({ parentId: target.id, name: 'Autumn selection' })
    assert.deepEqual(await membersOf(copy.id), await membersOf(source.id))
    assert.equal(copy.recordFilters, null)
    assert.equal(copy.includesAllRecords, false)
    assert.equal(copy.catalogueMode, 'products')
    const rows = await db.getRepository(CollectionRecord).findBy({ collectionId: copy.id })
    assert.ok(rows.every(row => row.source === 'manual'), 'a copy holds no rule row')
})

test('the product count follows a collection that moves', async () => {
    const source = await makeCollection({ name: 'Source' })
    const target = await makeCollection({ name: 'Target' })
    const child = await makeCollection({ name: 'Moving', parent: source })
    const product = await recordId('PC-1')
    await db.transaction(em => addRecords(em, child.id, [product]))
    assert.equal(await numberOfRecords(source.id), 1)
    await admin.collection.move({ id: child.id, parentId: target.id })
    assert.equal(await numberOfRecords(source.id), 0)
    assert.equal(await numberOfRecords(target.id), 1)
})

test('a bulk membership write keeps the counts right, and deleting a child collection recounts its ancestors', async () => {
    const parent = await makeCollection({ name: 'Bulk parent' })
    const child = await makeCollection({ name: 'Bulk child', parent })
    const ids = (await db.query(`SELECT id FROM records ORDER BY record_key LIMIT 3`)).map(row => row.id)
    // The count is kept once per statement, over the rows the statement wrote.
    await db.transaction(em => addRecords(em, child.id, ids))
    assert.equal(await numberOfRecords(child.id), 3)
    assert.equal(await numberOfRecords(parent.id), 3)
    await caller(fixtures.admin).collection.removeRecords({ id: child.id, recordIds: ids.slice(0, 2) })
    assert.equal(await numberOfRecords(parent.id), 1)
    // The rows die with the collection, too late for the trigger to adjust the
    // ancestors, so they are recounted.
    await admin.collection.remove(child.id)
    assert.equal(await numberOfRecords(parent.id), 0)
})

test('deleting a collection takes its membership with it', async () => {
    const collection = await makeCollection({ name: 'Temporary' })
    const product = await recordId('PC-1')
    await db.transaction(em => addRecords(em, collection.id, [product]))
    await admin.collection.remove(collection.id)
    assert.equal(await db.getRepository(CollectionRecord).countBy({ collectionId: collection.id }), 0)
})

test('a collection is created as a catalogue, by an administrator and by a reader', async () => {
    const created = await admin.collection.create({ name: 'Born a catalogue', public: true, catalogueMode: 'products' })
    assert.equal(created.catalogueMode, 'products')
    assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: created.id })).catalogueMode, 'products')

    // A collection created without saying anything still holds files only.
    const plain = await admin.collection.create({ name: 'Born a folder', public: true })
    assert.equal(plain.catalogueMode, 'files')

    // A reader builds an assortment of their own, and the mode is the only
    // catalogue setting they may choose: the rules stay with the administrator.
    const assortment = await caller(fixtures.member).collection.createUserCollection({ name: 'My assortment', catalogueMode: 'products' })
    assert.equal(assortment.catalogueMode, 'products')
    const stored = await db.getRepository(Collection).findOneByOrFail({ id: assortment.id })
    assert.equal(stored.includesAllRecords, false)
    assert.equal(stored.recordFilters, null)
    assert.equal(stored.public, false)
})

test('a reference list fills a collection, matched on the key and reporting what missed', async () => {
    const collection = await makeCollection({ name: 'Winter sheet' })
    // Case and stray spaces are what a spreadsheet column actually contains.
    const result = await admin.collection.addRecordsByKey({ id: collection.id, keys: [' pc-1 ', 'PC-2', 'PC-404'] })
    assert.equal(result.matched, 2)
    assert.equal(result.added, 2)
    assert.deepEqual(result.unmatched, ['pc-404'])
    assert.deepEqual(await membersOf(collection.id), [await recordId('PC-1'), await recordId('PC-2')].sort())
    // The collection starts holding products the moment it holds one.
    assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: collection.id })).catalogueMode, 'products')

    // Adding the same references again changes nothing.
    const again = await admin.collection.addRecordsByKey({ id: collection.id, keys: ['PC-1'] })
    assert.equal(again.matched, 1)
    assert.equal(again.added, 0)
    assert.equal(await numberOfRecords(collection.id), 2)
})

test('an administrator builds the first catalogue, a reader only pins what they already see', async () => {
    // Nothing is in any collection yet for this key, so the visibility loop
    // would leave an administrator unable to start a catalogue at all.
    const fresh = await admin.record.create({ recordKey: 'PC-FRESH', values: { season: 'Unlisted' } })
    const adminCollection = await makeCollection({ name: 'Bootstrap', draft: true })
    assert.equal((await admin.collection.addRecordsByKey({ id: adminCollection.id, keys: ['PC-FRESH'] })).added, 1)

    const own = await caller(fixtures.member).collection.createUserCollection({ name: 'Reader sheet', catalogueMode: 'products' })
    // Another test of this file left a collection standing for the whole
    // catalogue, which would hand this product to everybody.
    const openToAll = await db.getRepository(Collection).findBy({ includesAllRecords: true })
    await db.getRepository(Collection).update(openToAll.map(row => row.id), { includesAllRecords: false })
    const blocked = await caller(fixtures.member).collection.addRecordsByKey({ id: own.id, keys: ['PC-FRESH'] })
    assert.equal(blocked.matched, 0)
    assert.deepEqual(blocked.unmatched, ['pc-fresh'])
    assert.deepEqual(await membersOf(own.id), [])

    // Once it is published to them, the very same list works.
    const published = await makeCollection({ name: 'Published' })
    await admin.collection.addRecordsByKey({ id: published.id, keys: ['PC-FRESH'] })
    assert.equal((await caller(fixtures.member).collection.addRecordsByKey({ id: own.id, keys: ['PC-FRESH'] })).added, 1)
    assert.deepEqual(await membersOf(own.id), [fresh.id])

    // A collection a reader cannot open is not there to be filled either.
    await assert.rejects(
        caller(fixtures.member).collection.addRecordsByKey({ id: adminCollection.id, keys: ['PC-1'] }),
        error => error.code === 'NOT_FOUND',
    )
    await db.getRepository(Collection).update(openToAll.map(row => row.id), { includesAllRecords: true })
})
