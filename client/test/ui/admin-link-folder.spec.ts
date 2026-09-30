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
import { type Page } from '@playwright/test'
import { expect, test, type MockTrpc } from './lib/trpc'

const pampa = { id: 'pampa', path: '/Dropbox/SS25/SELL-OUT/BONUS CONTENT/PAMPA OXFORD', files: 3 }
const season = { id: 'ss25', path: '/Dropbox/SS25', files: 1240 }
const matching = { types: [{ id: 'packshots', name: 'Packshots', isRelatedToRecords: true, files: 310, steps: [] }], trustedFields: [], views: { enabled: true, separator: '.', digits: 2 }, generatedViewPart: null, attributes: [] }
const preview = (folderId: string) => folderId === 'ss25'
  ? { path: season.path, files: 1240, types: [{ type: 'Packshots', files: 900, linked: 880 }, { type: 'Marketing Assets', files: 340, linked: 12 }], linkedHere: [], linkedAbove: null, subfoldersLinked: 2 }
  : { path: pampa.path, files: 3, types: [{ type: 'Marketing Assets', files: 3, linked: 0 }], linkedHere: [], linkedAbove: { path: '/Dropbox/SS25/SELL-OUT/BONUS CONTENT', target: 'Season = 25S' }, subfoldersLinked: 0 }

// The Linked by hand tab of Link to products, with nothing to review and nothing linked yet.
async function open(page: Page, mockTrpc: MockTrpc) {
  const api = await mockTrpc({
    'resolverStep.list': matching,
    'entityCsv.summary': { rows: 0, importedBy: null, importedAt: null },
    'enrichment.overview': { synced: true, running: null, lastRun: null },
    'entityResolution.counts': { unmatched: 0, conflicts: 0, dangling: 0, folders: 0 },
    'entityResolution.unmatchedFolders': [{ id: 'pampa', path: pampa.path, type: 'Packshots', files: 2 }],
    'entityResolution.unmatchedFiles': { files: [], total: 0 },
    'entityResolution.conflicts': [],
    'entityResolution.dangling': [],
    'entityResolution.manualLinks': [],
    'entityResolution.folderSearch': (input: { query: string }) => [season, pampa].filter(folder => folder.path.toLowerCase().includes(input.query.toLowerCase())),
    'entityResolution.folderPreview': (id: string) => preview(id),
    'entityResolution.findTargets': { records: [{ id: 'r1', key: '02351-008-M', label: 'PAMPA OXFORD' }], values: [] },
    'recordAttribute.listAvailable': ['Season', 'Style Name'],
    'entityResolution.attach': { files: 3, recordCreated: false, applied: {} },
    'asset.tree': [{ id: 'dropbox', name: 'Dropbox', path: '/Dropbox', children: [
      { id: 'ss25', name: 'SS25', path: season.path, children: [{ id: 'pampa', name: 'PAMPA OXFORD', path: pampa.path }] },
      { id: 'fw26', name: 'FW26', path: '/Dropbox/FW26' },
    ] }],
  }, { role: 'admin' })
  await page.goto('/admin/data-enrichment/matching?tab=manual')
  return api
}

test('linking a folder shows what it holds and what happens before anything is written', async ({ page, mockTrpc, shot }) => {
  const api = await open(page, mockTrpc)
  await page.getByRole('button', { name: 'Link a folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'Link a folder to a product' })
  await expect(dialog.getByRole('button', { name: 'Link', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('region', { name: '2. Link to' }), 'the target comes once a folder is chosen').toHaveCount(0)
  await dialog.getByRole('searchbox', { name: 'Search folders' }).fill('pampa')
  await dialog.getByRole('listbox', { name: 'Folders' }).getByRole('option', { name: /PAMPA OXFORD/ }).click()
  await expect(dialog.getByText('3 files', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Marketing Assets: 3 files')).toBeVisible()
  await expect(dialog.getByText(/Its parent folder .* is linked to Season = 25S/)).toBeVisible()

  await dialog.getByRole('searchbox').last().fill('02351')
  await dialog.getByRole('listbox', { name: 'Products' }).getByRole('option', { name: /02351-008-M/ }).click()
  const summary = dialog.getByRole('region', { name: 'What happens' })
  await expect(summary).toContainText(`The 3 files of ${pampa.path} are linked to product 02351-008-M.`)
  await shot('link-folder-dialog')
  await dialog.getByRole('button', { name: 'Link 3 files' }).click()
  await expect.poll(() => api.inputs('entityResolution.attach')[0]).toEqual({ target: { kind: 'record', key: '02351-008-M' }, folderId: 'pampa' })
  await expect(dialog).toHaveCount(0)
})

test('a large folder is flagged, and a folder of the list opens already chosen', async ({ page, mockTrpc }) => {
  await open(page, mockTrpc)
  await page.getByRole('button', { name: 'Link a folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'Link a folder to a product' })
  await dialog.getByRole('searchbox', { name: 'Search folders' }).fill('ss25')
  await dialog.getByRole('listbox', { name: 'Folders' }).getByRole('option', { name: /^\/Dropbox\/SS25 / }).click()
  await expect(dialog.getByRole('note')).toContainText('This is a large folder. Every one of its 1240 files')
  await expect(dialog.getByText('Packshots: 900 files, 880 already linked to a product')).toBeVisible()
  await expect(dialog.getByText('2 subfolders have a link of their own and keep them.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Change' }).click()
  await expect(dialog.getByRole('searchbox', { name: 'Search folders' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('tab', { name: /^To review/ }).click()
  await page.getByRole('tab', { name: /Folders without a product/ }).click()
  await page.getByRole('button', { name: 'Attach' }).click()
  await expect(dialog.getByText(pampa.path)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Change' })).toHaveCount(0)
})

test('without a search, the folders are browsed as a tree and one is chosen from it', async ({ page, mockTrpc, shot }) => {
  await open(page, mockTrpc)
  await page.getByRole('button', { name: 'Link a folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'Link a folder to a product' })
  const tree = dialog.getByRole('tree', { name: 'Folder tree' })
  await expect(tree.getByRole('treeitem')).toHaveCount(1)
  await tree.getByRole('button', { name: 'Open Dropbox' }).click()
  await tree.getByRole('button', { name: 'Open SS25' }).click()
  await expect(tree.getByRole('treeitem')).toHaveCount(4)
  await shot('link-folder-tree')
  await tree.getByRole('button', { name: 'Choose PAMPA OXFORD' }).click()
  await expect(dialog.getByText('Marketing Assets: 3 files')).toBeVisible()
  await expect(dialog.getByRole('tree')).toHaveCount(0)
})
