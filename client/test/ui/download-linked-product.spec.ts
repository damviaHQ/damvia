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
import { files as sampleFiles } from './lib/fixtures'
import { expect, test, type MockTrpc } from './lib/trpc'

const fields = [
  { name: 'name', displayName: 'Name', valueType: 'text', position: 1 },
  { name: 'colour', displayName: 'Colour', valueType: 'single_select', position: 2 },
  { name: 'tags', displayName: 'Tags', valueType: 'multi_select', position: 3 },
]
type LinkedRecord = { id: string, recordKey: string, primary: boolean, inCatalogue: boolean, metaData: Record<string, string>, visuals: { id: string, view: string, thumbnailURL: string }[] }

const bottle: LinkedRecord = {
  id: 'bot-cit-250', recordKey: 'BOT-CIT-250', primary: true, inCatalogue: true,
  metaData: { SKU: 'BOT-CIT-250', name: 'Citrus bottle', colour: 'Sand', tags: 'Glass|Refill' },
  visuals: [{ id: 'visual-00', view: '00', thumbnailURL: sampleFiles[1].thumbnailURL }, { id: 'visual-01', view: '01', thumbnailURL: sampleFiles[2].thumbnailURL }],
}
// Linked to the file but held by no catalogue the reader can open.
const refill: LinkedRecord = { id: 'ref-cit-500', recordKey: 'REF-CIT-500', primary: false, inCatalogue: false, metaData: { SKU: 'REF-CIT-500', name: 'Citrus refill', colour: 'Clear' }, visuals: [] }

type LinkedRange = { attributeName: string, label: string, value: string, total: number, records: { id: string, recordKey: string, metaData: Record<string, string>, thumbnailURL: string | null }[] }
type Options = { records?: LinkedRecord[], ranges?: LinkedRange[], pdf?: boolean }

// Opens the download of one file of the campaign with the records it is linked to.
async function openFile(page: Page, mockTrpc: MockTrpc, options: Options = {}) {
  const records = options.records ?? [bottle]
  const file = options.pdf
    ? { ...sampleFiles[0], mimeType: 'application/pdf', size: 2400000, recordView: null, license: null, record: null }
    : { ...sampleFiles[0], size: 2400000, recordView: '00', license: null, record: records[0] ? { id: records[0].id, attributes: [{ id: 'colour', name: 'colour', displayName: 'Colour', value: records[0].metaData.colour }] } : null }
  const api = await mockTrpc({
    'collection.getFiles': { files: [file], licenses: [], allowDirectDownload: true, viewsEnabled: true, mainView: '00', recordCount: 0, columns: [], previewRows: [], previewPictures: [] },
    'catalogue.fileRecords': { keyColumnName: 'SKU', cardTitleField: 'name', fields, records, ranges: options.ranges ?? [] },
    'download.create': { url: null },
  })
  await page.goto('/collections/campaign')
  await page.getByRole('checkbox', { name: 'Select Campaign — Sand.jpg', exact: true }).check()
  await page.getByTitle('Download selection', { exact: true }).click()
  return { api, dialog: page.getByRole('dialog', { name: 'Campaign — Sand.jpg', exact: true }) }
}

test('a photo linked to a product shows the product, its picture and views in a second tab', async ({ page, mockTrpc, shot }) => {
  const { api, dialog } = await openFile(page, mockTrpc)
  await expect(dialog.getByRole('tab', { name: 'Download' })).toHaveAttribute('aria-selected', 'true')

  await dialog.getByRole('tab', { name: 'Product' }).click()
  const panel = dialog.getByRole('tabpanel')
  await expect(panel.getByRole('heading', { name: 'Citrus bottle' })).toBeVisible()
  await expect(panel.getByRole('img', { name: 'Citrus bottle' })).toHaveAttribute('src', bottle.visuals[0].thumbnailURL)
  await expect(panel.getByRole('button', { name: 'Copy SKU value' })).toContainText('BOT-CIT-250')
  await expect(panel.getByRole('button', { name: 'Copy Tags value' })).toContainText('Glass, Refill')
  await panel.getByRole('button', { name: 'Show view 01' }).click()
  await expect(panel.getByRole('img', { name: 'Citrus bottle' })).toHaveAttribute('src', bottle.visuals[1].thumbnailURL)
  await expect(panel.getByRole('link', { name: 'Open the product page' })).toHaveAttribute('href', '/products/bot-cit-250')
  await shot('download-linked-product')
  expect(api.inputs('catalogue.fileRecords')[0]).toBe('file-0')

  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toEqual(['file-0'])
})

test('any asset type linked to several products lists each of them', async ({ page, mockTrpc }) => {
  const { dialog } = await openFile(page, mockTrpc, { pdf: true, records: [bottle, refill] })
  await dialog.getByRole('tab', { name: 'Products · 2' }).click()
  const panel = dialog.getByRole('tabpanel')
  const switcher = panel.getByRole('group', { name: 'Linked products' })
  await expect(switcher.getByRole('button', { name: 'BOT-CIT-250' })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('heading', { name: 'Citrus bottle' })).toBeVisible()

  await switcher.getByRole('button', { name: 'REF-CIT-500' }).click()
  await expect(panel.getByRole('heading', { name: 'Citrus refill' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Copy Colour value' })).toContainText('Clear')
  await expect(panel.getByRole('img')).toHaveCount(0)
  await expect(panel.getByRole('link', { name: 'Open the product page' })).toHaveCount(0)
})

test('a file without a product has no tabs', async ({ page, mockTrpc }) => {
  const { dialog } = await openFile(page, mockTrpc, { pdf: true, records: [] })
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('tab')).toHaveCount(0)
})

test('a file covering a range lists the products of the range with a link to each page', async ({ page, mockTrpc, shot }) => {
  const style: LinkedRange = { attributeName: 'style', label: 'Style Name', value: 'PAMPA OXFORD', total: 14, records: [
    { id: 'bot-cit-250', recordKey: 'BOT-CIT-250', metaData: { name: 'Citrus bottle' }, thumbnailURL: sampleFiles[1].thumbnailURL },
    { id: 'ref-cit-500', recordKey: 'REF-CIT-500', metaData: {}, thumbnailURL: null },
  ] }
  const { dialog } = await openFile(page, mockTrpc, { pdf: true, records: [], ranges: [style] })
  await dialog.getByRole('tab', { name: 'Products', exact: true }).click()
  const range = dialog.getByRole('tabpanel').getByRole('region', { name: 'Style Name PAMPA OXFORD' })
  await expect(range.getByRole('heading', { name: 'Covers every product where Style Name is PAMPA OXFORD' })).toBeVisible()
  await expect(range.getByText('14 products')).toBeVisible()
  await expect(range.getByText('and 12 more')).toBeVisible()
  await expect(range.getByRole('link', { name: /BOT-CIT-250/ })).toHaveAttribute('href', '/products/bot-cit-250')
  await expect(range.getByRole('link', { name: /BOT-CIT-250/ })).toContainText('Citrus bottle')
  await shot('download-linked-range')
  await expect(range.getByRole('link', { name: /REF-CIT-500/ })).toHaveAttribute('href', '/products/ref-cit-500')
})
