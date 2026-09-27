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
import { recordsApi } from './lib/records'
import { expect, test } from './lib/trpc'

test('record fields are managed from the records page, file metadata on its own page', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Manage fields' }).click()
  const sheet = page.getByRole('dialog', { name: 'Product fields' })
  await expect(sheet).toBeVisible()
  await expect(page).toHaveURL(/fields=1/)
  await shot('fields-sheet')

  await sheet.getByRole('checkbox', { name: 'Name: a filter in the dam search' }).click()
  await expect.poll(() => api.last('recordAttribute.update')).toEqual({ id: 'f-name', facetable: true })
  await expect(sheet.getByRole('checkbox', { name: 'Colour: shown on the files of the record' })).toBeDisabled()

  await sheet.getByRole('button', { name: 'Edit Colour' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Colour' })).toBeVisible()
  await page.keyboard.press('Escape')
  await sheet.getByRole('button', { name: 'Add a field' }).click()
  await expect(page.getByRole('dialog', { name: 'Add a field' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/fields=1/)

  await page.goto('/admin/data-enrichment/fields')
  await expect(page.getByRole('dialog', { name: 'Product fields' })).toBeVisible()
  await page.goto('/admin/data-enrichment/fields?tab=metadata')
  await expect(page).toHaveURL(/\/admin\/data-enrichment\/file-metadata$/)
  await expect(page.getByRole('heading', { name: 'File metadata' })).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'File metadata' })).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Fields', exact: true })).toHaveCount(0)
  await shot('file-metadata')
})
