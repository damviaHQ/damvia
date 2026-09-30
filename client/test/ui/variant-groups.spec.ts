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

test('the label opens the group in place of its cover, on a full line of its own, where variants are selected one by one or all at once', async ({ page, mockTrpc, shot }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  const label = page.getByRole('button', { name: 'Show the 3 variants of Launch', exact: true })
  await expect(page.getByRole('button', { name: 'Preview Essentials — Detail.jpg', exact: true })).toHaveCount(0)
  const before = (await page.getByRole('button', { name: 'Preview Campaign — Sand.jpg', exact: true }).boundingBox())!
  await label.click()
  const band = page.getByRole('region', { name: 'Launch, 3 variants' })
  await expect(band).toBeVisible()
  // The cover is inside the band, never shown twice.
  await expect(label).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preview Botanical — Front.jpg', exact: true })).toHaveCount(1)
  await expect(band.getByRole('button', { name: /^Preview / })).toHaveCount(3)

  // The band takes a line of its own, as wide as the cards: the card before the
  // cover keeps its place, the one after it moves below the band.
  const bandBox = (await band.boundingBox())!
  const sand = (await page.getByRole('button', { name: 'Preview Campaign — Sand.jpg', exact: true }).boundingBox())!
  expect(sand).toEqual(before)
  expect(bandBox.y).toBeGreaterThan(sand.y + sand.height)
  expect(Math.abs(bandBox.x - (sand.x - 12))).toBeLessThan(4)
  // Its variants are cards of the same size, starting under the first column.
  const cover = (await band.getByRole('button', { name: 'Preview Botanical — Front.jpg', exact: true }).boundingBox())!
  expect([cover.x, cover.height, cover.width]).toEqual([sand.x, sand.height, sand.width])
  const following = (await page.getByRole('button', { name: 'Preview Studio — Edition.jpg', exact: true }).boundingBox())!
  expect(following.y).toBeGreaterThan(bandBox.y + bandBox.height)
  await shot('variant-band')

  await band.getByRole('checkbox', { name: 'Select all 3 variants', exact: true }).click()
  for (const name of ['Botanical — Front.jpg', 'Essentials — Detail.jpg', 'Launch — EN.jpg']) await expect(band.getByRole('checkbox', { name: `Select ${name}`, exact: true })).toBeChecked()
  await band.getByRole('checkbox', { name: 'Select Launch — EN.jpg', exact: true }).click()
  await band.getByRole('button', { name: 'Close variants', exact: true }).click()
  await expect(band).toHaveCount(0)
  await expect(label).toHaveAttribute('aria-expanded', 'false')
  await expect(label).toHaveText('2 of 3 selected')
  await expect(page.getByRole('checkbox', { name: 'Select all 3 variants of Launch', exact: true })).toHaveAttribute('aria-checked', 'mixed')
})

test('the checkbox of a closed card takes the whole group, and takes it back', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  const cardBox = page.getByRole('checkbox', { name: 'Select all 3 variants of Launch', exact: true })
  const label = page.getByRole('button', { name: 'Show the 3 variants of Launch', exact: true })
  const band = page.getByRole('region', { name: 'Launch, 3 variants' })
  await cardBox.click()
  await expect(cardBox).toBeChecked()
  await label.click()
  // The card and the band hold the same entries, not a second copy of the cover.
  await expect(band.getByRole('checkbox', { name: /^Select .*\.jpg$/, checked: true })).toHaveCount(3)
  await band.getByRole('button', { name: 'Close variants', exact: true }).click()
  await cardBox.click()
  await expect(cardBox).not.toBeChecked()
  await label.click()
  await expect(band.getByRole('checkbox', { name: /^Select .*\.jpg$/, checked: true })).toHaveCount(0)
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

test('in the list, an open group becomes a header with every variant listed under it, whatever the sort', async ({ page, mockTrpc }) => {
  await page.addInitScript(type => localStorage.setItem('dam_display_preferences', JSON.stringify({ [type]: 'list' })), files[0].assetType.id)
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  const names = () => page.locator('.collection-list-files__filename').allTextContents()
  await expect.poll(names).toEqual(['Campaign — Sand.jpg', 'Botanical — Front.jpg', 'Studio — Edition.jpg', 'Campaign — Packaging.jpg', 'Botanical — Collection.jpg', 'Essentials — Natural.jpg', 'Studio — Hero.jpg'])
  await page.getByRole('button', { name: 'Show the 3 variants of Launch', exact: true }).click()
  // The label said three variants: the three files are listed, the cover among them.
  const hide = page.getByRole('button', { name: 'Hide the 3 variants of Launch', exact: true })
  await expect(hide).toBeVisible()
  await expect(page.getByRole('row').filter({ has: hide })).toContainText('Launch')
  await expect.poll(names).toEqual(['Campaign — Sand.jpg', 'Botanical — Front.jpg', 'Essentials — Detail.jpg', 'Launch — EN.jpg', 'Studio — Edition.jpg', 'Campaign — Packaging.jpg', 'Botanical — Collection.jpg', 'Essentials — Natural.jpg', 'Studio — Hero.jpg'])
  // Each variant is an ordinary row with its own checkbox; the header takes the group.
  await page.getByRole('checkbox', { name: 'Select Launch — EN.jpg', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Select all 3 variants of Launch', exact: true })).toHaveAttribute('aria-checked', 'mixed')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  const sorted = await names()
  const cover = sorted.indexOf('Botanical — Front.jpg')
  expect(sorted.slice(cover, cover + 3)).toEqual(['Botanical — Front.jpg', 'Essentials — Detail.jpg', 'Launch — EN.jpg'])
  await hide.click()
  await expect.poll(names).not.toContain('Launch — EN.jpg')
  await expect(page.getByRole('button', { name: 'Show the 3 variants of Launch', exact: true })).toHaveText(/1 of 3 selected/)
})
