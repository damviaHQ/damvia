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
import { records, recordsApi, tables } from './lib/records'
import { conflict, expect, test } from './lib/trpc'

// A catalogue admin edits in the grid like a spreadsheet and opens a record
// as a card with its fields, its pictures and its history.
test('records are edited in the grid and opened as a card', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid', { name: 'product list' })
  await expect(grid.locator('[data-cell="0-1"]')).toContainText('WX5678-100')
  await expect(grid.locator('.record-value.is-invalid')).toHaveText(/n\/a/)
  await shot('records-grid')

  const nameCell = grid.locator('[data-cell="0-2"]')
  await nameCell.click()
  await page.keyboard.type('Tote bag')
  await page.keyboard.press('Enter')
  await expect.poll(() => api.inputs('record.patch')[0]).toEqual({ id: records[0].id, values: { name: 'Tote bag' }, source: 'grid' })
  await expect(page.getByText('Name of WX5678-100 updated')).toBeVisible()

  const colourCell = grid.locator('[data-cell="1-3"]')
  await colourCell.click()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox', { name: 'Colour' })).toBeVisible()
  await shot('records-select')
  await page.keyboard.press('Escape')

  await grid.getByRole('button', { name: 'Open WX5678-100' }).click()
  const card = page.getByRole('dialog')
  await expect(card.getByRole('heading', { name: 'WX5678-100' })).toBeVisible()
  await expect(page).toHaveURL(/record=00000000-0000-4000-8000-000000000001/)
  await expect(card.getByRole('textbox', { name: 'Name' })).toHaveValue('Canvas tote')
  await shot('records-card')
  await card.getByRole('button', { name: 'Edit the field Colour' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Colour' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Edit Colour' })).toHaveCount(0)
  await expect(card.getByRole('heading', { name: 'WX5678-100' })).toBeVisible()
  await card.getByRole('button', { name: 'Add a field' }).click()
  await expect(page.getByRole('dialog', { name: 'Add a field' })).toBeVisible()
  await page.keyboard.press('Escape')
  await card.getByRole('tab', { name: /Files/ }).click()
  await expect(card.getByText('WX5678-100.02.jpg')).toBeVisible()
  await expect(card.getByText('Covering the range')).toBeVisible()
  await shot('records-files')
  await card.getByRole('tab', { name: 'History' }).click()
  await expect(card.getByText('Changed in the grid')).toBeVisible()
  await shot('records-history')
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/record=/)
})

test('filters, columns, bulk actions and fields are one click away', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  await expect(page.getByRole('heading', { name: 'Products', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()
  await page.getByLabel('Field of filter 1').selectOption('colour')
  await page.getByRole('dialog').getByText('Forest').click()
  await expect.poll(() => api.last('record.list')).toMatchObject({ filters: [{ column: 'colour', op: 'has_any', values: ['Forest'] }] })
  await shot('records-filters')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Columns' }).click()
  await expect(page.getByRole('checkbox', { name: 'Launch' })).toBeChecked()
  await shot('records-columns')
  await page.getByRole('checkbox', { name: 'Launch' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('grid').getByRole('button', { name: 'Launch' })).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'Select WX5678-100' }).click()
  await page.getByRole('checkbox', { name: 'Select WX5678-200' }).click()
  await expect(page.getByRole('region', { name: '2 selected' })).toBeVisible()
  await shot('records-bulk')
  await page.getByRole('button', { name: 'Set a field' }).click()
  await expect(page.getByRole('dialog', { name: 'Set a field on 2 products' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Add a field' }).click()
  await expect(page.getByRole('dialog', { name: 'Add a field' })).toBeVisible()
  await page.getByLabel('Type').click()
  await page.getByRole('option', { name: 'Single select' }).click()
  await expect(page.getByRole('group', { name: 'Options' })).toBeVisible()
  await shot('records-field')
})

// Add product opens the card empty: the key and the values are typed there and
// nothing exists until Save. A taken key is refused inside the card.
test('a column menu opens the filters on that field, and the picture column filters by picture', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid', { name: 'product list' })
  await expect(grid.locator('[data-cell="2-0"] .record-picture-placeholder')).toBeVisible()

  await grid.getByRole('button', { name: 'Colour' }).click()
  await page.getByRole('menuitem', { name: 'Filter by this field' }).click()
  const filters = page.getByRole('dialog')
  await expect(filters.getByLabel('Field of filter 1')).toHaveValue('colour')
  await expect(filters.getByText('Forest')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/admin/data-enrichment/records')
  await grid.getByRole('button', { name: 'Picture column' }).click()
  await page.getByRole('menuitem', { name: 'Filter by picture' }).click()
  await expect(filters.getByLabel('Field of filter 1')).toHaveValue('@picture')
  await expect.poll(() => api.last('record.list')).toMatchObject({ filters: [{ column: '@picture', op: 'is_not_empty' }] })
  await filters.getByLabel('Condition of filter 1').selectOption({ label: 'has no picture' })
  await expect.poll(() => api.last('record.list')).toMatchObject({ filters: [{ column: '@picture', op: 'is_empty' }] })
  await shot('records-picture-filter')
})

// Empty fields are offered the value records with a look-alike key agree on,
// one by one or all at once.
test('the card offers the values similar products agree on', async ({ page, mockTrpc, shot }) => {
  const detail = recordsApi['record.get']
  const api = await mockTrpc({
    ...recordsApi,
    'record.get': { ...detail, metaData: { SKU: 'WX5678-100', name: 'Canvas tote' } },
    'record.suggestions': [
      { recordId: records[0].id, field: 'price', value: '49', support: 2, example: 'WX5678-200' },
      { recordId: records[0].id, field: 'story', value: 'Made in Porto.', support: 1, example: 'WX5678-200' },
    ],
  }, { role: 'admin' })
  await page.goto(`/admin/data-enrichment/records?record=${records[0].id}`)
  const card = page.getByRole('dialog')
  await expect(card.getByText('Same as WX5678-200 and 1 more:')).toBeVisible()
  await shot('records-suggestions')
  await card.getByRole('button', { name: 'Use 49 for Price' }).click()
  await expect.poll(() => api.inputs('record.patch')[0]).toEqual({ id: records[0].id, values: { price: '49' }, source: 'panel' })
  await card.getByRole('button', { name: 'Fill 2 fields' }).click()
  await expect.poll(() => api.inputs('record.patch')[1]).toEqual({ id: records[0].id, values: { price: '49', story: 'Made in Porto.' }, source: 'panel' })
})

test('a filter value offers the values the field already holds', async ({ page, mockTrpc }) => {
  await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()
  await page.getByLabel('Field of filter 1').selectOption('name')
  await page.getByLabel('Value of filter 1').focus()
  const list = await page.getByLabel('Value of filter 1').getAttribute('list')
  await expect(page.locator(`datalist[id="${list}"] option`)).toHaveCount(3)
  await expect(page.locator(`datalist[id="${list}"] option`).first()).toHaveAttribute('value', 'Canvas tote')
})

test('a product is created from the card', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    ...recordsApi,
    'record.create': { ...records[0], id: '00000000-0000-4000-8000-0000000000aa', recordKey: 'NEW-1' },
  }, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  await page.getByRole('button', { name: 'Add product' }).click()
  const card = page.getByRole('dialog')
  const save = card.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled()
  await card.getByRole('textbox', { name: 'Key' }).fill('NEW-1')
  await card.getByRole('textbox', { name: 'Name' }).fill('Beanie')
  await save.click()
  await expect.poll(() => api.inputs('record.create')[0]).toMatchObject({ recordKey: 'NEW-1', values: { name: 'Beanie' } })
  await expect(page).toHaveURL(/record=00000000-0000-4000-8000-0000000000aa/)
})

test('a taken key is refused in the card', async ({ page, mockTrpc }) => {
  await mockTrpc({ ...recordsApi, 'record.create': conflict('A record with key WX5678-200 already exists.') }, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  await page.getByRole('button', { name: 'Add product' }).click()
  const card = page.getByRole('dialog')
  await card.getByRole('textbox', { name: 'Key' }).fill('WX5678-200')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByRole('alert')).toContainText('already exists')
})

// Columns moved before the key stay frozen with it, and a picture moved after
// it scrolls away; nothing slides under the frozen columns.
test('frozen columns follow the column order', async ({ page, mockTrpc }) => {
  await page.addInitScript(() => localStorage.setItem('damvia_records_grid', JSON.stringify({ order: ['field:name', 'key', 'thumbnail'], hidden: [], widths: {}, sort: null, pageSize: 100, wrap: false })))
  await mockTrpc(recordsApi, { role: 'admin' })
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid', { name: 'product list' })
  await expect(grid.locator('[data-cell="0-1"]')).toContainText('WX5678-100')
  await page.locator('.records-grid-wrap').evaluate(element => { element.scrollLeft = 400 })
  const box = (cell: string) => grid.locator(`[data-cell="${cell}"]`).boundingBox()
  const [name, key, picture] = [await box('0-0'), await box('0-1'), await box('0-2')]
  expect(key!.x).toBeGreaterThanOrEqual(name!.x + name!.width - 1)
  expect(picture!.x + picture!.width).toBeLessThanOrEqual(key!.x + 1)
})

// The frozen line is an entry of the Columns list: what is above it stays put.
test('the frozen line moves in the Columns list', async ({ page, mockTrpc, shot }) => {
  await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid', { name: 'product list' })
  await expect(grid.locator('[data-cell="0-1"]')).toContainText('WX5678-100')
  await expect(grid.locator('[data-cell="0-1"]')).toHaveClass(/is-frozen-edge/)
  await page.getByRole('button', { name: 'Columns' }).click()
  await expect(page.getByRole('checkbox', { name: 'SKU' })).toBeDisabled()
  await page.getByRole('button', { name: 'Move the frozen line up' }).click()
  await expect(grid.locator('[data-cell="0-1"]')).not.toHaveClass(/is-frozen/)
  await expect(grid.locator('[data-cell="0-0"]')).toHaveClass(/is-frozen-edge/)
  await page.getByRole('button', { name: 'Move the frozen line down' }).click()
  await page.getByRole('button', { name: 'Move the frozen line down' }).click()
  await expect(grid.locator('[data-cell="0-2"]')).toHaveClass(/is-frozen-edge/)
  await shot('records-frozen')
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem('damvia_records_grid')!).tables[id].order.slice(0, 4), tables[0].id)).toEqual(['thumbnail', 'key', 'field:name', 'frozen'])
})

// Tables sit as small tabs above the toolbar; the grid scrolls instead of
// paging, with the count under it.
test('tables show as tabs, each with its own list, and records move between them', async ({ page, mockTrpc }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  const tabs = page.getByRole('tablist', { name: 'Tables' })
  await expect(tabs.getByRole('tab', { name: 'Products' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Rows per page')).toHaveCount(0)
  await expect(page.locator('.records-footer')).toContainText('3 products')
  await expect.poll(() => api.last('record.list')).toMatchObject({ tableId: tables[0].id, offset: 0, limit: 200 })

  const grid = page.getByRole('grid', { name: 'product list' })
  await grid.getByRole('checkbox', { name: 'Select WX5678-200' }).click()
  await page.getByRole('button', { name: 'Move to table' }).click()
  await page.getByRole('dialog').getByLabel('Table').selectOption({ label: 'Apparel' })
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click()
  await expect.poll(() => api.inputs('record.moveToTable')[0]).toEqual({ ids: [records[1].id], tableId: tables[1].id })

  await tabs.getByRole('tab', { name: 'Apparel' }).click()
  await expect(page).toHaveURL(new RegExp(`table=${tables[1].id}`))
  await expect(page.getByRole('heading', { name: 'No products in Apparel yet' })).toBeVisible()
  await expect(grid.getByRole('columnheader')).toHaveCount(7)

  await page.getByRole('button', { name: 'Add a table' }).click()
  await page.getByLabel('Name of the new table').fill('Shoes')
  await page.keyboard.press('Enter')
  await expect.poll(() => api.inputs('recordTable.create')[0]).toEqual({ name: 'Shoes' })
})
