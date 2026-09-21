import { expect, test } from '@playwright/test'
import { fixture, importCsv } from './records-fixtures'

const shot = (name: string) => process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/${name}.png` : undefined

test('a CSV is mapped, reviewed as changes and imported', async ({ page }) => {
  const { errors, calls } = await fixture(page)
  await page.goto('/admin/data-enrichment/records/import')
  await expect(page.getByRole('heading', { name: 'Import products' })).toBeVisible()
  await page.screenshot({ path: shot('import-file') })

  await page.getByLabel('Choose a CSV file').setInputFiles({ name: 'catalogue.csv', mimeType: 'text/csv', buffer: Buffer.from(importCsv) })
  await expect(page.getByText('4 rows · 5 columns')).toBeVisible()
  await expect(page.getByLabel('Column holding the SKU')).toBeDisabled()
  await expect(page.getByText('1 row has no value in this column')).toBeVisible()
  await expect(page.getByLabel('Import Name into')).toHaveValue('name')
  await expect(page.getByLabel('Import Supplier into')).toHaveValue('Supplier')
  await page.getByLabel('Import Colour into').selectOption('name')
  await expect(page.getByText('Name already goes into name.')).toBeVisible()
  await page.getByLabel('Import Colour into').selectOption('colour')
  await page.screenshot({ path: shot('import-columns'), fullPage: true })

  await page.getByRole('button', { name: 'Compare with stored products' }).click()
  await expect.poll(() => calls.find(call => call.name === 'record.compareCsv')?.input).toEqual({
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
  await page.screenshot({ path: shot('import-review'), fullPage: true })
  await page.getByRole('button', { name: /Not imported/ }).click()
  await expect(page.getByText('Price must be a number.')).toBeVisible()
  await expect(page.getByText('Linen shirt')).toHaveCount(0)

  await page.getByRole('button', { name: 'Import 2 rows' }).click()
  await expect(page.getByRole('heading', { name: 'Import finished' })).toBeVisible()
  const imported = calls.find(call => call.name === 'record.importCsv')?.input as { data: { SKU: string }[] }
  expect(imported.data.map(row => row.SKU)).toEqual(['WX5678-100', 'WX9999-001'])
  await expect(page.getByText('1 product created, 1 updated. 2 rows were left out.')).toBeVisible()
  await page.screenshot({ path: shot('import-done') })
  expect(errors).toEqual([])
})
