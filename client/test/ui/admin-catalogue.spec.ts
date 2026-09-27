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
import { collection as source } from './lib/fixtures'
import { expect, test, type MockTrpc } from './lib/trpc'

function fixture(mockTrpc: MockTrpc) {
  const relatedRecords = { enabled: true, groups: [{ scope: 'all', matchField: '$family', hasPhoto: false, filters: [], excludeFilters: [] }] }
  const collection = { ...source, id: 'catalogue', name: 'Winter shoes', canEdit: true, synchronized: false, catalogueMode: 'products', recordFilters: [], includesAllRecords: false, relatedRecords: null as unknown }
  const rows = [
    { id: 'shoe-1', recordKey: 'SHOE-001', metaData: { name: 'Canvas sneaker', season: 'Winter' }, source: 'manual', excluded: false, readiness: { filled: 3, total: 3, ready: true } },
    { id: 'shoe-2', recordKey: 'SHOE-002', metaData: { name: 'Leather boot', season: 'Winter' }, source: 'rule', excluded: false, readiness: { filled: 1, total: 3, ready: false } },
  ]
  return mockTrpc({
    'collection.findById': collection,
    'collection.recordPreview': () => ({ rows, total: 125, included: rows[1].excluded ? 124 : 125, notReady: rows[1].excluded ? 0 : 24 }),
    'collection.setRecordRules': (input: { relatedRecords?: unknown }) => {
      if ('relatedRecords' in input) collection.relatedRecords = input.relatedRecords
      return null
    },
    'collection.setRecordsExcluded': (input: { recordIds: string[], excluded: boolean }) => {
      rows.find(row => row.id === input.recordIds[0])!.excluded = input.excluded
      return null
    },
    'collection.excludeNotReadyRecords': () => {
      rows.filter(row => !row.readiness.ready).forEach(row => { row.excluded = true })
      return 24
    },
    'settings.getEnrichment': { recordLabelSingular: 'Product', recordLabelPlural: 'Products', relatedRecords },
    'record.list': { records: [], total: 0, keyColumnName: 'SKU' },
    'recordAttribute.list': [{ id: 'name', name: 'name', displayName: 'Name', valueType: 'text', options: [], viewable: true }, { id: 'season', name: 'season', displayName: 'Season', valueType: 'text', options: [], viewable: true }],
  }, { role: 'admin' })
}

test('the builder preserves excluded rows and counts readiness across the whole collection', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(mockTrpc)
  await page.goto('/admin/collections/catalogue/products')
  await expect(page.getByRole('heading', { name: 'Winter shoes', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exclude all not ready (24)' })).toBeVisible()
  const row = page.getByRole('row', { name: /SHOE-002/ })
  await row.getByRole('switch').click()
  await expect.poll(() => api.inputs('collection.setRecordsExcluded')[0]).toEqual({ id: 'catalogue', recordIds: ['shoe-2'], excluded: true })
  await expect(row).toBeVisible()
  await expect(row).toHaveClass(/text-neutral-400/)
  await expect(row.getByRole('switch')).not.toBeChecked()
  await row.getByRole('switch').click()
  await expect(row.getByRole('switch')).toBeChecked()
  await page.getByRole('button', { name: 'Exclude all not ready (24)' }).click()
  await expect.poll(() => api.count('collection.excludeNotReadyRecords') > 0).toBe(true)
  await expect(row).toHaveClass(/text-neutral-400/)
  await expect(row.getByRole('switch')).not.toBeChecked()
  await expect(row.getByRole('switch')).toHaveAttribute('data-state', 'unchecked')
  await expect(page.getByRole('columnheader', { name: 'Season' })).toBeVisible()
  await shot('catalogue-builder', { fullPage: true })
})

test('rules are explicit saved changes and incomplete rules cannot be applied', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc)
  await page.goto('/admin/collections/catalogue/products')
  await page.getByRole('tab', { name: 'Automatic rules' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()
  await expect(page.getByRole('button', { name: 'Save rules' })).toBeDisabled()
  await page.getByLabel('Field of filter 1').selectOption('season')
  await page.getByLabel('Value of filter 1').fill('Winter')
  await expect(page.getByText('Unsaved changes. The preview shows the saved collection.')).toBeVisible()
  await page.getByRole('button', { name: 'Save rules' }).click()
  await expect.poll(() => api.inputs('collection.setRecordRules')[0]).toEqual({ id: 'catalogue', recordFilters: [{ column: 'season', op: 'contains', value: 'Winter', values: [] }], includesAllRecords: false })
})

test('the builder keeps its table inside the page on a narrow screen', async ({ page, mockTrpc, shot }) => {
  await page.setViewportSize({ width: 768, height: 844 })
  await fixture(mockTrpc)
  await page.goto('/admin/collections/catalogue/products')
  await expect(page.getByRole('heading', { name: 'Catalogue preview' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await shot('catalogue-builder-mobile', { fullPage: true })
})

test('related products combine scopes, photo requirements and exclusions and can inherit again', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(mockTrpc)
  await page.goto('/admin/collections/catalogue/products')
  const settings = page.getByRole('region', { name: 'Related Products' })
  await settings.getByRole('switch', { name: 'Use the default related products settings' }).click()
  const first = settings.getByRole('group', { name: 'Related group 1', exact: true })
  await first.getByLabel('Look in').selectOption('current')
  await first.getByLabel('Related by').selectOption('season')
  await first.getByRole('switch', { name: 'At least one accessible photo' }).click()
  await first.getByRole('button', { name: 'Add filter', exact: true }).nth(1).click()
  await expect(settings.getByRole('button', { name: 'Save related settings' })).toBeDisabled()
  await first.getByLabel('Field of filter 1').selectOption('season')
  await first.getByLabel('Value of filter 1').fill('SS24')
  await settings.getByRole('button', { name: 'Add OR group' }).click()
  const second = settings.getByRole('group', { name: 'Related group 2', exact: true })
  await second.getByLabel('Look in').selectOption('all')
  await second.getByRole('switch', { name: 'At least one accessible photo' }).click()
  await page.setViewportSize({ width: 768, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await shot('related-settings-mobile', { fullPage: true })
  await settings.getByRole('button', { name: 'Save related settings' }).click()
  await expect.poll(() => api.last('collection.setRecordRules')?.relatedRecords).toEqual({
    enabled: true, groups: [
      { scope: 'current', matchField: 'season', hasPhoto: true, filters: [], excludeFilters: [{ column: 'season', op: 'contains', value: 'SS24', values: [] }] },
      { scope: 'all', matchField: null, hasPhoto: true, filters: [], excludeFilters: [] },
    ],
  })
  await settings.getByRole('switch', { name: 'Use the default related products settings' }).click()
  await settings.getByRole('button', { name: 'Save related settings' }).click()
  await expect.poll(() => api.last('collection.setRecordRules')?.relatedRecords).toBeNull()
})
