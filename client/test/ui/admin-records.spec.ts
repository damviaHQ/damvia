import { expect, test } from '@playwright/test'
import { fixture, records, tables } from './records-fixtures'

// A catalogue admin edits in the grid like a spreadsheet and opens a record
// as a card with its fields, its pictures and its history.
test('records are edited in the grid and opened as a card', async ({ page }) => {
  const { errors, calls } = await fixture(page)
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid', { name: 'product list' })
  await expect(grid.locator('[data-cell="0-1"]')).toContainText('WX5678-100')
  await expect(grid.locator('.record-value.is-invalid')).toHaveText(/n\/a/)
  await page.screenshot({ path: process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/records-grid.png` : undefined, fullPage: false })

  const nameCell = grid.locator('[data-cell="0-2"]')
  await nameCell.click()
  await page.keyboard.type('Tote bag')
  await page.keyboard.press('Enter')
  await expect.poll(() => calls.find(call => call.name === 'record.patch')?.input).toEqual({ id: records[0].id, values: { name: 'Tote bag' }, source: 'grid' })
  await expect(page.getByText('Name of WX5678-100 updated')).toBeVisible()

  const colourCell = grid.locator('[data-cell="1-3"]')
  await colourCell.click()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox', { name: 'Colour' })).toBeVisible()
  await page.screenshot({ path: process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/records-select.png` : undefined })
  await page.keyboard.press('Escape')

  await grid.getByRole('button', { name: 'Open WX5678-100' }).click()
  const card = page.getByRole('dialog')
  await expect(card.getByRole('heading', { name: 'WX5678-100' })).toBeVisible()
  await expect(page).toHaveURL(/record=00000000-0000-4000-8000-000000000001/)
  await expect(card.getByRole('textbox', { name: 'Name' })).toHaveValue('Canvas tote')
  await page.screenshot({ path: process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/records-card.png` : undefined })
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
  await page.screenshot({ path: process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/records-files.png` : undefined })
  await card.getByRole('tab', { name: 'History' }).click()
  await expect(card.getByText('Changed in the grid')).toBeVisible()
  await page.screenshot({ path: process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/records-history.png` : undefined })
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/record=/)
  expect(errors).toEqual([])
})

test('filters, columns, bulk actions and fields are one click away', async ({ page }) => {
  const { errors, calls } = await fixture(page)
  const shot = (name: string) => page.screenshot({ path: process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/${name}.png` : undefined })
  await page.goto('/admin/data-enrichment/records')
  await expect(page.getByRole('heading', { name: 'Products', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()
  await page.getByLabel('Field of filter 1').selectOption('colour')
  await page.getByRole('dialog').getByText('Forest').click()
  await expect.poll(() => calls.filter(call => call.name === 'record.list').at(-1)?.input).toMatchObject({ filters: [{ column: 'colour', op: 'has_any', values: ['Forest'] }] })
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
  expect(errors).toEqual([])
})

// Typing a key that exists links to its row, wherever it falls in the list,
// and only the grid scrolls, never the page around it.
test('an existing key jumps to its row', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.route('**/trpc/record.create*', route => route.fulfill({ status: 409, json: { error: { message: 'A record with key WX5678-200 already exists.', code: -32009, data: { code: 'CONFLICT', httpStatus: 409 } } } }))
  await page.route('**/trpc/record.locate*', route => route.fulfill({ json: { result: { data: { id: records[1].id, tableId: tables[0].id, position: 1 } } } }))
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid', { name: 'product list' })
  await expect(grid.locator('[data-cell="0-1"]')).toContainText('WX5678-100')
  expect(await page.locator('#admin-content').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)

  await grid.getByRole('textbox', { name: 'SKU of a new product' }).fill('WX5678-200')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible()
  await page.getByRole('button', { name: 'Go to WX5678-200' }).click()
  await expect(grid.locator('[data-cell="1-1"]')).toBeFocused()
  await expect(grid.locator('tr.is-flashed')).toContainText('WX5678-200')
  await expect(page.getByRole('button', { name: 'Go to WX5678-200' })).toHaveCount(0)
  expect(errors).toEqual([])
})

// Columns moved before the key stay frozen with it, and a picture moved after
// it scrolls away; nothing slides under the frozen columns.
test('frozen columns follow the column order', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('damvia_records_grid', JSON.stringify({ order: ['field:name', 'key', 'thumbnail'], hidden: [], widths: {}, sort: null, pageSize: 100, wrap: false })))
  const { errors } = await fixture(page)
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid', { name: 'product list' })
  await expect(grid.locator('[data-cell="0-1"]')).toContainText('WX5678-100')
  await page.locator('.records-grid-wrap').evaluate(element => { element.scrollLeft = 400 })
  const box = (cell: string) => grid.locator(`[data-cell="${cell}"]`).boundingBox()
  const [name, key, picture] = [await box('0-0'), await box('0-1'), await box('0-2')]
  expect(key!.x).toBeGreaterThanOrEqual(name!.x + name!.width - 1)
  expect(picture!.x + picture!.width).toBeLessThanOrEqual(key!.x + 1)
  expect(errors).toEqual([])
})

// The frozen line is an entry of the Columns list: what is above it stays put.
test('the frozen line moves in the Columns list', async ({ page }) => {
  const { errors } = await fixture(page)
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
  await page.screenshot({ path: process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/records-frozen.png` : undefined })
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem('damvia_records_grid')!).tables[id].order.slice(0, 4), tables[0].id)).toEqual(['thumbnail', 'key', 'field:name', 'frozen'])
  expect(errors).toEqual([])
})

// Tables sit as small tabs above the toolbar; the grid scrolls instead of
// paging, with the count under it.
test('tables show as tabs, each with its own list, and records move between them', async ({ page }) => {
  const { errors, calls } = await fixture(page)
  await page.goto('/admin/data-enrichment/records')
  const tabs = page.getByRole('tablist', { name: 'Tables' })
  await expect(tabs.getByRole('tab', { name: 'Products' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Rows per page')).toHaveCount(0)
  await expect(page.locator('.records-footer')).toContainText('3 products')
  await expect.poll(() => calls.filter(call => call.name === 'record.list').at(-1)?.input).toMatchObject({ tableId: tables[0].id, offset: 0, limit: 200 })

  const grid = page.getByRole('grid', { name: 'product list' })
  await grid.getByRole('checkbox', { name: 'Select WX5678-200' }).click()
  await page.getByRole('button', { name: 'Move to table' }).click()
  await page.getByRole('dialog').getByLabel('Table').selectOption({ label: 'Apparel' })
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click()
  await expect.poll(() => calls.find(call => call.name === 'record.moveToTable')?.input).toEqual({ ids: [records[1].id], tableId: tables[1].id })

  await tabs.getByRole('tab', { name: 'Apparel' }).click()
  await expect(page).toHaveURL(new RegExp(`table=${tables[1].id}`))
  await expect(page.getByRole('heading', { name: 'No products in Apparel yet' })).toBeVisible()
  await expect(grid.getByRole('columnheader')).toHaveCount(7)

  await page.getByRole('button', { name: 'Add a table' }).click()
  await page.getByLabel('Name of the new table').fill('Shoes')
  await page.keyboard.press('Enter')
  await expect.poll(() => calls.find(call => call.name === 'recordTable.create')?.input).toEqual({ name: 'Shoes' })
  expect(errors).toEqual([])
})
