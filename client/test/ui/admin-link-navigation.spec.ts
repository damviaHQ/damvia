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
import { expect, test, type MockTrpc } from './lib/trpc'

const matching = { types: [{ id: 'packshots', name: 'Packshots', isRelatedToRecords: true, files: 310, steps: [] }], trustedFields: [], views: { enabled: true, separator: '.', digits: 2 }, generatedViewPart: null, attributes: [] }
const lastRun = { finishedAt: '2026-09-30T09:14:00Z', startedBy: null, trigger: 'sync', durationMs: 1200, error: null, stats: { entities: { matched: 310, unmatched: 2, conflicts: 1, linksAdded: 4, linksRemoved: 0, linksUpdated: 0 } } }

function api(mockTrpc: MockTrpc, unmatched = 3) {
  return mockTrpc({
    'resolverStep.list': matching,
    'entityCsv.summary': { rows: 0, importedBy: null, importedAt: null },
    'enrichment.badges': { unmatched, unnamedAxes: 2 },
    'enrichment.overview': { synced: true, running: null, lastRun },
    'enrichment.run': { queued: false },
    'entityResolution.counts': { unmatched: 2, conflicts: 1, dangling: 0, folders: 1 },
    'entityResolution.unmatchedFolders': [],
    'entityResolution.unmatchedFiles': { files: [], total: 0 },
    'entityResolution.conflicts': [],
    'entityResolution.dangling': [],
    'entityResolution.manualLinks': [{ id: 'l1', kind: 'file', name: 'Trailer.mp4', path: '/Dropbox/Videos', targetKind: 'record', recordKey: '02351-210-M', attributeName: null, attributeValue: null, createdBy: 'Arnaud', createdAt: '2026-09-30T08:00:00Z', files: 1 }],
  }, { role: 'admin' })
}

test('the admin menu groups assets, the database and data enrichment, and the badge follows Link to products', async ({ page, mockTrpc }) => {
  await api(mockTrpc)
  await page.goto('/admin/data-enrichment/matching')
  const menu = page.getByRole('navigation').filter({ has: page.getByRole('link', { name: 'Asset types' }) })
  const section = (title: string) => menu.locator('.menu-section', { has: page.locator('.menu-section-title', { hasText: new RegExp(`^${title}$`) }) })
  await expect(section('Asset Management').getByRole('link')).toHaveText([/Assets/, /Licenses/, /Variants/])
  await expect(section('Database').getByRole('link')).toHaveText([/Products/, /File metadata/])
  await expect(section('Data Enrichment').getByRole('link')).toHaveText([/Asset types/, /Link to products/])
  await expect(section('Data Enrichment').getByRole('link', { name: /Link to products/ })).toContainText('3')
  for (const gone of ['Enrichment Setup', 'Setup guide', 'To review']) await expect(menu.getByText(gone, { exact: true })).toHaveCount(0)
})

test('Link to products holds the rules, what to review and the links by hand in one page', async ({ page, mockTrpc, shot }) => {
  const mock = await api(mockTrpc)
  await page.goto('/admin/data-enrichment/matching')
  const tabs = page.getByRole('tablist').first()
  await expect(tabs.getByRole('tab')).toHaveText([/Rules/, /To review\s*3/, /Linked by hand\s*1/])
  await expect(page.getByRole('heading', { name: 'Packshots' })).toBeVisible()
  const pass = page.getByRole('region', { name: 'Last enrichment pass' })
  await expect(pass).toContainText('started by the sync')
  await expect(pass).toContainText('310 matched')
  await shot('link-page-rules')
  await pass.getByRole('button', { name: 'Run enrichment now' }).click()
  await expect.poll(() => mock.inputs('enrichment.run').length).toBe(1)

  await tabs.getByRole('tab', { name: /^To review/ }).click()
  await expect(page).toHaveURL(/tab=review/)
  await expect(page.getByRole('tab', { name: /Folders without a product/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Missing products/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Linked by hand/ }).first()).toBeVisible()

  await tabs.getByRole('tab', { name: /^Linked by hand/ }).click()
  await expect(page).toHaveURL(/tab=manual/)
  await expect(page.getByRole('button', { name: 'Link a folder' })).toBeVisible()
  await expect(page.getByText('Trailer.mp4')).toBeVisible()
})

test('the setup guide and the old To review addresses lead to Link to products', async ({ page, mockTrpc }) => {
  await api(mockTrpc)
  await page.goto('/admin/data-enrichment')
  await expect(page).toHaveURL(/\/admin\/data-enrichment\/matching$/)
  await page.goto('/admin/data-enrichment/unmatched')
  await expect(page).toHaveURL(/\/admin\/data-enrichment\/matching\?tab=review$/)
  await expect(page.getByRole('tab', { name: /Pictures without a product/ })).toBeVisible()
  await page.goto('/admin/data-enrichment/unmatched?tab=manual')
  await expect(page).toHaveURL(/\/admin\/data-enrichment\/matching\?tab=manual$/)
  await expect(page.getByRole('button', { name: 'Link a folder' })).toBeVisible()
})
