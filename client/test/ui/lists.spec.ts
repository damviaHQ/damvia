import { expect, test } from '@playwright/test'
import { responses } from './client-fixtures'

test('collection and file lists retain padded aligned cells', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dam_display_preferences', JSON.stringify({ asset_folder: 'list', photo: 'list', asset_file: 'list' })))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? { ...(responses[name] as object), children: [
      { id: 'year-2026', name: '2026', numberOfFiles: 2, description: 'Current events', canEdit: true, children: [] },
      { id: 'year-2025', name: '2025', numberOfFiles: 0, description: 'Past events', canEdit: true, children: [] },
    ] } : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
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
  await page.screenshot({ path: '/tmp/damvia-list-view.png' })
})
