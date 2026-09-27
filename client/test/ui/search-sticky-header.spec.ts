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
import { files as sampleFiles } from './lib/fixtures'
import { expect, test } from './lib/trpc'

// Forty results, enough to scroll the search page under its tools.
const files = Array.from({ length: 40 }, (_, index) => ({ ...sampleFiles[index % sampleFiles.length], id: `file-${index}` }))
const search = (results: typeof files, facets: Record<string, unknown>) => ({ total: results.length, page: 1, totalPages: 1, results, facets })

for (const width of [1440, 768]) {
  for (const display of ['grid', 'list']) {
    test(`shared search tools stay above scrolled results (${width}px, ${display})`, async ({ page, mockTrpc, shot }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(display => localStorage.setItem('dam_display_preferences', JSON.stringify({ photo: display })), display)
      await mockTrpc({ 'collection.search': search(files, { fileTypes: { image: files.length }, assetTypes: { photo: files.length }, productViews: {}, attributes: {} }) })
      await page.goto('/search')
      const main = page.locator('main')
      const toolbar = page.getByRole('banner', { name: 'Page tools' })
      const preferences = toolbar.getByRole('button', { name: 'Display preferences', exact: true })
      await expect(page.getByText('40 results', { exact: true })).toBeVisible()
      await expect(preferences).toBeVisible()
      await expect(main.locator('.search-toolbar')).toHaveCount(0)
      await expect(page.locator('#client-page-filters #search-file-type')).toBeVisible()
      const toolbarBox = (await toolbar.boundingBox())!
      const mainBox = (await main.boundingBox())!
      expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(mainBox.y)
      await main.evaluate(element => { element.scrollTop = 450 })
      await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(450)
      expect((await toolbar.boundingBox())!.y).toBe(toolbarBox.y)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await shot(`search-sticky-${width}-${display}`)
      await preferences.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
    })
  }
}

test('select all stays reachable in the sticky header while scrolling', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'collection.search': search(files, { fileTypes: { image: files.length }, assetTypes: { photo: files.length }, extensions: { jpg: files.length }, productViews: {}, attributes: {} }) })
  await page.goto('/search?q=file')
  const toolbar = page.locator('#client-page-context')
  const selectAll = toolbar.getByRole('checkbox', { name: 'Select all results on this page', exact: true })
  await expect(selectAll).toBeVisible()
  const main = page.locator('main')
  await main.evaluate(el => { el.scrollTop = 800 })
  await expect.poll(() => main.evaluate(el => el.scrollTop)).toBe(800)
  await expect(selectAll).toBeInViewport()
  await expect(toolbar.getByRole('button', { name: 'Select All in', exact: true })).toBeVisible()
  await page.locator('.search__result-group').getByRole('checkbox', { name: /^Select / }).first().click()
  await page.mouse.move(0, 0)
  await expect(toolbar.getByRole('button', { name: '1 item selected in', exact: true })).toBeVisible()
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
  await toolbar.locator('.collection__selection-container').hover()
  await expect(toolbar.getByRole('button', { name: 'Select All in', exact: true })).toBeVisible()
  await selectAll.click()
  await expect(page.locator('.dashboard-layout-topbar__selector').getByText('40 items selected', { exact: true })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Remove Selection in', exact: true })).toBeVisible()
  await expect(toolbar.getByRole('checkbox', { name: 'Unselect all results on this page', exact: true })).toBeChecked()
  await toolbar.getByRole('button', { name: 'Remove Selection in', exact: true }).click()
  await expect(toolbar.getByRole('button', { name: 'Select All in', exact: true })).toBeVisible()
  await expect(selectAll).not.toBeChecked()
})

test('the toolbar dropdowns align to the right and share one baseline and height', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'collection.search': search(sampleFiles, { assetTypes: { photo: 8 }, fileTypes: { image: 8 }, extensions: { jpg: 6, png: 2 }, productViews: {}, attributes: {} }) })
  await page.goto('/search?q=sand')
  await expect(page.getByText('8 results', { exact: true })).toBeVisible()
  const boxes = []
  for (const selector of ['#search-file-type', '#search-sort', '[aria-label^="File format"]', '[aria-label^="File size"]']) {
    boxes.push((await page.locator(selector).boundingBox())!)
  }
  const filtersBox = (await page.locator('#client-page-filters').boundingBox())!
  const lastBox = boxes[boxes.length - 1]
  expect(Math.abs(lastBox.x + lastBox.width - filtersBox.x - filtersBox.width)).toBeLessThanOrEqual(1)
  expect(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y))).toBeLessThanOrEqual(1)
  expect(Math.max(...boxes.map(box => box.height)) - Math.min(...boxes.map(box => box.height))).toBeLessThanOrEqual(1)
})
