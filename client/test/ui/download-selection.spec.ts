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
import { expect, serverError, test, type MockTrpc } from './lib/trpc'

type Options = { views?: boolean, noFiles?: boolean, fail?: boolean, products?: number, selectedProducts?: number, singleFile?: boolean, licensed?: boolean, mainView?: string }

// Selects files of the collection, or products of the catalogue, then opens
// the download of the selection.
async function fixture(page: Page, mockTrpc: MockTrpc, options: Options = {}) {
  const files = options.noFiles ? [] : sampleFiles.slice(0, options.singleFile ? 1 : 4).map((file, i) => ({ ...file, size: 2400000, recordView: ['00', '01', '01', null][i], license: options.licensed && i === 1 ? { id: 'licence', name: 'Studio usage', details: '<p>Approved use only.</p>', scopes: [] } : null }))
  let failed = false
  const getFiles = (input: { items: { type: string, id: string }[] }) => {
    if (options.fail && !failed) {
      failed = true
      return serverError('Could not load selection.')
    }
    const selectedRecordIds = input.items.filter(item => item.type === 'record').map(item => item.id)
    const previewIndexes = selectedRecordIds.length ? selectedRecordIds.map(id => Number(id.split('-').at(-1))) : Array.from({ length: Math.min(options.products ?? 12, 12) }, (_, i) => i)
    return {
      files, licenses: [], allowDirectDownload: true, viewsEnabled: options.views ?? true, mainView: options.mainView ?? '00',
      recordCount: options.singleFile ? 0 : selectedRecordIds.length || (options.products ?? 12),
      columns: [{ id: 'recordKey', label: 'Reference' }, { id: 'name', label: 'Name' }, { id: 'season', label: 'Season' }, { id: 'picture', label: 'Picture' }],
      previewRows: previewIndexes.map(i => [`0010${i}`, ['Botanical', 'Essentials', 'Studio'][i % 3], 'Autumn', '']),
      previewPictures: previewIndexes.map(() => files[0]?.thumbnailURL ?? null),
    }
  }
  const api = await mockTrpc({
    'collection.getFiles': getFiles,
    'catalogue.list': { products: Array.from({ length: options.products ?? 2 }, (_, i) => ({ id: `product-${i}`, recordKey: `0010${i}`, metaData: { name: 'Botanical' }, thumbnailURL: files[0]?.thumbnailURL ?? null, visuals: [], visualCount: files.length, fileCount: files.length, readiness: { filled: 0, total: 0, ready: true }, family: null })), total: options.products ?? 2, fields: [], cardTitleField: null },
    'catalogue.facets': { total: options.products ?? 2, attributes: [], assetTypes: [], fileTypes: [], extensions: [] },
    'download.exportRecords': { filename: 'records.csv', mimeType: 'text/csv', content: Buffer.from('Reference,Season\r\n00100,Autumn').toString('base64') },
    'download.create': { url: null },
  })
  if (options.products) {
    await page.goto('/catalogue')
    for (let i = 0; i < (options.selectedProducts ?? options.products); i++) await page.getByRole('checkbox', { name: `Select 0010${i}`, exact: true }).check()
  } else {
    await page.goto('/collections/campaign')
    if (options.singleFile) await page.getByRole('checkbox', { name: 'Select Campaign — Sand.jpg', exact: true }).check()
    else await page.getByRole('button', { name: 'Select All in', exact: true }).click()
  }
  await page.getByTitle('Download selection', { exact: true }).click()
  return api
}

test('record lists preview and export only chosen columns, with Excel and CSV choices', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(page, mockTrpc)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Files' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('tab', { name: 'Products' })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByLabel('Excel .xlsx')).toBeChecked()
  const excel = (await dialog.getByLabel('Excel .xlsx').boundingBox())!
  const csv = (await dialog.getByLabel('CSV .csv').boundingBox())!
  expect(Math.abs(excel.y - csv.y)).toBeLessThan(2)
  await expect(dialog.locator('.columns-heading button')).toHaveText('Remove all')
  await dialog.getByRole('button', { name: 'Remove all', exact: true }).click()
  await expect(dialog.locator('.columns-heading button')).toHaveText('Select all')
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeDisabled()
  await dialog.getByLabel('Reference', { exact: true }).check()
  await dialog.getByLabel('Season', { exact: true }).check()
  await expect(dialog.locator('.columns-heading button')).toHaveText('Select all')
  await expect(dialog.getByRole('columnheader')).toHaveText(['Reference', 'Season'])
  await expect(dialog.locator('.list-preview .product-picture')).toHaveCount(12)
  await shot('download-list')
  await dialog.getByLabel('CSV .csv').check()
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  expect((await downloaded).suggestedFilename()).toBe('products.csv')
  expect(api.inputs('download.exportRecords')[0]).toMatchObject({ columns: ['recordKey', 'season'], format: 'csv' })
  await expect(dialog).toHaveCount(0)
})

test('Excel embeds the chosen picture column in the chosen order', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Products' }).click()
  await expect(dialog.getByRole('columnheader').first()).toHaveText('Picture')
  await dialog.getByLabel('CSV .csv').check()
  await expect(dialog.getByRole('columnheader', { name: 'Picture' })).toHaveCount(0)
  await dialog.getByLabel('Excel .xlsx').check()
  await expect(dialog.getByLabel('Picture', { exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'Move Season up' }).click()
  await dialog.getByRole('button', { name: 'Move Season up' }).click()
  await expect(dialog.getByRole('columnheader')).toHaveText(['Picture', 'Season', 'Reference', 'Name'])
  await dialog.getByRole('button', { name: 'Move Picture down' }).click()
  await expect(dialog.getByRole('columnheader')).toHaveText(['Season', 'Picture', 'Reference', 'Name'])
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download Excel' }).click()
  await downloaded
  expect(api.inputs('download.exportRecords')[0]).toMatchObject({ columns: ['season', 'picture', 'recordKey', 'name'], format: 'xlsx' })
})

test('dragging columns changes the preview and export order', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Products' }).click()
  await dialog.getByRole('button', { name: 'Drag Season to reorder' }).dragTo(dialog.getByRole('button', { name: 'Drag Reference to reorder' }))
  await expect(dialog.getByRole('columnheader')).toHaveText(['Picture', 'Season', 'Reference', 'Name'])
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download Excel' }).click()
  await downloaded
  expect(api.inputs('download.exportRecords')[0].columns).toEqual(['picture', 'season', 'recordKey', 'name'])
})

test('excluded files stay in place and can be included again', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(page, mockTrpc)
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.download-options').getByRole('heading', { name: 'Views' })).toBeVisible()
  await expect(dialog.locator('.download-preview').getByRole('heading', { name: 'Views' })).toHaveCount(0)
  await expect(dialog.getByLabel('Unnumbered')).toHaveCount(0)
  await expect(dialog.getByLabel('Include Studio — Edition.jpg')).toHaveCount(0)
  await expect(dialog.getByLabel('00', { exact: true })).toBeChecked()
  await expect(dialog.getByLabel('01', { exact: true })).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await dialog.getByLabel('00', { exact: true }).uncheck()
  await expect(dialog.locator('.download-footer > span')).toContainText('2 files')
  const firstCard = dialog.locator('.download-file').filter({ has: page.getByLabel('Include Botanical — Front.jpg') })
  const position = await firstCard.boundingBox()
  await dialog.getByLabel('Include Botanical — Front.jpg').uncheck()
  await expect(dialog.locator('.download-footer > span')).toContainText('1 file')
  await expect(firstCard).toHaveClass(/is-excluded/)
  expect(await firstCard.boundingBox()).toEqual(position)
  await expect(dialog.locator('.download-file')).toHaveCount(2)
  await expect(dialog.getByRole('button', { name: 'Restore removed' })).toHaveCount(0)
  await dialog.getByLabel('Include Essentials — Detail.jpg').uncheck()
  await expect(dialog.getByRole('button', { name: 'Download files', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeEnabled()
  await expect(dialog.locator('.download-file')).toHaveCount(2)
  await firstCard.getByText('Botanical — Front.jpg', { exact: true }).click()
  await expect(dialog.getByLabel('Include Botanical — Front.jpg')).toBeChecked()
  await expect(firstCard).not.toHaveClass(/is-excluded/)
  await expect(dialog.locator('.download-footer > span')).toContainText('1 file')
  await shot('download-files')
  await dialog.getByRole('button', { name: 'Download files', exact: true }).click()
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toEqual(['file-1'])
})

test('views follow settings and the dialog fits the narrowest desktop', async ({ page, mockTrpc, shot }) => {
  await page.setViewportSize({ width: 768, height: 844 })
  await fixture(page, mockTrpc, { views: false })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Views', exact: true })).toHaveCount(0)
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('tab', { name: 'Products' }).click()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeInViewport()
  await expect(dialog.getByLabel('Excel .xlsx')).toBeInViewport()
  await expect(dialog.getByLabel('Reference', { exact: true })).toBeInViewport()
  await shot('download-mobile')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('a failed load can be retried and records without media can still export', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { noFiles: true, fail: true })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('Could not load selection.')
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  expect(api.count('collection.getFiles')).toBe(2)
  // With no media, the list is the only thing to download.
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: /^Download (files|all)$/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^Download/ })).toHaveText(['Download Excel'])
})

test('a files-only selection has its own download action', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 0 })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Download files' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Download all' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Download files' }).click()
  await expect.poll(() => api.count('download.create')).toBe(1)
  expect(api.inputs('download.create')[0].recordExport).toBeUndefined()
})


test('one product starts with the main view and the filename strip keeps the download selection', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(page, mockTrpc, { products: 1 })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog).toHaveClass(/gallery-modal/)
  expect(await dialog.locator('.gallery-modal__header').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(50)
  await expect(dialog.locator('.gallery-modal__footer')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Product list' })).toHaveCount(0)
  await expect(dialog.getByText('Botanical', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('00', { exact: true })).toBeChecked()
  await expect(dialog.getByLabel('01', { exact: true })).not.toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Download 1 file', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Next view', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Preview Botanical — Front.jpg' }).click()
  await expect(dialog.locator('.gallery-modal__preview-thumbnail')).toHaveAttribute('alt', 'Botanical — Front.jpg')
  await expect(dialog.getByLabel('00', { exact: true })).toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Preview Botanical — Front.jpg' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Preview view 01' })).toHaveCount(0)
  await expect(dialog.locator('.product-views .view-actions button')).toHaveText('Select all')
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await expect(dialog.locator('.product-views .view-actions button')).toHaveText('Remove all')
  await expect(dialog.getByRole('button', { name: 'Download all views', exact: true })).toBeEnabled()
  await expect(dialog.getByLabel('Unnumbered')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Download all views', exact: true })).toHaveCSS('background-color', 'rgb(38, 38, 38)')
  await shot('single-product-download')
  await dialog.getByRole('button', { name: 'Download all views', exact: true }).click()
  expect(api.inputs('collection.getFiles')[0].items).toEqual([{ type: 'record', id: 'product-0' }])
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toEqual(['file-0', 'file-1', 'file-2'])
})

test('single product arrows navigate the visible products, not their views', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 3, selectedProducts: 1 })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('00100')
  await expect(dialog.getByRole('button', { name: 'Next product' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Next product' }).click()
  await expect(page.getByRole('dialog', { name: '00101', exact: true })).toBeVisible()
  await expect(dialog.getByLabel('00', { exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'Preview Essentials — Detail.jpg' }).click()
  await expect(dialog.getByRole('heading', { name: '00101', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Next product' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: '00102', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Previous product' }).click()
  await expect(page.getByRole('dialog', { name: '00101', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Previous product' }).click()
  await expect(page.getByRole('dialog', { name: '00100', exact: true })).toBeVisible()
  await dialog.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('dialog', { name: '00102', exact: true })).toBeVisible()
  const openedProducts = api.inputs('collection.getFiles').map(input => input.items[0].id)
  expect(openedProducts).toContain('product-1')
  expect(openedProducts.at(-1)).toBe('product-2')
})

test('single product copies all visible data or just one value', async ({ page, mockTrpc }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await fixture(page, mockTrpc, { products: 1, mainView: '01' })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog.getByLabel('01', { exact: true })).toBeChecked()
  await expect(dialog.locator('.gallery-modal__preview-thumbnail')).toHaveAttribute('alt', 'Botanical — Front.jpg')
  await dialog.getByRole('button', { name: 'Copy all product data' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Reference: 00100\nName: Botanical\nSeason: Autumn')
  await dialog.getByRole('button', { name: 'Copy Season value' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Autumn')
  // Only the main view is chosen, so the toggle offers every view first.
  await expect(dialog.getByRole('button', { name: 'Download 2 files', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await expect(dialog.getByRole('button', { name: 'Download all views' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Remove all' }).click()
  await expect(dialog.getByRole('button', { name: 'Download 0 files' })).toBeDisabled()
})

test('one product filters its views and requires only the included usage terms', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 1, licensed: true })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog.getByRole('button', { name: 'Download 1 file', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await expect(dialog.getByRole('button', { name: 'Download all views' })).toBeDisabled()
  await dialog.getByLabel('I agree to the usage terms').check()
  await expect(dialog.getByRole('button', { name: 'Download all views' })).toBeEnabled()
  await dialog.getByLabel('00', { exact: true }).uncheck()
  await expect(dialog.getByLabel('I agree to the usage terms')).not.toBeChecked()
  await dialog.getByLabel('01', { exact: true }).uncheck()
  await expect(dialog.getByRole('button', { name: 'Download 0 files', exact: true })).toBeDisabled()
  await dialog.getByLabel('00', { exact: true }).check()
  await expect(dialog.getByRole('button', { name: 'Download 1 file', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Download 1 file', exact: true }).click()
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toEqual(['file-0'])
})

test('multiple products can include files and an Excel list in one ZIP', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  const dialog = page.getByRole('dialog', { name: 'Download products', exact: true })
  await expect(dialog).toHaveClass(/download-dialog/)
  const bounds = (await dialog.boundingBox())!
  expect(bounds.width).toBe(page.viewportSize()!.width)
  expect(bounds.height).toBe(page.viewportSize()!.height)
  const sidebar = (await dialog.locator('.download-options').boundingBox())!
  const settings = (await dialog.locator('.download-section-body').boundingBox())!
  // The options sit against the right edge, their content centred inside.
  expect(Math.abs((sidebar.x + sidebar.width) - (bounds.x + bounds.width))).toBeLessThan(2)
  expect(Math.abs((settings.x - sidebar.x) - ((sidebar.x + sidebar.width) - (settings.x + settings.width)))).toBeLessThan(2)
  await expect(dialog.getByRole('tab')).toHaveCount(2)
  await expect(dialog.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.locator('.download-options > .download-section')).toHaveCount(1)
  await expect(dialog.getByLabel('00', { exact: true })).toBeChecked()
  await expect(dialog.getByLabel('01', { exact: true })).not.toBeChecked()
  await expect(dialog.locator('.download-preview .download-file')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await expect(dialog.locator('.download-preview .download-file')).toHaveCount(3)
  await expect(dialog.locator('.download-preview .record-preview')).toHaveCount(0)
  await dialog.getByRole('tab', { name: 'Products' }).click()
  await expect(dialog.getByLabel('Excel .xlsx')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Views' })).toHaveCount(0)
  await expect(dialog.locator('.download-preview .download-file')).toHaveCount(0)
  await expect(dialog.locator('.download-preview .record-preview')).toBeVisible()
  await expect(dialog.locator('.download-preview .list-preview tbody tr')).toHaveCount(2)
  await dialog.getByRole('tab', { name: 'Files' }).click()
  await expect(dialog.getByRole('heading', { name: 'Views' })).toBeVisible()
  await expect(dialog.locator('.download-preview .download-file')).toHaveCount(3)
  await expect(dialog.locator('.download-preview .record-preview')).toHaveCount(0)
  expect(await dialog.locator('.download-header').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(60)
  await expect(dialog.getByRole('button', { name: 'Download files' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Download all' })).toBeEnabled()
  await expect(dialog.locator('.download-preview .section-heading')).toHaveCount(0)
  await expect(dialog.locator('.download-footer > span')).toContainText('3 files')
  await expect(dialog.getByRole('checkbox', { name: 'Files 4' })).toHaveCount(0)
  await expect(dialog.getByRole('checkbox', { name: 'Product list 2' })).toHaveCount(0)
  expect(api.inputs('collection.getFiles')[0].items).toEqual([{ type: 'record', id: 'product-0' }, { type: 'record', id: 'product-1' }])
  await shot('multiple-products-download')
  await dialog.getByRole('button', { name: 'Download all' }).click()
  await expect.poll(() => api.count('download.create')).toBe(1)
  expect(api.inputs('download.create')[0].recordExport).toEqual({
    items: [{ type: 'record', id: 'product-0' }, { type: 'record', id: 'product-1' }],
    columns: ['picture', 'recordKey', 'name', 'season'], format: 'xlsx',
  })
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toEqual(['file-0', 'file-1', 'file-2'])
})

test('a combined ZIP prepares in the background while navigation stays available', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  let releaseDownload!: () => void
  const waitForRelease = new Promise<void>(resolve => { releaseDownload = resolve })
  api.set({ 'download.create': async () => { await waitForRelease; return { url: null } } })

  const dialog = page.getByRole('dialog', { name: 'Download products', exact: true })
  await expect(dialog.getByRole('button', { name: 'Download all' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Download all' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => api.count('download.create')).toBe(1)
  await expect(page.getByText('Preparing your download… You can keep browsing.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preparing download — open downloads' })).toBeVisible()

  await page.getByRole('link', { name: 'Autumn essentials', exact: true }).click()
  await expect(page).toHaveURL(/\/collections\/campaign(?:\?|$)/)
  await expect(page.getByText('Preparing your download… You can keep browsing.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preparing download — open downloads' })).toBeVisible()

  releaseDownload()
  await expect(page.getByText('We’ll email your download link when it’s ready.')).toBeVisible()
  await expect(page.getByText('Preparing your download… You can keep browsing.')).toHaveCount(0)
})

test('a ready archive appears in the top bar and opens downloads', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  await expect.poll(() => api.count('download.list') > 0).toBe(true)
  let archiveReady = false
  const archive = {
    id: 'archive-1', status: 'ready', downloadType: 'email', fileCount: 1, recordCount: 2,
    url: '/archive.zip', createdAt: '2026-09-23T10:00:00Z', updatedAt: '2026-09-23T10:00:00Z', expiresAt: '2026-09-30T10:00:00Z',
  }
  api.set({
    'download.list': () => archiveReady ? [archive] : [],
    'download.create': () => { archiveReady = true; return { url: null } },
  })

  const dialog = page.getByRole('dialog', { name: 'Download products', exact: true })
  await dialog.getByLabel('Email me a link').check()
  await dialog.getByRole('button', { name: 'Email files and Excel' }).click()
  const readyButton = page.getByRole('button', { name: 'Download ready — open downloads' })
  await expect(readyButton).toBeVisible()
  await expect(readyButton).toHaveAttribute('title', 'Download ready')
  await expect(readyButton.locator('.download-status__dot')).toBeVisible()
  await readyButton.click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Downloads' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(readyButton).toBeVisible()
  await expect(readyButton.locator('.download-status__dot')).toHaveCount(0)
  await readyButton.click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Downloads' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(readyButton).toBeVisible()
})

test('a direct ZIP also remains available from the top bar', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  await expect.poll(() => api.count('download.list') > 0).toBe(true)
  let archiveReady = false
  const archive = {
    id: 'archive-direct', status: 'ready', downloadType: 'direct', fileCount: 1, recordCount: 2,
    url: '/archive.zip', createdAt: '2026-09-23T10:00:00Z', updatedAt: '2026-09-23T10:00:00Z', expiresAt: '2026-09-30T10:00:00Z',
  }
  api.set({
    'download.list': () => archiveReady ? [archive] : [],
    'download.create': () => { archiveReady = true; return { url: '/archive.zip' } },
  })
  await page.route('**/archive.zip', route => route.fulfill({
    body: 'PK', headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="archive.zip"' },
  }))

  const downloaded = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Download products', exact: true }).getByRole('button', { name: 'Download all' }).click()
  expect((await downloaded).suggestedFilename()).toBe('archive.zip')
  await expect(page.getByRole('button', { name: 'Download ready — open downloads' })).toBeVisible()
})

test('a failed combined ZIP replaces the progress notification with an error', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  api.set({ 'download.create': serverError('Could not prepare the download.') })

  const dialog = page.getByRole('dialog', { name: 'Download products', exact: true })
  await dialog.getByRole('button', { name: 'Download all' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Could not prepare the download.')).toBeVisible()
  await expect(page.getByText('Preparing your download… You can keep browsing.')).toHaveCount(0)
})

test('multiple products start on the configured main view and can clear or select all views', async ({ page, mockTrpc }) => {
  await fixture(page, mockTrpc, { products: 2, mainView: '01' })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('01', { exact: true })).toBeChecked()
  await expect(dialog.getByLabel('00', { exact: true })).not.toBeChecked()
  await expect(dialog.locator('.download-preview .download-file')).toHaveCount(2)
  await expect(dialog.locator('.download-views .view-actions button')).toHaveText('Select all')
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await expect(dialog.locator('.download-views .view-actions button')).toHaveText('Remove all')
  await dialog.getByRole('button', { name: 'Remove all' }).click()
  await expect(dialog.locator('.download-preview .download-file')).toHaveCount(0)
  await expect(dialog.locator('.download-views .view-actions button')).toHaveText('Select all')
  await expect(dialog.getByRole('button', { name: 'Download files' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await expect(dialog.locator('.download-preview .download-file')).toHaveCount(3)
  await dialog.getByLabel('00', { exact: true }).uncheck()
  await expect(dialog.locator('.download-views .view-actions button')).toHaveText('Select all')
})

test('combined ZIP can contain a CSV list and only chosen files', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 2 })
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Products' }).click()
  await dialog.getByLabel('CSV .csv').check()
  await dialog.getByRole('tab', { name: 'Files' }).click()
  await dialog.getByLabel('Email me a link').check()
  await dialog.getByRole('button', { name: 'Select all' }).click()
  await dialog.getByLabel('Include Botanical — Front.jpg').uncheck()
  await dialog.getByRole('button', { name: 'Email files and CSV' }).click()
  await expect.poll(() => api.count('download.create')).toBe(1)
  expect(api.inputs('download.create')[0].recordExport).toEqual({
    items: [{ type: 'record', id: 'product-0' }, { type: 'record', id: 'product-1' }],
    columns: ['recordKey', 'name', 'season'], format: 'csv',
  })
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toEqual(['file-0', 'file-2'])
})

test('a product without files still opens the single gallery and closes with Escape', async ({ page, mockTrpc }) => {
  await fixture(page, mockTrpc, { products: 1, noFiles: true })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog.getByText('No files for this product.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Download 0 files' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('a single selected file uses the same gallery without product view controls', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(page, mockTrpc, { singleFile: true })
  const dialog = page.getByRole('dialog', { name: 'Campaign — Sand.jpg', exact: true })
  await expect(dialog).toHaveClass(/gallery-modal/)
  expect(await dialog.locator('.gallery-modal__header').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(50)
  await expect(dialog.locator('.gallery-modal__footer')).toBeVisible()
  await expect(dialog.getByRole('group', { name: 'Views to download' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  await shot('single-file-download')
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toEqual(['file-0'])
})

test('single product controls and gallery remain usable at the narrowest desktop width', async ({ page, mockTrpc, shot }) => {
  await page.setViewportSize({ width: 768, height: 844 })
  await fixture(page, mockTrpc, { products: 1 })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: 'Download 1 file' }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Download 1 file' })).toBeInViewport()
  await shot('single-product-mobile')
})


test('single product views follow settings and a failed load can be retried', async ({ page, mockTrpc }) => {
  const api = await fixture(page, mockTrpc, { products: 1, views: false, fail: true })
  await page.getByRole('dialog').getByRole('button', { name: 'Try again' }).click()
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog.getByRole('group', { name: 'Views to download' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Download 4 files', exact: true }).click()
  await expect.poll(() => api.inputs('download.create')[0]?.collectionFileIds).toHaveLength(4)
})
