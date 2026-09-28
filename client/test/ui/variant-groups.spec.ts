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
import { collection as source } from './lib/fixtures'
import { expect, test, type MockTrpc } from './lib/trpc'

// Botanical — Front (the cover) and Essentials — Detail are two variants in
// this collection; Launch — EN is a third one, listed from another collection.
const summary = { id: 'launch', displayName: 'Launch', memberCount: 3, status: 'up_to_date', coverFileId: 'asset-1' }
const files = source.files.map((file, index) => ({ ...file, assetFileId: `asset-${index}`, variantGroup: [1, 2].includes(index) ? { ...summary, cover: index === 1 } : null }))
const remote = { ...files[3], id: 'elsewhere', assetFileId: 'asset-remote', name: 'Launch — EN.jpg', collectionId: 'other', variantGroup: null }
const group = {
  ...summary, forced: false, overrides: [],
  axes: [{ position: 0, id: 'language', name: 'Language', recognizer: 'language', label: 'Language' }],
  members: [
    // The server may list a variant from another collection than this one.
    { ...files[1], id: 'other-copy-of-1', axisValues: ['fr'], status: 'up_to_date' },
    { ...files[2], axisValues: ['de'], status: 'up_to_date' },
    { ...remote, axisValues: ['en'], status: 'up_to_date' },
  ],
}

function fixture(mockTrpc: MockTrpc) {
  return mockTrpc({ 'collection.findById': { ...source, files }, 'variantGroup.findById': group })
}

test('the label opens every variant in a band under the row, where they are selected one by one or all at once', async ({ page, mockTrpc, shot }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  const label = page.getByRole('button', { name: 'Show the 3 variants of Launch', exact: true })
  await expect(page.getByRole('button', { name: 'Preview Essentials — Detail.jpg', exact: true })).toHaveCount(0)
  await label.click()
  await expect(label).toHaveAttribute('aria-expanded', 'true')
  const band = page.getByRole('region', { name: 'Launch, 3 variants' })
  await expect(band).toBeVisible()
  await expect(band.getByRole('button', { name: /^Preview / })).toHaveCount(3)
  for (const value of ['fr', 'de', 'en']) await expect(band.getByTitle('Language').getByText(value, { exact: true })).toBeVisible()

  // Under the row of the card, never inside it.
  const card = (await page.getByRole('article').getByRole('button', { name: 'Preview Botanical — Front.jpg', exact: true }).boundingBox())!
  const bandBox = (await band.boundingBox())!
  expect(bandBox.y).toBeGreaterThan(card.y + card.height)
  const nextRow = (await page.getByRole('button', { name: 'Preview Studio — Hero.jpg', exact: true }).boundingBox())!
  expect(nextRow.y).toBeGreaterThan(bandBox.y + bandBox.height)
  await shot('variant-band')

  await band.getByRole('button', { name: 'Select all 3', exact: true }).click()
  for (const name of ['Botanical — Front.jpg', 'Essentials — Detail.jpg', 'Launch — EN.jpg']) await expect(band.getByRole('checkbox', { name: `Select ${name}`, exact: true })).toBeChecked()
  const cardBox = page.getByRole('checkbox', { name: 'Select all 3 variants of Launch', exact: true })
  await expect(cardBox).toBeChecked()
  await band.getByRole('checkbox', { name: 'Select Launch — EN.jpg', exact: true }).click()
  await expect(cardBox).toHaveAttribute('aria-checked', 'mixed')
  await expect(page.getByRole('button', { name: 'Show the 3 variants of Launch', exact: true })).toHaveText('2 of 3 selected')
  await band.getByRole('button', { name: 'Close variants', exact: true }).click()
  await expect(band).toHaveCount(0)
  await expect(label).toHaveAttribute('aria-expanded', 'false')
})

test('the checkbox of a closed card takes the whole group, and takes it back', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  const cardBox = page.getByRole('checkbox', { name: 'Select all 3 variants of Launch', exact: true })
  await cardBox.click()
  await expect(cardBox).toBeChecked()
  await page.getByRole('button', { name: 'Show the 3 variants of Launch', exact: true }).click()
  const band = page.getByRole('region', { name: 'Launch, 3 variants' })
  // The card and the band hold the same entries, not a second copy of the cover.
  await expect(band.getByRole('checkbox', { checked: true })).toHaveCount(3)
  await cardBox.click()
  await expect(band.getByRole('checkbox', { checked: true })).toHaveCount(0)
})

test('the preview of a cover walks through its variants before the next card', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Preview Botanical — Front.jpg', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Botanical — Front.jpg')
  for (const name of ['Essentials — Detail.jpg', 'Launch — EN.jpg', 'Studio — Edition.jpg']) {
    await dialog.getByRole('button', { name: 'Next file', exact: true }).click()
    await expect(dialog).toContainText(name)
  }
})
