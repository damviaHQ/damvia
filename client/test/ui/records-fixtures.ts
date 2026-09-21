import { type Page } from '@playwright/test'
import { responses } from './client-fixtures'

// Sample catalogue for the admin Records screen: no real Damvia API is called.
const picture = (fill: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${fill}"/></svg>`)
const fields = [
  { id: 'f-name', name: 'name', displayName: 'Name', valueType: 'text', options: [], position: 0, facetable: false, viewable: true, searchable: true },
  { id: 'f-colour', name: 'colour', displayName: 'Colour', valueType: 'single_select', options: ['Sand', 'Forest', 'Ink'], position: 1, facetable: true, viewable: true, searchable: false },
  { id: 'f-tags', name: 'tags', displayName: 'Tags', valueType: 'multi_select', options: ['Eco', 'New', 'Sale'], position: 2, facetable: true, viewable: true, searchable: false },
  { id: 'f-price', name: 'price', displayName: 'Price', valueType: 'number', options: [], position: 3, facetable: false, viewable: true, searchable: false },
  { id: 'f-launch', name: 'launch', displayName: 'Launch', valueType: 'date', options: [], position: 4, facetable: false, viewable: true, searchable: false },
]
export const records = [
  { id: '00000000-0000-4000-8000-000000000001', recordKey: 'WX5678-100', keyColumnName: 'SKU', metaData: { SKU: 'WX5678-100', name: 'Canvas tote', colour: 'Sand', tags: 'Eco|New', price: '49', launch: '2026-10-01' }, thumbnailURL: picture('#c29570'), fileCount: 4, filledCount: 5, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000002', recordKey: 'WX5678-200', keyColumnName: 'SKU', metaData: { SKU: 'WX5678-200', name: 'Wool scarf', colour: 'Forest', tags: 'Sale', price: 'n/a' }, thumbnailURL: picture('#354d45'), fileCount: 1, filledCount: 4, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000003', recordKey: 'WX5678-300', keyColumnName: 'SKU', metaData: { SKU: 'WX5678-300', name: 'Leather belt' }, thumbnailURL: null, fileCount: 0, filledCount: 1, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z' },
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

export async function fixture(page: Page) {
  const errors: string[] = []
  const calls: { name: string, input: unknown }[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/trpc/')[1]
    const raw = route.request().method() === 'POST' ? route.request().postData() : url.searchParams.get('input')
    calls.push({ name, input: raw ? JSON.parse(raw) : undefined })
    const data = name === 'user.me' ? { ...(responses[name] as object), role: 'admin' }
      : name === 'env' ? { ...(responses.env as object), recordLabel: { singular: 'Product', plural: 'Products' }, viewsEnabled: true }
      : name === 'record.list' ? { records, total: records.length, keyColumnName: 'SKU' }
      : name === 'recordAttribute.list' ? fields
      : name === 'record.get' ? detail
      : name === 'record.history' ? history
      : name === 'record.patch' ? { id: records[0].id, metaData: records[0].metaData, updatedAt: '2026-09-21T10:00:00Z' }
      : name === 'enrichment.badges' ? { unmatched: 0, unnamedAxes: 0 }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return { errors, calls }
}

