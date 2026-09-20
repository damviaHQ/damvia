import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

async function fixture(page: Page) {
  const source = responses['collection.findById'] as any
  const children = ['2026', '2025'].map((name, index) => ({
    ...source, id: `year-${index}`, name, description: '', numberOfFiles: index ? 14 : 11,
    files: [], children: [], synchronized: false, canEdit: true, parentId: 'campaign',
  }))
  await page.addInitScript(() => localStorage.setItem('dam_display_preferences', JSON.stringify({ photo: 'list', asset_folder: 'list' })))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? { ...source, children } : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
}

for (const width of [1440, 390]) {
  test(`collection and file lists keep row spacing, column alignment and contained overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await fixture(page)
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
    await page.screenshot({ path: `/tmp/damvia-list-layout-${width}.png` })
  })
}
