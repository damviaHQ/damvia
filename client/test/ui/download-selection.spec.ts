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
import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

async function fixture(page: Page, options: { views?: boolean, noFiles?: boolean, fail?: boolean, products?: number, singleFile?: boolean, licensed?: boolean } = {}) {
  const base = responses['collection.findById'] as any
  const files = options.noFiles ? [] : base.files.slice(0, options.singleFile ? 1 : 4).map((file: any, i: number) => ({ ...file, size: 2400000, recordView: ['00', '01', '01', null][i], license: options.licensed && i === 1 ? { id: 'licence', name: 'Studio usage', details: '<p>Approved use only.</p>', scopes: [] } : null }))
  const calls: { name: string, input: any }[] = []
  let failed = false
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const input = route.request().method() === 'POST' ? route.request().postDataJSON() : null
    calls.push({ name, input })
    if (name === 'collection.getFiles' && options.fail && !failed) {
      failed = true
      await route.fulfill({ status: 500, json: { error: { message: 'Could not load selection.', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } } })
      return
    }
    const data = name === 'collection.getFiles' ? { files, licenses: [], allowDirectDownload: true, viewsEnabled: options.views ?? true, recordCount: options.singleFile ? 0 : options.products ?? 12, columns: [{ id: 'recordKey', label: 'Reference' }, { id: 'name', label: 'Name' }, { id: 'season', label: 'Season' }], previewRows: Array.from({ length: Math.min(options.products ?? 12, 5) }, (_, i) => [`0010${i}`, ['Botanical', 'Essentials', 'Studio'][i % 3], 'Autumn']) }
      : name === 'catalogue.list' ? { products: Array.from({ length: options.products ?? 2 }, (_, i) => ({ id: `product-${i}`, recordKey: `0010${i}`, metaData: { name: 'Botanical' }, thumbnailURL: files[0]?.thumbnailURL ?? null, visuals: [], visualCount: files.length, fileCount: files.length, readiness: { filled: 0, total: 0, ready: true }, family: null })), total: options.products ?? 2, fields: [], cardTitleField: null }
      : name === 'catalogue.facets' ? { total: options.products ?? 2, attributes: [], assetTypes: [], fileTypes: [], extensions: [] }
      : name === 'download.exportRecords' ? { filename: 'records.csv', mimeType: 'text/csv', content: Buffer.from('Reference,Season\r\n00100,Autumn').toString('base64') }
      : name === 'download.create' ? { url: null }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'fixture', domain: '127.0.0.1', path: '/' }])
  if (options.products) {
    await page.goto('/catalogue')
    for (let i = 0; i < options.products; i++) await page.getByRole('checkbox', { name: `Select 0010${i}`, exact: true }).check()
  } else {
    await page.goto('/collections/campaign')
    if (options.singleFile) await page.getByRole('checkbox', { name: 'Select Campaign — Sand.jpg', exact: true }).check()
    else await page.getByRole('button', { name: 'Select All in', exact: true }).click()
  }
  await page.getByTitle('Download selection', { exact: true }).click()
  return calls
}

test('record lists preview and export only chosen columns, with Excel and CSV choices', async ({ page }) => {
  const calls = await fixture(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Product list 12' }).click()
  await expect(dialog.getByLabel('Excel .xlsx')).toBeChecked()
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeDisabled()
  await dialog.getByLabel('Reference', { exact: true }).check()
  await dialog.getByLabel('Season', { exact: true }).check()
  await expect(dialog.getByRole('columnheader')).toHaveText(['Reference', 'Season'])
  await page.screenshot({ path: '/tmp/damvia-download-list.png' })
  await dialog.getByLabel('CSV .csv').check()
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  expect((await downloaded).suggestedFilename()).toBe('products.csv')
  expect(calls.find(call => call.name === 'download.exportRecords')?.input).toMatchObject({ columns: ['recordKey', 'season'], format: 'csv' })
  await expect(dialog).toHaveCount(0)
})

test('excluded files stay in place and can be included again', async ({ page }) => {
  const calls = await fixture(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('View 00', { exact: true }).uncheck()
  await dialog.getByLabel('Unnumbered', { exact: true }).uncheck()
  await expect(dialog.getByRole('heading', { name: '2 files' })).toBeVisible()
  const firstCard = dialog.locator('.download-file').filter({ has: page.getByLabel('Include Botanical — Front.jpg') })
  const position = await firstCard.boundingBox()
  await dialog.getByLabel('Include Botanical — Front.jpg').uncheck()
  await expect(dialog.getByRole('heading', { name: '1 file' })).toBeVisible()
  await expect(firstCard).toHaveClass(/is-excluded/)
  expect(await firstCard.boundingBox()).toEqual(position)
  await expect(dialog.locator('.download-file')).toHaveCount(2)
  await expect(dialog.getByRole('button', { name: 'Restore removed' })).toHaveCount(0)
  await dialog.getByLabel('Include Essentials — Detail.jpg').uncheck()
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeDisabled()
  await expect(dialog.locator('.download-file')).toHaveCount(2)
  await firstCard.getByText('Botanical — Front.jpg', { exact: true }).click()
  await expect(dialog.getByLabel('Include Botanical — Front.jpg')).toBeChecked()
  await expect(firstCard).not.toHaveClass(/is-excluded/)
  await expect(dialog.getByRole('heading', { name: '1 file' })).toBeVisible()
  await page.screenshot({ path: '/tmp/damvia-download-files.png' })
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  expect(calls.find(call => call.name === 'download.create')?.input.collectionFileIds).toEqual(['file-1'])
})

test('views follow settings and the dialog fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, { views: false })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Views', exact: true })).toHaveCount(0)
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: 'Product list 12' }).click()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeInViewport()
  await expect(dialog.getByLabel('Excel .xlsx')).toBeInViewport()
  await expect(dialog.getByLabel('Reference', { exact: true })).toBeInViewport()
  await page.screenshot({ path: '/tmp/damvia-download-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('a failed load can be retried and records without media can still export', async ({ page }) => {
  await fixture(page, { noFiles: true, fail: true })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('Could not load selection.')
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Files 0' }).click()
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeDisabled()
})


test('one product uses the single file gallery and downloads all views even after preview navigation', async ({ page }) => {
  const calls = await fixture(page, { products: 1 })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog).toHaveClass(/gallery-modal/)
  await expect(dialog.getByRole('button', { name: 'Product list' })).toHaveCount(0)
  await expect(dialog.getByText('Botanical', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Next view', exact: true }).click()
  await expect(dialog.locator('.gallery-modal__preview-thumbnail')).toHaveAttribute('alt', 'Botanical — Front.jpg')
  await expect(dialog.getByRole('button', { name: 'Download all views', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Download all views', exact: true })).toHaveCSS('background-color', 'rgb(38, 38, 38)')
  await page.screenshot({ path: '/tmp/damvia-single-product-download.png' })
  await dialog.getByRole('button', { name: 'Download all views', exact: true }).click()
  expect(calls.find(call => call.name === 'collection.getFiles')?.input.items).toEqual([{ type: 'record', id: 'product-0' }])
  expect(calls.find(call => call.name === 'download.create')?.input.collectionFileIds).toEqual(['file-0', 'file-1', 'file-2', 'file-3'])
})

test('one product filters its views and requires only the included usage terms', async ({ page }) => {
  const calls = await fixture(page, { products: 1, licensed: true })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog.getByRole('button', { name: 'Download all views' })).toBeDisabled()
  await dialog.getByLabel('I agree to the usage terms').check()
  await expect(dialog.getByRole('button', { name: 'Download all views' })).toBeEnabled()
  await dialog.getByLabel('View 00', { exact: true }).uncheck()
  await expect(dialog.getByLabel('I agree to the usage terms')).not.toBeChecked()
  await dialog.getByLabel('View 01', { exact: true }).uncheck()
  await dialog.getByLabel('Unnumbered', { exact: true }).uncheck()
  await expect(dialog.getByRole('button', { name: 'Download 0 files', exact: true })).toBeDisabled()
  await dialog.getByLabel('Unnumbered', { exact: true }).check()
  await expect(dialog.getByRole('button', { name: 'Download 1 file', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Download 1 file', exact: true }).click()
  expect(calls.find(call => call.name === 'download.create')?.input.collectionFileIds).toEqual(['file-3'])
})

test('multiple products use the shared full-screen multi-file modal with list export', async ({ page }) => {
  const calls = await fixture(page, { products: 2 })
  const dialog = page.getByRole('dialog', { name: 'Download products', exact: true })
  await expect(dialog).toHaveClass(/download-dialog/)
  const bounds = await dialog.boundingBox()
  expect(bounds?.width).toBe(page.viewportSize()?.width)
  expect(bounds?.height).toBe(page.viewportSize()?.height)
  await dialog.getByRole('button', { name: 'Product list 2' }).click()
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeEnabled()
  expect(calls.find(call => call.name === 'collection.getFiles')?.input.items).toEqual([{ type: 'record', id: 'product-0' }, { type: 'record', id: 'product-1' }])
  await page.screenshot({ path: '/tmp/damvia-multiple-products-download.png' })
  await dialog.getByLabel('CSV .csv').check()
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download CSV' }).click()
  await downloaded
  expect(calls.find(call => call.name === 'download.exportRecords')?.input).toEqual({
    items: [{ type: 'record', id: 'product-0' }, { type: 'record', id: 'product-1' }],
    columns: ['recordKey', 'name', 'season'], format: 'csv',
  })
})

test('a product without files still opens the single gallery and closes with Escape', async ({ page }) => {
  await fixture(page, { products: 1, noFiles: true })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog.getByText('No files for this product.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Download 0 files' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('a single selected file uses the same gallery without product view controls', async ({ page }) => {
  const calls = await fixture(page, { singleFile: true })
  const dialog = page.getByRole('dialog', { name: 'Campaign — Sand.jpg', exact: true })
  await expect(dialog).toHaveClass(/gallery-modal/)
  await expect(dialog.getByRole('group', { name: 'Views to download' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  expect(calls.find(call => call.name === 'download.create')?.input.collectionFileIds).toEqual(['file-0'])
})

test('single product controls and gallery remain usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, { products: 1 })
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: 'Download all views' }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Download all views' })).toBeInViewport()
  await page.screenshot({ path: '/tmp/damvia-single-product-mobile.png' })
})


test('single product views follow settings and a failed load can be retried', async ({ page }) => {
  const calls = await fixture(page, { products: 1, views: false, fail: true })
  await page.getByRole('dialog').getByRole('button', { name: 'Try again' }).click()
  const dialog = page.getByRole('dialog', { name: '00100', exact: true })
  await expect(dialog.getByRole('group', { name: 'Views to download' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Download 4 files', exact: true }).click()
  expect(calls.find(call => call.name === 'download.create')?.input.collectionFileIds).toHaveLength(4)
})
