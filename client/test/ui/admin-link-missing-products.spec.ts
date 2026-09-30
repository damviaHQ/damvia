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
import { recordsApi, tables } from './lib/records'
import { expect, test } from './lib/trpc'

const dangling = [{ id: 'd1', fileId: 'f1', name: 'ZZ-900_front.jpg', path: '/Dropbox/Packshots', targetKind: 'record', recordKey: 'ZZ-900', attributeName: null, attributeValue: null, strategy: 'filename_regex', manual: false }]

async function open(page: import('@playwright/test').Page, mockTrpc: import('./lib/trpc').MockTrpc) {
  const mock = await mockTrpc({
    ...recordsApi,
    'resolverStep.list': { types: [], trustedFields: [], views: { enabled: true, separator: '.', digits: 2 }, generatedViewPart: null, attributes: [] },
    'entityCsv.summary': { rows: 0, importedBy: null, importedAt: null },
    'enrichment.badges': { unmatched: 0, unnamedAxes: 0 },
    'enrichment.overview': { synced: true, running: null, lastRun: null },
    'entityResolution.counts': { unmatched: 0, conflicts: 0, dangling: 1, folders: 0 },
    'entityResolution.unmatchedFolders': [],
    'entityResolution.unmatchedFiles': { files: [], total: 0 },
    'entityResolution.conflicts': [],
    'entityResolution.dangling': dangling,
    'entityResolution.manualLinks': [],
    'entityResolution.createRecord': { id: 'x' },
    'record.create': { id: '00000000-0000-4000-8000-0000000000bb', recordKey: 'ZZ-900' },
  }, { role: 'admin' })
  await page.goto('/admin/data-enrichment/matching?tab=review')
  await page.getByRole('tab', { name: /Missing products/ }).click()
  return mock
}

// A key found in file names but not imported: fill the product in its card and
// save, or create it with its key only to go fast.
test('a missing product is created from its card, with Save', async ({ page, mockTrpc }) => {
  const mock = await open(page, mockTrpc)
  await page.getByRole('button', { name: 'Create and fill' }).click()
  const card = page.getByRole('dialog')
  await expect(card.getByRole('heading', { name: 'ZZ-900' })).toBeVisible()
  await card.getByRole('textbox', { name: 'Name' }).fill('Zip pouch')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => mock.inputs('record.create')[0]).toEqual({ recordKey: 'ZZ-900', values: { name: 'Zip pouch' }, tableId: tables[0].id, source: 'unmatched' })
  expect(mock.inputs('entityResolution.createRecord')).toHaveLength(0)
})

test('Quick create makes the product with its key only', async ({ page, mockTrpc }) => {
  const mock = await open(page, mockTrpc)
  await page.getByRole('button', { name: 'Quick create' }).click()
  await expect.poll(() => mock.inputs('entityResolution.createRecord')[0]).toEqual({ key: 'ZZ-900' })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
