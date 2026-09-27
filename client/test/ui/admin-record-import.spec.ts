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
import { readFileSync } from 'node:fs'
import { importCsv, recordsApi, tables } from './lib/records'
import { expect, test } from './lib/trpc'

test('a CSV is mapped, reviewed as changes and imported', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records/import')
  await expect(page.getByRole('heading', { name: 'Import products' })).toBeVisible()
  await shot('import-file')

  await page.getByLabel('Choose a CSV or Excel file').setInputFiles({ name: 'catalogue.csv', mimeType: 'text/csv', buffer: Buffer.from(importCsv) })
  await expect(page.getByLabel('Table for catalogue')).toHaveValue(tables[0].id)
  await page.getByRole('button', { name: 'Choose the columns' }).click()
  await expect(page.getByText('4 rows · 5 columns')).toBeVisible()
  await expect(page.getByLabel('Column holding the SKU')).toBeDisabled()
  await expect(page.getByText('1 row has no value in this column')).toBeVisible()
  await expect(page.getByLabel('Import Name into')).toHaveValue('name')
  await expect(page.getByLabel('Import Supplier into')).toHaveValue('Supplier')
  await page.getByLabel('Import Colour into').selectOption('name')
  await expect(page.getByText('Name already goes into name.')).toBeVisible()
  await page.getByLabel('Import Colour into').selectOption('colour')
  await shot('import-columns', { fullPage: true })

  await page.getByRole('button', { name: 'Compare with stored products' }).click()
  await expect.poll(() => api.inputs('record.compareCsv')[0]).toEqual({
    tableId: tables[0].id,
    keyColumnName: 'SKU',
    data: [
      { SKU: 'WX5678-100', name: 'Canvas tote', colour: 'Sand', price: '49', Supplier: 'Acme' },
      { SKU: 'WX5678-200', name: 'Wool scarf', colour: 'Moss', price: 'cheap', Supplier: 'Acme' },
      { SKU: 'WX9999-001', name: 'Linen shirt', colour: 'Ink', price: '59' },
      { SKU: '', name: 'Orphan' },
    ],
  })
  await expect(page.getByText('created as text: Supplier')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import 2 rows' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Apply the changes to WX5678-100' }).click()
  await expect(page.getByRole('button', { name: 'Import 1 row' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Apply every change' }).click()
  await expect(page.getByRole('button', { name: 'Import 2 rows' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Apply every change' }).click()
  await expect(page.getByText('1 new · 0 of 1 change applied')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Apply every change' }).click()
  await expect(page.getByRole('button', { name: 'Import 2 rows' })).toBeVisible()
  await shot('import-review', { fullPage: true })
  await page.getByRole('button', { name: /Not imported/ }).click()
  await expect(page.getByText('Price must be a number.')).toBeVisible()
  await expect(page.getByText('Linen shirt')).toHaveCount(0)

  await page.getByRole('button', { name: 'Import 2 rows' }).click()
  await expect(page.getByRole('heading', { name: 'Import finished' })).toBeVisible()
  const imported = api.inputs('record.importCsv')[0] as { tableId: string, data: { SKU: string }[] }
  expect(imported.data.map(row => row.SKU)).toEqual(['WX5678-100', 'WX9999-001'])
  expect(imported.tableId).toBe(tables[0].id)
  await expect(page.getByText('1 product created, 1 updated. 2 rows were left out.')).toBeVisible()
  await shot('import-done')
})

// Each sheet of a workbook becomes a new table named after it, numbered when
// a table has the name, and goes through its own columns and review.
test('an Excel workbook imports each sheet into a table of its own', async ({ page, mockTrpc }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records/import')
  await page.getByLabel('Choose a CSV or Excel file').setInputFiles({ name: 'catalogue.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync(new URL('./fixtures/two-sheets.xlsx', import.meta.url)) })
  await expect(page.getByText('2 sheets', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Name of the new table for Shoes')).toHaveValue('Shoes')
  await expect(page.getByLabel('Name of the new table for Apparel')).toHaveValue('Apparel (1)')
  await page.getByRole('button', { name: 'Choose the columns' }).click()

  await expect(page.getByText('Sheet 1 of 2')).toBeVisible()
  await expect(page.getByLabel('Import Colour into')).toHaveValue('colour')
  await expect(page.getByLabel('Import Size into')).toHaveValue('Size')
  await page.getByRole('button', { name: 'Compare with stored products' }).click()
  await expect.poll(() => api.inputs('record.compareCsv')[0]).toMatchObject({ data: [{ SKU: 'SH-001', colour: 'Sand', Size: '42' }, { SKU: 'SH-002', colour: 'Ink', Size: '43' }] })
  await page.getByRole('button', { name: /^Import \d+ rows?$/ }).click()
  await expect.poll(() => api.inputs('recordTable.create')[0]).toEqual({ name: 'Shoes' })
  await expect.poll(() => api.inputs('record.importCsv')[0]?.tableId).toBe('00000000-0000-4000-8000-0000000000a3')

  await expect(page.getByText('Sheet 2 of 2')).toBeVisible()
  await page.getByRole('button', { name: 'Skip this sheet' }).click()
  await expect(page.getByRole('heading', { name: 'Import finished' })).toBeVisible()
  expect(api.count('recordTable.create')).toBe(1)
})
