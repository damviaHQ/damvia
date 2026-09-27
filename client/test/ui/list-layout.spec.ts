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
import { expect, test } from './lib/trpc'

const children = ['2026', '2025'].map((name, index) => ({
  ...source, id: `year-${index}`, name, description: '', numberOfFiles: index ? 14 : 11,
  files: [], children: [], synchronized: false, canEdit: true, parentId: 'campaign',
}))

for (const width of [1440, 768]) {
  test(`collection and file lists keep row spacing, column alignment and contained overflow at ${width}px`, async ({ page, mockTrpc, shot }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(() => localStorage.setItem('dam_display_preferences', JSON.stringify({ photo: 'list', asset_folder: 'list' })))
    await mockTrpc({ 'collection.findById': { ...source, children } })
    await page.goto('/collections/campaign')
    const collections = page.locator('.collection-list-collections_table')
    const files = page.locator('.collection-list-files_table')
    await expect(collections.locator('tbody tr')).toHaveCount(2)
    await expect(files.locator('tbody tr')).toHaveCount(8)
    for (const [table, minHeight] of [[collections, 56], [files, 72]] as const) {
      expect((await table.locator('thead tr').boundingBox())!.height).toBeGreaterThanOrEqual(40)
      for (const row of await table.locator('tbody tr').all()) {
        const bounds = (await row.boundingBox())!
        expect(bounds.height).toBeGreaterThanOrEqual(minHeight)
        const cells = await row.locator('td').all()
        const actions = (await cells.at(-1)!.boundingBox())!
        const previous = (await cells.at(-2)!.boundingBox())!
        expect(actions.x).toBeGreaterThanOrEqual(previous.x + previous.width - 1)
        const checkbox = (await row.getByRole('checkbox').boundingBox())!
        expect(Math.abs(checkbox.y + checkbox.height / 2 - (bounds.y + bounds.height / 2))).toBeLessThan(2)
      }
      const headerCheckbox = (await table.locator('thead').getByRole('checkbox').boundingBox())!
      const rowCheckbox = (await table.locator('tbody tr').first().getByRole('checkbox').boundingBox())!
      expect(headerCheckbox.x).toEqual(rowCheckbox.x)
    }
    await expect(files.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const firstRow = collections.locator('tbody tr').first()
    await firstRow.getByRole('checkbox').click()
    await expect(firstRow.getByRole('checkbox')).toBeChecked()
    if (width === 1440) {
      await firstRow.hover()
      const trigger = firstRow.getByRole('button', { name: 'Actions for 2026', exact: true })
      const outside = (await page.getByText('Collections', { exact: true }).boundingBox())!
      await trigger.click()
      await expect(page.getByRole('menu')).toBeVisible()
      await page.mouse.click(outside.x + 5, outside.y + 5)
      await expect(page.getByRole('menu')).toHaveCount(0)
      await expect(firstRow.locator('.collection-list-collections__actions-container')).toHaveCSS('opacity', '0')
    }
    await shot(`list-layout-${width}`)
  })
}
