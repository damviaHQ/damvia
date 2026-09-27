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
import { env } from './fixtures'

// Sample catalogue for the admin Records screen: no real Damvia API is called.
const picture = (fill: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${fill}"/></svg>`)
const fields = [
  { id: 'f-name', name: 'name', displayName: 'Name', valueType: 'text', options: [], position: 0, facetable: false, viewable: true, searchable: true },
  { id: 'f-colour', name: 'colour', displayName: 'Colour', valueType: 'single_select', options: ['Sand', 'Forest', 'Ink'], position: 1, facetable: true, viewable: true, searchable: false },
  { id: 'f-tags', name: 'tags', displayName: 'Tags', valueType: 'multi_select', options: ['Eco', 'New', 'Sale'], position: 2, facetable: true, viewable: true, searchable: false },
  { id: 'f-price', name: 'price', displayName: 'Price', valueType: 'number', options: [], position: 3, facetable: false, viewable: true, searchable: false },
  { id: 'f-launch', name: 'launch', displayName: 'Launch', valueType: 'date', options: [], position: 4, facetable: false, viewable: true, searchable: false },
  { id: 'f-story', name: 'story', displayName: 'Story', valueType: 'long_text', options: [], position: 5, facetable: false, viewable: true, searchable: true },
]
export const records = [
  { id: '00000000-0000-4000-8000-000000000001', recordKey: 'WX5678-100', keyColumnName: 'SKU', tableId: '00000000-0000-4000-8000-0000000000a1', metaData: { SKU: 'WX5678-100', name: 'Canvas tote', colour: 'Sand', tags: 'Eco|New', price: '49', launch: '2026-10-01', story: 'Cut from heavy organic canvas with reinforced handles, it carries a laptop, a day of groceries and a rolled towel without losing its shape.\nMade in Porto.' }, thumbnailURL: picture('#c29570'), fileCount: 4, filledCount: 5, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000002', recordKey: 'WX5678-200', keyColumnName: 'SKU', tableId: '00000000-0000-4000-8000-0000000000a1', metaData: { SKU: 'WX5678-200', name: 'Wool scarf', colour: 'Forest', tags: 'Sale', price: 'n/a' }, thumbnailURL: picture('#354d45'), fileCount: 1, filledCount: 4, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000003', recordKey: 'WX5678-300', keyColumnName: 'SKU', tableId: '00000000-0000-4000-8000-0000000000a1', metaData: { SKU: 'WX5678-300', name: 'Leather belt' }, thumbnailURL: null, fileCount: 0, filledCount: 1, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z' },
]
export const tables = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'Products', position: 0, recordCount: 3, fieldIds: fields.map(field => field.id) },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'Apparel', position: 1, recordCount: 0, fieldIds: ['f-name', 'f-colour'] },
]
const detail = {
  ...records[0],
  files: {
    direct: [
      { id: 'a1', name: 'WX5678-100.00.jpg', path: '/Dropbox/Packshots', strategy: 'filename_regex', status: 'active', isPrimary: true, sourcePath: null, pattern: '^(.{6}-\\d{3})', createdBy: null, createdAt: null, thumbnailURL: picture('#c29570') },
      { id: 'a2', name: 'WX5678-100.02.jpg', path: '/Dropbox/Packshots', strategy: 'filename_regex', status: 'active', isPrimary: false, sourcePath: null, pattern: '^(.{6}-\\d{3})', createdBy: null, createdAt: null, thumbnailURL: picture('#6c5d4d') },
    ],
    range: [{ id: 'a3', name: 'Autumn lookbook.pdf', path: '/Dropbox/Campaigns', attributeName: 'colour', attributeValue: 'Sand', strategy: 'folder_regex', thumbnailURL: null }],
  },
}
const history = { items: [
  { id: 'h2', action: 'update', source: 'grid', changes: { price: { old: '45', new: '49' } }, changedBy: { id: 'u', name: 'Alex Morgan' }, importBatchId: null, createdAt: '2026-09-20T10:00:00Z' },
  { id: 'h1', action: 'create', source: 'csv', changes: { name: { old: null, new: 'Canvas tote' } }, changedBy: { id: 'u', name: 'Alex Morgan' }, importBatchId: 'b', createdAt: '2026-09-01T10:00:00Z' },
], hasMore: false }

export const importCsv = [
  'SKU,Name,Colour,Price,Supplier',
  'WX5678-100,Canvas tote,Sand,49,Acme',
  'WX5678-200,Wool scarf,Moss,cheap,Acme',
  '',
  'WX9999-001,Linen shirt,Ink,59,',
  ',Orphan,,,',
].join('\n')
const comparison = {
  keyColumnName: 'SKU',
  newColumns: ['Supplier'],
  newOptions: { colour: ['Moss'] },
  rows: [
    { key: 'WX5678-100', status: 'changed', existing: records[0].metaData, new: { SKU: 'WX5678-100', name: 'Canvas tote', colour: 'Sand', price: '49', Supplier: 'Acme' }, differences: { price: { old: '45', new: '49' }, Supplier: { old: '', new: 'Acme' } }, invalid: {} },
    { key: 'WX5678-200', status: 'invalid', existing: records[1].metaData, new: { SKU: 'WX5678-200', name: 'Wool scarf', colour: 'Moss', price: 'cheap', Supplier: 'Acme' }, differences: {}, invalid: { price: 'Price must be a number.' } },
    { key: 'WX9999-001', status: 'new', existing: {}, new: { SKU: 'WX9999-001', name: 'Linen shirt', colour: 'Ink', price: '59' }, differences: {}, invalid: {} },
    { key: '', status: 'missing_key', existing: {}, new: { SKU: '', name: 'Orphan' }, differences: {}, invalid: {} },
  ],
}

// Rows by block, as the grid asks for them; the second table is empty.
function listFor(input: { offset?: number, tableId?: string } = {}) {
  const rows = input.tableId === tables[1].id ? [] : records
  return { records: (input.offset ?? 0) === 0 ? rows : [], total: rows.length, keyColumnName: 'SKU' }
}

// The answers of the admin Records screens, for an admin, with views on.
// File metadata has no field yet.
export const recordsApi = {
  'env': { ...env, recordLabel: { singular: 'Product', plural: 'Products' }, viewsEnabled: true },
  'record.list': listFor,
  'recordTable.list': tables,
  'recordTable.create': { id: '00000000-0000-4000-8000-0000000000a3', name: 'Shoes', position: 2, recordCount: 0, fieldIds: [] },
  'record.moveToTable': { moved: 1 },
  'recordAttribute.list': fields,
  'recordAttribute.listAvailable': fields.map(field => field.name),
  'recordAttribute.update': null,
  'record.get': detail,
  'record.history': history,
  'record.patch': { id: records[0].id, metaData: records[0].metaData, updatedAt: '2026-09-21T10:00:00Z' },
  'record.patchMany': null,
  'record.compareCsv': comparison,
  'metadataField.list': [],
  'record.importCsv': { newRecords: ['WX9999-001'], updatedRecords: ['WX5678-100'], skipped: [], importBatchId: 'b' },
}
