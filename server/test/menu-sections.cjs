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
// Sidebar headings are menu items of their own, so an administrator can group
// the menu under "Library", "Catalogue" and anything else.
// See docs/administration/menu-and-pages.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, fixtures, caller, makeCollection, forbidden } = harness
const { MenuItem } = require('../dist/entity/menu-item')
const { defaultMenuSection, syncCollectionMenuItems } = harness.services.collections

before(() => harness.setup())
after(() => harness.teardown())

const sections = () => db.getRepository(MenuItem).findBy({ type: 'section' })
const itemsOf = collectionId => db.getRepository(MenuItem).findBy({ collectionId })
const addToMenu = collection => db.transaction(em => syncCollectionMenuItems(em, collection))

async function assertPathsConsistent() {
    const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM menu_items f LEFT JOIN menu_items p ON p.id = f.parent_id WHERE f.mpath IS DISTINCT FROM coalesce(p.mpath, '') || f.id::text || '.'`)
    assert.equal(count, 0, 'menu_items paths')
}

test('the migration leaves one default Library section at the root', async () => {
    const found = await sections()
    assert.equal(found.length, 1)
    assert.equal(found[0].parentId, null)
    assert.equal(found[0].data.label, 'Library')
    assert.equal(found[0].data.defaultForCollections, true)
    assert.equal((await defaultMenuSection(db.manager)).id, found[0].id)
    await assertPathsConsistent()
})

test('a public root collection lands under the default section instead of the root', async () => {
    const collection = await makeCollection({ name: 'Brand' })
    await addToMenu(collection)
    const [item] = await itemsOf(collection.id)
    const section = await defaultMenuSection(db.manager)
    assert.equal(item.parentId, section.id)
    assert.equal(item.path, `${section.id}.${item.id}.`)
    // Running the synchronization again does not add a second entry.
    await addToMenu(collection)
    assert.equal((await itemsOf(collection.id)).length, 1)
    await assertPathsConsistent()
})

test('a section is created at the root only, and only by an administrator', async () => {
    const section = await defaultMenuSection(db.manager)
    await assert.rejects(
        caller(fixtures.admin).menuItem.create({ type: 'section', parentId: section.id, data: { label: 'Nested' } }),
        error => error.code === 'BAD_REQUEST',
    )
    await forbidden(caller(fixtures.member).menuItem.create({ type: 'section', data: { label: 'Catalogue' } }))
    const created = await caller(fixtures.admin).menuItem.create({ type: 'section', data: { label: 'Catalogue' } })
    assert.equal(created.parentId, null)
    assert.equal(created.data.label, 'Catalogue')
    await assertPathsConsistent()
})

test('a section holding entries is not removed by accident', async () => {
    const section = await caller(fixtures.admin).menuItem.create({ type: 'section', data: { label: 'Busy' } })
    const collection = await makeCollection({ name: 'Inside' })
    const child = await caller(fixtures.admin).menuItem.create({ type: 'collection', parentId: section.id, collectionId: collection.id, data: {} })
    // Everything under an item goes with it, and a section holds the menu.
    await assert.rejects(
        caller(fixtures.admin).menuItem.remove({ id: section.id }),
        error => error.code === 'BAD_REQUEST',
    )
    assert.equal(await db.getRepository(MenuItem).countBy({ id: child.id }), 1)
    await caller(fixtures.admin).menuItem.remove({ id: child.id })
    await caller(fixtures.admin).menuItem.remove({ id: section.id })
    assert.equal(await db.getRepository(MenuItem).countBy({ id: section.id }), 0)
})

test('an empty section is kept for an administrator and hidden from a reader', async () => {
    const empty = await caller(fixtures.admin).menuItem.create({ type: 'section', data: { label: 'Empty' } })
    const adminTree = await caller(fixtures.admin).menuItem.list()
    assert.ok(adminTree.some(item => item.id === empty.id), 'the administrator keeps the empty section')
    const memberTree = await caller(fixtures.member).menuItem.list()
    assert.equal(memberTree.some(item => item.id === empty.id), false)
})

test('a section disappears for a reader who cannot see any of its collections', async () => {
    const hidden = await makeCollection({ name: 'Draft only', draft: true })
    const section = await caller(fixtures.admin).menuItem.create({ type: 'section', data: { label: 'Private' } })
    await caller(fixtures.admin).menuItem.create({ type: 'collection', parentId: section.id, collectionId: hidden.id, data: {} })
    const memberTree = await caller(fixtures.member).menuItem.list()
    assert.equal(memberTree.some(item => item.id === section.id), false)

    const visible = await makeCollection({ name: 'Shared' })
    await caller(fixtures.admin).menuItem.create({ type: 'collection', parentId: section.id, collectionId: visible.id, data: {} })
    const withVisibleChild = await caller(fixtures.member).menuItem.list()
    const readerSection = withVisibleChild.find(item => item.id === section.id)
    assert.ok(readerSection, 'the section comes back once one of its collections is visible')
    assert.equal(readerSection.children.length, 1)
    assert.equal(readerSection.children[0].collectionId, visible.id)
    await assertPathsConsistent()
})

test('a top-level product link moves out of a synced menu branch with its children and keeps its collection unchanged', async () => {
    const parent = await makeCollection({ name: 'Assets parent' })
    const product = await makeCollection({ name: 'Independent products', catalogueMode: 'products' })
    const branch = await caller(fixtures.admin).menuItem.create({ type: 'collection', collectionId: parent.id, data: { sync: true } })
    const link = await caller(fixtures.admin).menuItem.create({ type: 'collection', parentId: branch.id, collectionId: product.id, data: { sync: true } })
    const child = await caller(fixtures.admin).menuItem.create({ type: 'text', parentId: link.id, data: { text: 'Details' } })
    await caller(fixtures.admin).menuItem.setHome({ id: link.id })
    await caller(fixtures.admin).menuItem.move({ id: link.id, parentId: null })
    const moved = await db.getRepository(MenuItem).findOneByOrFail({ id: link.id })
    assert.equal(moved.parentId, null)
    assert.equal(moved.home, true)
    assert.equal(moved.data.sync, true)
    assert.equal((await db.getRepository(MenuItem).findOneByOrFail({ id: child.id })).path, `${link.id}.${child.id}.`)
    const storedCollection = await db.getRepository(harness.entities.Collection).findOneByOrFail({ id: product.id })
    assert.equal(storedCollection.parentId, null)
    assert.equal(storedCollection.draft, false)
    await addToMenu(product)
    assert.equal((await itemsOf(product.id)).length, 1, 'sync must not recreate a link at the default location')
    await assertPathsConsistent()
})

test('manual links can move between sections and append after existing positions', async () => {
    const section = await caller(fixtures.admin).menuItem.create({ type: 'section', data: { label: 'Move target' } })
    const sibling = await caller(fixtures.admin).menuItem.create({ type: 'text', parentId: section.id, data: { text: 'Existing' } })
    await caller(fixtures.admin).menuItem.updatePositions({ itemsPosition: { [sibling.id]: 9 } })
    const link = await caller(fixtures.admin).menuItem.create({ type: 'text', data: { text: 'Moving' } })
    await caller(fixtures.admin).menuItem.move({ id: link.id, parentId: section.id })
    const moved = await db.getRepository(MenuItem).findOneByOrFail({ id: link.id })
    assert.equal(moved.parentId, section.id)
    assert.equal(moved.position, 10)
    await caller(fixtures.admin).menuItem.move({ id: link.id, parentId: section.id })
    await assertPathsConsistent()
})

test('generated children explain their placement and cannot detach from the collection hierarchy', async () => {
    const parent = await makeCollection({ name: 'Mirrored parent' })
    const child = await makeCollection({ name: 'Nested products', parent, catalogueMode: 'products' })
    const branch = await caller(fixtures.admin).menuItem.create({ type: 'collection', collectionId: parent.id, data: { sync: true } })
    const [link] = await itemsOf(child.id)
    const tree = await caller(fixtures.admin).menuItem.list()
    assert.equal(tree.find(item => item.id === branch.id).children[0].followsCollectionParent, true)
    await assert.rejects(caller(fixtures.admin).menuItem.move({ id: link.id, parentId: null }), error => error.code === 'BAD_REQUEST' && /Collection settings/.test(error.message))
    const separate = await caller(fixtures.admin).menuItem.create({ type: 'collection', collectionId: child.id, data: {} })
    const section = await defaultMenuSection(db.manager)
    await caller(fixtures.admin).menuItem.move({ id: separate.id, parentId: section.id })
    await assertPathsConsistent()
})

test('menu moves require admin rights and reject cycles, missing targets and nested sections', async () => {
    const collection = await makeCollection({ name: 'Cycle guard' })
    const link = await caller(fixtures.admin).menuItem.create({ type: 'collection', collectionId: collection.id, data: {} })
    const descendant = await caller(fixtures.admin).menuItem.create({ type: 'collection', parentId: link.id, collectionId: collection.id, data: {} })
    const section = await defaultMenuSection(db.manager)
    await forbidden(caller(fixtures.member).menuItem.move({ id: link.id, parentId: section.id }))
    for (const parentId of [link.id, descendant.id]) {
        await assert.rejects(caller(fixtures.admin).menuItem.move({ id: link.id, parentId }), error => error.code === 'BAD_REQUEST')
    }
    await assert.rejects(caller(fixtures.admin).menuItem.move({ id: section.id, parentId: link.id }), error => error.code === 'BAD_REQUEST')
    await assert.rejects(caller(fixtures.admin).menuItem.move({ id: link.id, parentId: require('node:crypto').randomUUID() }), error => error.code === 'NOT_FOUND')
    const text = await caller(fixtures.admin).menuItem.create({ type: 'text', data: { text: 'No children' } })
    await assert.rejects(caller(fixtures.admin).menuItem.move({ id: link.id, parentId: text.id }), error => error.code === 'BAD_REQUEST')
    await assertPathsConsistent()
})
