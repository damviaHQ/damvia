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
import { collection } from './lib/fixtures'
import { expect, test } from './lib/trpc'

test('collection and file lists retain padded aligned cells', async ({ page, mockTrpc, shot }) => {
  await page.addInitScript(() => localStorage.setItem('dam_display_preferences', JSON.stringify({ asset_folder: 'list', photo: 'list', asset_file: 'list' })))
  await mockTrpc({
    'collection.findById': {
      ...collection,
      children: [
        { id: 'year-2026', name: '2026', numberOfFiles: 2, description: 'Current events', canEdit: true, children: [] },
        { id: 'year-2025', name: '2025', numberOfFiles: 0, description: 'Past events', canEdit: true, children: [] },
      ],
    },
  })
  await page.goto('/collections/campaign')
  for (const selector of ['.collection-list-collections_table', '.collection-list-files_table']) {
    const table = page.locator(selector)
    await expect(table).toBeVisible()
    await expect(table.locator('tbody td').first()).toHaveCSS('padding-top', '12px')
    await expect(table.locator('tbody td').first()).toHaveCSS('font-size', '14px')
    const header = (await table.locator('thead th').first().boundingBox())!
    const cell = (await table.locator('tbody td').first().boundingBox())!
    expect(cell.x).toBe(header.x)
    expect(cell.height).toBeGreaterThanOrEqual(44)
  }
  const row = page.locator('.collection-list-collections_table tbody tr').first()
  await row.hover()
  const actions = row.locator('.collection-list-collections__actions-container')
  await expect(actions).toHaveCSS('opacity', '1')
  await expect(actions).toHaveCSS('position', 'static')
  await shot('list-view')
})
