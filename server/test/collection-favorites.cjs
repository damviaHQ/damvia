const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, caller, makeUser, makeCollection, makeFolder, makeFile, save, forbidden } = harness
const { Collection, CollectionFile, User } = harness.entities
const { UserCollectionFavorite } = require('../dist/entity/user-collection-favorite')
let member, guest, admin
before(async () => ({ member, guest, admin } = await harness.setup()))
after(() => harness.teardown())

test('collection favorites are persistent, idempotent, ordered and personal', async () => {
  const user = await makeUser()
  const other = await makeUser()
  const alpha = await makeCollection({ name: 'Alpha' })
  const zulu = await makeCollection({ name: 'Zulu', public: false, owner: user })
  await Promise.all([1, 2, 3].map(() => caller(user).favorite.addCollection({ collectionId: alpha.id })))
  await caller(user).favorite.addCollection({ collectionId: zulu.id })
  await caller(other).favorite.addCollection({ collectionId: alpha.id })
  assert.equal(await db.getRepository(UserCollectionFavorite).countBy({ userId: user.id, collectionId: alpha.id }), 1)
  const result = await caller(user).favorite.listCollections()
  assert.deepEqual(result.map(c => c.id), [alpha.id, zulu.id])
  assert.equal(result[0].canEdit, false)
  assert.equal(result[1].canEdit, true)
  await caller(other).favorite.removeCollection({ collectionId: alpha.id })
  assert.deepEqual((await caller(other).favorite.listCollections()).map(c => c.id), [])
  assert.deepEqual((await caller(user).favorite.listCollections()).map(c => c.id), [alpha.id, zulu.id])
  await caller(user).favorite.removeCollection({ collectionId: alpha.id })
  await caller(user).favorite.removeCollection({ collectionId: alpha.id })
  assert.deepEqual((await caller(user).favorite.listCollections()).map(c => c.id), [zulu.id])
})

test('favorite operations require membership and current collection access', async () => {
  const collection = await makeCollection()
  for (const user of [null, guest, { ...member, approved: false }, { ...member, emailVerified: false }]) {
    await forbidden(caller(user).favorite.listCollections())
    await forbidden(caller(user).favorite.addCollection({ collectionId: collection.id }))
    await forbidden(caller(user).favorite.removeCollection({ collectionId: collection.id }))
  }
  const privateCollection = await makeCollection({ public: false, owner: admin })
  await assert.rejects(caller(member).favorite.addCollection({ collectionId: privateCollection.id }), { code: 'NOT_FOUND' })
  await assert.rejects(caller(member).favorite.addCollection({ collectionId: randomUUID() }), { code: 'NOT_FOUND' })
  await assert.rejects(caller(member).favorite.addCollection({ collectionId: 'invalid' }), { code: 'BAD_REQUEST' })
  await caller(member).favorite.addCollection({ collectionId: collection.id })
  await db.getRepository(Collection).update(collection.id, { public: false, ownerId: admin.id })
  assert.equal((await caller(member).favorite.listCollections()).some(c => c.id === collection.id), false)
  await assert.rejects(caller(member).favorite.addCollection({ collectionId: collection.id }), { code: 'NOT_FOUND' })
  await caller(member).favorite.removeCollection({ collectionId: collection.id })
  assert.equal(await db.getRepository(UserCollectionFavorite).countBy({ userId: member.id, collectionId: collection.id }), 0)
})

test('deleting a collection or user removes associated collection favorites', async () => {
  const user = await makeUser()
  const a = await makeCollection()
  const b = await makeCollection()
  await caller(user).favorite.addCollection({ collectionId: a.id })
  await caller(user).favorite.addCollection({ collectionId: b.id })
  await db.getRepository(Collection).delete(a.id)
  assert.equal(await db.getRepository(UserCollectionFavorite).countBy({ collectionId: a.id }), 0)
  await db.getRepository(User).delete(user.id)
  assert.equal(await db.getRepository(UserCollectionFavorite).countBy({ userId: user.id }), 0)
})

test('collection favorite migration rolls back and upgrades without changing file favorites', async () => {
  const collection = await makeCollection()
  const folder = await makeFolder()
  const file = await makeFile(folder)
  const collectionFile = await save(CollectionFile, { collectionId: collection.id, assetFileId: file.id })
  await caller(member).favorite.add({ collectionFileId: collectionFile.id })
  // Asset sources sit above collection favorites, so both come off and go back
  // on; while they are off the entities no longer match the tables, so the
  // rolled-back state is checked in SQL.
  while ((await db.query("SELECT 1 FROM migrations WHERE name = 'CollectionFavorites1790035200000'")).length) await db.undoLastMigration()
  assert.equal((await db.query('SELECT count(*)::int AS n FROM user_favorites WHERE collection_file_id = $1', [collectionFile.id]))[0].n, 1)
  await db.runMigrations()
  assert((await caller(member).favorite.list()).some(f => f.id === collectionFile.id))
  await caller(member).favorite.addCollection({ collectionId: collection.id })
  assert((await caller(member).favorite.listCollections()).some(c => c.id === collection.id))
  await caller(member).favorite.remove({ collectionFileId: collectionFile.id })
  assert.equal((await caller(member).favorite.list()).some(f => f.id === collectionFile.id), false)
})
