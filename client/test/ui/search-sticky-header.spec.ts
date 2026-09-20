import { expect, test } from '@playwright/test'
import { responses } from './client-fixtures'

for (const width of [1440, 390]) {
  for (const display of ['grid', 'list']) {
    test(`search header covers scrolled results without adding top spacing (${width}px, ${display})`, async ({ page }) => {
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
      const toolbar = main.locator('.sticky')
      const preferences = page.getByRole('button', { name: 'Display preferences', exact: true })
      await expect(page.getByText('40 results', { exact: true })).toBeVisible()
      const mainBox = (await main.boundingBox())!
      expect((await preferences.boundingBox())!.y - mainBox.y).toBe(20)
      await main.evaluate(element => { element.scrollTop = 450 })
      await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(450)
      await expect.poll(async () => (await toolbar.boundingBox())!.y).toBe(mainBox.y)
      const coversTopEdge = await toolbar.evaluate(element => {
        const main = document.querySelector('main')!.getBoundingClientRect()
        return [main.left + 2, main.left + main.width / 2, main.right - 2].every(x =>
          [2, 10, 19].every(offset => element.contains(document.elementFromPoint(x, main.top + offset))))
      })
      expect(coversTopEdge).toBe(true)
      await expect(toolbar).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await page.screenshot({ path: `/tmp/damvia-search-sticky-${width}-${display}.png` })
      await preferences.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await page.goto('/collections')
      const heading = page.getByRole('heading', { name: 'My collections', exact: true })
      await expect(heading).toBeVisible()
      expect((await heading.locator('..').boundingBox())!.y - (await main.boundingBox())!.y).toBe(20)
    })
  }
}

test('the sticky header paints above the result checkboxes', async ({ page }) => {
  const source = responses['collection.findById'] as any
  const files = Array.from({ length: 40 }, (_, index) => ({ ...source.files[index % source.files.length], id: `file-${index}` }))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.search'
      ? { total: files.length, page: 1, totalPages: 1, results: files, facets: { fileTypes: { image: files.length }, assetTypes: { photo: files.length }, extensions: { jpg: files.length }, productViews: {}, attributes: {} } }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/search')
  const main = page.locator('main')
  const toolbar = main.locator('.search-toolbar')
  await expect(page.getByText('40 results', { exact: true })).toBeVisible()
  await main.evaluate(element => { element.scrollTop = 600 })
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(600)
  const box = (await toolbar.boundingBox())!
  // a card scrolled under the header must not draw its checkbox over it
  const owner = await page.evaluate(([x, y]) => {
    const element = document.elementFromPoint(x, y)
    return element?.closest('.search-toolbar') ? 'toolbar' : `${element?.tagName}.${String(element?.className ?? '').slice(0, 40)}`
  }, [box.x + box.width / 2, box.y + box.height - 6])
  expect(owner).toBe('toolbar')
})

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
  const toolbar = page.locator('.search-toolbar')
  const selectAll = toolbar.getByRole('checkbox', { name: 'Select all results', exact: true })
  await expect(selectAll).toBeVisible()
  const main = page.locator('main')
  await main.evaluate(el => { el.scrollTop = 800 })
  await expect.poll(() => main.evaluate(el => el.scrollTop)).toBe(800)
  await expect(selectAll).toBeInViewport()
  await expect(toolbar.getByRole('button', { name: 'Select all', exact: true })).toBeVisible()
  await page.locator('.search__result-group').getByRole('checkbox', { name: /^Select / }).first().click()
  await expect(toolbar.getByRole('button', { name: '1 item selected, select all', exact: true })).toBeVisible()
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
  await selectAll.click()
  await expect(page.locator('.dashboard-layout-topbar__selector').getByText('40 items selected', { exact: true })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Unselect all', exact: true })).toBeVisible()
  await expect(toolbar.getByRole('checkbox', { name: 'Unselect all results', exact: true })).toBeChecked()
  await toolbar.getByRole('button', { name: 'Unselect all', exact: true }).click()
  await expect(toolbar.getByRole('button', { name: 'Select all', exact: true })).toBeVisible()
  await expect(selectAll).not.toBeChecked()
})

test('the toolbar dropdowns share one baseline and height', async ({ page }) => {
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
  expect(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y))).toBeLessThanOrEqual(1)
  expect(Math.max(...boxes.map(box => box.height)) - Math.min(...boxes.map(box => box.height))).toBeLessThanOrEqual(1)
})
