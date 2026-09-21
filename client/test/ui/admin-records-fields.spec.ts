import { expect, test } from '@playwright/test'
import { fixture } from './records-fixtures'

const shot = (name: string) => process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/${name}.png` : undefined

test('record fields are managed from the records page, file metadata on its own page', async ({ page }) => {
  const { errors, calls } = await fixture(page)
  await page.goto('/admin/data-enrichment/records')
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Manage fields' }).click()
  const sheet = page.getByRole('dialog', { name: 'Product fields' })
  await expect(sheet).toBeVisible()
  await expect(page).toHaveURL(/fields=1/)
  await page.screenshot({ path: shot('fields-sheet') })

  await sheet.getByRole('checkbox', { name: 'Name: a filter in the dam search' }).click()
  await expect.poll(() => calls.find(call => call.name === 'recordAttribute.update')?.input).toEqual({ id: 'f-name', facetable: true })
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
  await page.screenshot({ path: shot('file-metadata') })
  expect(errors).toEqual([])
})
