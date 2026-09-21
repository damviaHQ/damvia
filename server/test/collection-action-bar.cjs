const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { db, caller, makeUser, makeCollection, save, forbidden } = harness
const { Collection, Group, UserGroup } = harness.entities
let member, admin
before(async () => ({ member, admin } = await harness.setup()))
after(() => harness.teardown())

const rule = (mode, audience = {}) => ({ mode, roles: [], groupIds: [], userIds: [], ...audience })
const visible = async (user, collection) => (await caller(user).collection.findById(collection.id)).visibleActions
const update = (user, collection, extra) => caller(user).collection.update({ id: collection.id, name: collection.name, ...extra })

test('each mode shows an action to the right roles, groups and users', async () => {
  const group = await save(Group, { name: 'Action bar readers' })
  const grouped = await makeUser('member')
  await save(UserGroup, { userId: grouped.id, groupId: group.id })
  const named = await makeUser('member')
  const manager = await makeUser('manager')
  const collection = await makeCollection()
  await update(admin, collection, {
    actionBar: {
      filter: rule('only', { roles: ['manager'], groupIds: [group.id], userIds: [named.id] }),
      search: rule('except', { roles: ['manager'], groupIds: [group.id] }),
      display: rule('nobody'),
      share: rule('everyone'),
    },
  })
  assert.deepEqual(await visible(member, collection), { filter: false, search: true, display: false, share: true })
  assert.deepEqual(await visible(grouped, collection), { filter: true, search: false, display: false, share: true })
  assert.deepEqual(await visible(named, collection), { filter: true, search: true, display: false, share: true })
  assert.deepEqual(await visible(manager, collection), { filter: true, search: false, display: false, share: true })
})

test('admins and owners always see every action, and only they get the rules', async () => {
  const owner = await makeUser('member')
  const collection = await makeCollection({ public: false, owner })
  await update(owner, collection, { actionBar: { filter: rule('nobody'), search: rule('nobody'), display: rule('nobody') } })
  const own = await caller(owner).collection.findById(collection.id)
  assert.deepEqual(own.visibleActions, { filter: true, search: true, display: true, share: true })
  assert.equal(own.actionBar.own.filter.mode, 'nobody')
  const shared = await makeCollection()
  await update(admin, shared, { actionBar: { filter: rule('only', { userIds: [member.id] }) } })
  assert.equal((await visible(admin, shared)).filter, true)
  const read = await caller(member).collection.findById(shared.id)
  assert.equal(read.visibleActions.filter, true)
  assert.equal(read.actionBar, null)
  assert.equal(JSON.stringify(read).includes(member.id), false)
})

test('sub-collections follow their nearest configured ancestor until they have their own', async () => {
  const root = await makeCollection({ name: 'Root' })
  const middle = await makeCollection({ parent: root })
  const leaf = await makeCollection({ parent: middle })
  const other = await makeCollection({ name: 'Other' })
  await update(admin, root, { actionBar: { filter: rule('nobody') } })
  assert.equal((await visible(member, leaf)).filter, false)
  const inherited = await caller(admin).collection.findById(leaf.id)
  assert.deepEqual(inherited.actionBar.inheritedFrom, { id: root.id, name: 'Root' })
  assert.equal(inherited.actionBar.own, null)

  await update(admin, middle, { actionBar: { filter: rule('everyone') } })
  assert.equal((await visible(member, leaf)).filter, true)
  assert.equal((await caller(admin).collection.findById(root.id)).actionBar.descendantOverrides, 1)
  // A collection with its own setting still tells what it would follow.
  const custom = (await caller(admin).collection.findById(middle.id)).actionBar
  assert.equal(custom.own.filter.mode, 'everyone')
  assert.equal(custom.inherited.filter.mode, 'nobody')
  assert.deepEqual(custom.inheritedFrom, { id: root.id, name: 'Root' })

  await update(admin, other, { actionBar: { search: rule('nobody') } })
  await caller(admin).collection.move({ id: middle.id, parentId: other.id })
  assert.deepEqual(await visible(member, leaf), { filter: true, search: true, display: true, share: true })
  await update(admin, middle, { actionBar: null })
  assert.deepEqual(await visible(member, leaf), { filter: true, search: false, display: true, share: true })
})

test('saving can make every sub-collection follow the collection again', async () => {
  const root = await makeCollection()
  const child = await makeCollection({ parent: root })
  const grandchild = await makeCollection({ parent: child })
  await update(admin, child, { actionBar: { display: rule('everyone') } })
  await update(admin, grandchild, { actionBar: { display: rule('everyone') } })
  await update(admin, root, { actionBar: { display: rule('nobody') }, resetDescendantActionBars: true })
  const rows = await db.getRepository(Collection).findBy([{ id: child.id }, { id: grandchild.id }])
  assert.deepEqual(rows.map(row => row.actionBar), [null, null])
  assert.equal((await visible(member, grandchild)).display, false)
  // Leaving the settings out of an update keeps them.
  await update(admin, root, { description: 'Kept' })
  assert.equal((await db.getRepository(Collection).findOneBy({ id: root.id })).actionBar.display.mode, 'nobody')
})

test('only editors change the settings or list the audience, and bad shapes are refused', async () => {
  const collection = await makeCollection()
  await forbidden(update(member, collection, { actionBar: { filter: rule('nobody') } }))
  await forbidden(caller(member).collection.actionBarAudience(collection.id))
  const audience = await caller(admin).collection.actionBarAudience(collection.id)
  assert(audience.users.some(user => user.id === member.id))
  assert(audience.groups.length > 0)
  assert.deepEqual(Object.keys(audience.users[0]).sort(), ['email', 'id', 'name'])
  await assert.rejects(update(admin, collection, { actionBar: { filter: { mode: 'sometimes', roles: [], groupIds: [], userIds: [] } } }), { code: 'BAD_REQUEST' })
  await assert.rejects(update(admin, collection, { actionBar: { download: rule('nobody') } }), { code: 'BAD_REQUEST' })
  await assert.rejects(update(admin, collection, { actionBar: { filter: rule('only', { roles: ['owner'] }) } }), { code: 'BAD_REQUEST' })
})
