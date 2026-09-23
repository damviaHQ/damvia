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
const h = require('./lib/helpers.cjs')
const { db, save, caller, makeCollection, makeFolder, makeFile } = h
const { DataRecord, RecordAttribute, CollectionFile } = h.entities
const { AssetEntityLink } = require('../dist/entity/asset-entity-link')
const { EnrichmentSettings } = require('../dist/entity/enrichment-settings')
let users, collection, record, empty, hidden, front, side, field, secret
before(async () => {
  users = await h.setup()
  collection = await makeCollection({ name: 'Products', catalogueMode: 'products' })
  record = await save(DataRecord, { recordKey: '00123', keyColumnName: 'SKU', metaData: { name: 'Été, "studio"', secret: 'never export' } })
  empty = await save(DataRecord, { recordKey: '00124', keyColumnName: 'SKU', metaData: { name: '=1+1' } })
  hidden = await save(DataRecord, { recordKey: 'PRIVATE', keyColumnName: 'SKU' })
  field = await save(RecordAttribute, { name: 'name', displayName: 'Name', viewable: true })
  secret = await save(RecordAttribute, { name: 'secret', viewable: false })
  await h.services.productCollections.addRecords(db.manager, collection.id, [record.id, empty.id])
  const folder = await makeFolder()
  const media = await makeCollection({ name: 'Media', assetFolderId: folder.id })
  const first = await makeFile(folder, { name: 'front.jpg', recordId: record.id, recordView: '00' })
  front = await save(CollectionFile, { collectionId: media.id, assetFileId: first.id })
  const second = await makeFile(folder, { name: 'side.jpg', recordView: '01' })
  await save(AssetEntityLink, { assetFileId: second.id, recordId: record.id, recordKey: record.recordKey, targetKind: 'record', strategy: 'manual_file' })
  side = await save(CollectionFile, { collectionId: media.id, assetFileId: second.id })
  await save(CollectionFile, { collectionId: collection.id, assetFileId: first.id })
  const privateMedia = await makeCollection({ public: false, ownerId: users.admin.id })
  await save(CollectionFile, { collectionId: privateMedia.id, assetFileId: (await makeFile(folder, { recordId: record.id })).id })
  await db.getRepository(EnrichmentSettings).update(1, { viewsEnabled: true })
})
after(() => h.teardown())

test('selected records resolve legacy and active links, deduplicate assets, and publish pictures through records', async () => {
  const result = await caller(users.member).collection.getFiles({ items: [{ type: 'record', id: record.id }, { type: 'record', id: hidden.id }] })
  assert.equal(result.recordCount, 1)
  assert.equal(result.files.length, 3)
  assert.deepEqual(result.files.map(file => file.recordView).filter(Boolean).sort(), ['00', '01'])
  assert.equal(result.viewsEnabled, true)
  assert.deepEqual(result.columns.map(column => column.label), ['SKU', 'Name'])
  assert.deepEqual(result.previewRows, [['00123', 'Été, "studio"']])
})

test('collection exports include records with no media and honor selected columns and formula protection', async () => {
  const result = await caller(users.member).download.exportRecords({ items: [{ type: 'collection', id: collection.id }], columns: [field.id, 'recordKey'], format: 'csv' })
  const csv = Buffer.from(result.content, 'base64').toString('utf8')
  assert.equal(csv, '\uFEFF"Name","SKU"\r\n"Été, ""studio""","00123"\r\n"\'=1+1","00124"')
  assert.equal(csv.includes('never export'), false)
})

test('exports recheck access and reject hidden columns and empty selections', async () => {
  await assert.rejects(caller(users.member).download.exportRecords({ items: [{ type: 'record', id: record.id }], columns: [secret.id], format: 'csv' }), error => error.code === 'BAD_REQUEST')
  await assert.rejects(caller(users.member).download.exportRecords({ items: [{ type: 'record', id: hidden.id }], columns: ['recordKey'], format: 'xlsx' }), error => error.code === 'BAD_REQUEST')
  await db.getRepository(h.entities.Collection).update(collection.id, { public: false, ownerId: users.admin.id })
  const result = await caller(users.member).collection.getFiles({ items: [{ type: 'collection', id: collection.id }] })
  assert.equal(result.recordCount, 0)
  assert.equal(result.files.length, 0)
  await db.getRepository(h.entities.Collection).update(collection.id, { public: true })
})

test('nested, excluded and whole-catalogue memberships determine the exported rows', async () => {
  const parent = await makeCollection({ name: 'Parent' })
  const child = await makeCollection({ name: 'Child', parent })
  await h.services.productCollections.addRecords(db.manager, child.id, [record.id, empty.id])
  await h.services.productCollections.setRecordsExcluded(db.manager, child.id, [empty.id], true)
  const nested = await caller(users.member).collection.getFiles({ items: [{ type: 'collection', id: parent.id }] })
  assert.equal(nested.recordCount, 1)
  const all = await makeCollection({ name: 'All', includesAllRecords: true })
  const everything = await caller(users.member).collection.getFiles({ items: [{ type: 'collection', id: all.id }] })
  assert.equal(everything.recordCount, 3)
})
