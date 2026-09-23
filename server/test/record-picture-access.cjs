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
const { IsNull } = require('typeorm')
const h = require('./lib/helpers.cjs')
const { db, caller, save, makeCollection, makeFolder, makeFile } = h
const { DataRecord, Collection, CollectionFile, CollectionInvitation, License, Group, UserGroup, Region } = h.entities
const { addRecords, setRecordsExcluded, removeRecords } = h.services.productCollections
const { userCollectionFilesQuery } = h.services.collections
const { createDownloadArchive } = h.services.download
const { AssetEntityLink } = require('../dist/entity/asset-entity-link')
let users
before(async () => { users = await h.setup() })
after(() => h.teardown())

async function fixture(extra = {}) {
  const record = await save(DataRecord, { keyColumnName: 'SKU', recordKey: require('node:crypto').randomUUID() })
  const collection = await makeCollection({ catalogueMode: 'products', ...extra })
  await addRecords(db.manager, collection.id, [record.id])
  const folder = await makeFolder()
  const file = await makeFile(folder, { recordId: record.id, hasThumbnail: true })
  const identity = await db.getRepository(CollectionFile).findOneByOrFail({ assetFileId: file.id, collectionId: IsNull() })
  return { record, collection, folder, file, identity }
}
const canRead = (user, id) => userCollectionFilesQuery(user).andWhere('collection_file.id = :pictureId', { pictureId: id }).getExists()
const options = { downloadType: 'email', imageFormat: 'original', imageResolution: 'high', videoFormat: 'original', videoResolution: 'high' }

test('a record collection publishes pictures without file collections, including previews, favourites and downloads', async () => {
  const { record, collection, identity } = await fixture()
  const reader = caller(users.member)
  assert.equal(await canRead(users.member, identity.id), true)
  assert.equal(await canRead(users.guest, identity.id), false)
  const page = await reader.catalogue.get(record.id)
  assert.equal(page.fileCount, 1)
  assert.deepEqual(page.collectionFiles.map(row => row.id), [identity.id])
  assert.ok(page.collectionFiles[0].fileURL)
  await reader.favorite.add({ collectionFileId: identity.id })
  assert.ok((await reader.favorite.list()).some(row => row.id === identity.id))
  const selection = await reader.collection.getFiles({ items: [{ id: collection.id, type: 'collection' }] })
  assert.deepEqual(selection.files.map(row => row.id), [identity.id])
  const download = await reader.download.create({ ...options, collectionFileIds: [identity.id] })
  await createDownloadArchive({ em: db.manager, download: await db.getRepository(h.entities.Download).findOneByOrFail({ id: download.id }) })
  assert.equal((await db.getRepository(h.entities.Download).findOneByOrFail({ id: download.id })).status, 'ready')
  assert.equal((await db.getRepository(Collection).findOneByOrFail({ id: collection.id })).numberOfFiles, 0, 'pictures are not copied into the list as standalone files')
})

test('active explicit links work with views disabled and without a legacy record column', async () => {
  const { record, folder } = await fixture()
  const file = await makeFile(folder, { recordId: null })
  const link = await save(AssetEntityLink, { assetFileId: file.id, recordId: record.id, recordKey: record.recordKey, targetKind: 'record', strategy: 'manual_file', status: 'active' })
  const identity = await db.getRepository(CollectionFile).findOneByOrFail({ assetFileId: file.id, collectionId: IsNull() })
  assert.equal(await canRead(users.member, identity.id), true)
  await db.getRepository(AssetEntityLink).update(link.id, { status: 'dangling' })
  assert.equal(await canRead(users.member, identity.id), false)
  await db.getRepository(AssetEntityLink).delete(link.id)
  assert.equal(await canRead(users.member, identity.id), false)
})

test('exclusions revoke picture access and queued downloads immediately; another list can grant access', async () => {
  const { record, collection, identity } = await fixture()
  const reader = caller(users.member)
  await reader.favorite.add({ collectionFileId: identity.id })
  const result = await reader.download.create({ ...options, collectionFileIds: [identity.id] })
  const download = await db.getRepository(h.entities.Download).findOneByOrFail({ id: result.id })
  await setRecordsExcluded(db.manager, collection.id, [record.id], true)
  assert.equal(await canRead(users.member, identity.id), false)
  assert.equal((await reader.favorite.list()).some(row => row.id === identity.id), false)
  await assert.rejects(createDownloadArchive({ em: db.manager, download }), /no longer available/)
  const other = await makeCollection({ catalogueMode: 'products' })
  await addRecords(db.manager, other.id, [record.id])
  assert.equal(await canRead(users.member, identity.id), true)
  await removeRecords(db.manager, other.id, [record.id])
  assert.equal(await canRead(users.member, identity.id), false)
  await setRecordsExcluded(db.manager, collection.id, [record.id], false)
  assert.equal(await canRead(users.member, identity.id), true)
  await db.getRepository(Collection).delete(collection.id)
  assert.equal(await canRead(users.member, identity.id), false)
})

test('drafts, groups and invitations apply to the pictures of a record', async () => {
  const group = await save(Group, { name: 'Picture readers' })
  const { collection, identity } = await fixture({ draft: true, limitedToGroupIds: [group.id] })
  const member = await h.makeUser()
  assert.equal(await canRead(member, identity.id), false)
  await save(UserGroup, { userId: member.id, groupId: group.id })
  assert.equal(await canRead(member, identity.id), false)
  await db.getRepository(Collection).update(collection.id, { draft: false })
  assert.equal(await canRead(member, identity.id), true)
  assert.equal(await canRead(users.member, identity.id), false)
  const invitation = await save(CollectionInvitation, { collectionId: collection.id, userId: users.guest.id, email: users.guest.email, expiresAt: new Date(Date.now() + 86400000) })
  assert.equal(await canRead(users.guest, identity.id), true)
  await db.getRepository(CollectionInvitation).update(invitation.id, { expiresAt: new Date(Date.now() - 86400000) })
  assert.equal(await canRead(users.guest, identity.id), false)
})

test('region and date restrictions still apply, even when a separate file collection is private', async () => {
  const { collection, file, identity } = await fixture()
  const privateFiles = await makeCollection({ public: false, ownerId: users.admin.id })
  await save(CollectionFile, { collectionId: privateFiles.id, assetFileId: file.id })
  assert.equal(await canRead(users.member, identity.id), true, 'the record list is an independent publication route')
  const region = await save(Region, { name: 'Elsewhere', defaultGroupId: users.group.id })
  const licence = await save(License, { name: 'Picture licence', allowedRegionIds: [region.id], scopes: [] })
  await db.getRepository(h.entities.AssetFile).update(file.id, { licenseId: licence.id })
  assert.equal(await canRead(users.member, identity.id), false)
  assert.equal(await canRead(users.admin, identity.id), true)
  await db.getRepository(License).update(licence.id, { allowedRegionIds: [users.region.id], usageFrom: '2999-01-01' })
  assert.equal(await canRead(users.member, identity.id), false)
  await db.getRepository(License).update(licence.id, { usageFrom: null, usageTo: '2000-01-01' })
  assert.equal(await canRead(users.member, identity.id), false)
  await db.getRepository(License).update(licence.id, { usageTo: null })
  assert.equal(await canRead(users.member, identity.id), true)
  await db.getRepository(Collection).update(collection.id, { draft: true })
  assert.equal(await canRead(users.member, identity.id), false)
})

test('whole-catalogue lists include new pictures; unmatched images and documents are not published', async () => {
  const record = await save(DataRecord, { keyColumnName: 'SKU', recordKey: 'PICTURE-WHOLE-CATALOGUE' })
  const folder = await makeFolder()
  const file = await makeFile(folder, { recordId: record.id })
  await makeFile(folder)
  await makeFile(folder, { recordId: record.id, mimeType: 'application/pdf' })
  const identity = await db.getRepository(CollectionFile).findOneByOrFail({ assetFileId: file.id, collectionId: IsNull() })
  assert.equal(await canRead(users.member, identity.id), false)
  const collection = await makeCollection({ includesAllRecords: true, catalogueMode: 'products' })
  const files = await userCollectionFilesQuery(users.member).andWhere('asset_file.folder_id = :folder', { folder: folder.id }).getMany()
  assert.deepEqual(files.map(row => row.assetFileId), [file.id])
  const late = await makeFile(folder, { recordId: record.id })
  const lateIdentity = await db.getRepository(CollectionFile).findOneByOrFail({ assetFileId: late.id, collectionId: IsNull() })
  assert.equal(await canRead(users.member, lateIdentity.id), true)
  await db.getRepository(Collection).update(collection.id, { includesAllRecords: false })
  assert.equal(await canRead(users.member, identity.id), false)
})

test('a separately published file remains accessible when record membership is removed', async () => {
  const { collection, record, file } = await fixture()
  const library = await makeCollection({})
  const direct = await save(CollectionFile, { collectionId: library.id, assetFileId: file.id })
  await removeRecords(db.manager, collection.id, [record.id])
  assert.equal(await canRead(users.member, direct.id), true)
})

test('multiple record-only pictures export together and deleting an asset cleans up its identity', async () => {
  const { record, folder, identity } = await fixture()
  const second = await makeFile(folder, { recordId: record.id })
  const secondIdentity = await db.getRepository(CollectionFile).findOneByOrFail({ assetFileId: second.id, collectionId: IsNull() })
  const result = await caller(users.member).download.create({ ...options, downloadType: 'direct', collectionFileIds: [identity.id, secondIdentity.id] })
  assert.equal(result.status, 'ready')
  assert.equal(result.fileCount, 2)
  await db.getRepository(h.entities.AssetFile).delete(second.id)
  assert.equal(await db.getRepository(CollectionFile).existsBy({ id: secondIdentity.id }), false)
})

test('migration round trip preserves existing collection files and backfills picture identities', async () => {
  const { file, identity } = await fixture()
  const library = await makeCollection({})
  const direct = await save(CollectionFile, { collectionId: library.id, assetFileId: file.id })
  await db.undoLastMigration()
  assert.equal((await db.query('SELECT id FROM collection_files WHERE id = $1', [identity.id])).length, 0)
  assert.equal((await db.query('SELECT id FROM collection_files WHERE id = $1', [direct.id])).length, 1)
  await db.runMigrations()
  const restored = await db.getRepository(CollectionFile).findOneByOrFail({ assetFileId: file.id, collectionId: IsNull() })
  assert.equal(await canRead(users.member, restored.id), true)
})
