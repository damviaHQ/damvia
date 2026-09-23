import { expect, test } from '@playwright/test'
import { responses } from './client-fixtures'

for (const width of [1440, 390]) {
  for (const display of ['grid', 'list']) {
    test(`shared search tools stay above scrolled results (${width}px, ${display})`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(display => localStorage.setItem('dam_display_preferences', JSON.stringify({ photo: display })), display)
      const source = responses['collection.findById'] as any
      const files = Array.from({ length: 40 }, (_, index) => ({ ...source.files[index % source.files.length], id: `file-${index}` }))
      await page.route('**/trpc/**', async route => {
        const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
        const data = name === 'collection.search'
          ? { total: files.length, page: 1, totalPages: 1, results: files, facets: { fileTypes: { image: files.length }, assetTypes: { photo: files.length }, productViews: {}, attributes: {} } }
          : responses[name] ?? []
        await route.fulfill({ json: { result: { data } } })
      })
      await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
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
      if (width === 390) {
        const left = page.getByRole('button', { name: 'Show filters to the left' })
        const right = page.getByRole('button', { name: 'Show filters to the right' })
        await expect(left).toBeDisabled()
        await expect(right).toBeEnabled()
        const first = (await page.locator('#search-file-type').boundingBox())!
        const last = (await page.getByRole('button', { name: /^File size/ }).boundingBox())!
        expect(Math.abs(first.y - last.y)).toBeLessThanOrEqual(1)
        await right.click()
        await expect(left).toBeEnabled()
        await right.click()
        await expect(right).toBeDisabled()
        await left.click()
        await expect(right).toBeEnabled()
      }
      await page.screenshot({ path: `/tmp/damvia-search-sticky-${width}-${display}.png` })
      await preferences.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      expect(errors).toEqual([])
    })
  }
}

test('select all stays reachable in the sticky header while scrolling', async ({ page }) => {
  const source = responses['collection.findById'] as any
  const files = Array.from({ length: 40 }, (_, i) => ({ ...source.files[i % source.files.length], id: `file-${i}` }))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.search'
      ? { total: files.length, page: 1, totalPages: 1, results: files, facets: { fileTypes: { image: files.length }, assetTypes: { photo: files.length }, extensions: { jpg: files.length }, productViews: {}, attributes: {} } }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
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

test('the toolbar dropdowns align to the right and share one baseline and height', async ({ page }) => {
  const source = responses['collection.findById'] as any
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.search'
      ? { total: 8, page: 1, totalPages: 1, results: source.files, facets: { assetTypes: { photo: 8 }, fileTypes: { image: 8 }, extensions: { jpg: 6, png: 2 }, productViews: {}, attributes: {} } }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
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
