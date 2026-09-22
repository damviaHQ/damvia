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
