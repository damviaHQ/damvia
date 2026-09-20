import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

async function fixture(page: Page, mixed = false, varied = false) {
  const source = responses['collection.findById'] as any
  const type = { ...source.files[0].assetType, productAttributes: [{ id: 'colour', name: 'colour', displayName: 'Colour' }, { id: 'season', name: 'season', displayName: 'Season' }] }
  const shapes = [{ width: 800, height: 600 }, { width: 600, height: 900 }, { width: 1200, height: 400 }]
  // A thumbnail of the shape the file claims, so a cropped tile is detectable.
  const shaped = ({ width, height }: { width: number, height: number }, index: number) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${['#e6e2dc', '#cfdbd4', '#ded5c9'][index % 3]}"/></svg>`)
  const files = source.files.map((file: any, index: number) => ({ ...file, assetType: mixed && index === 0 ? null : type, assetTypeId: mixed && index === 0 ? null : type.id,
    dimensions: varied ? shapes[index % shapes.length] : file.dimensions,
    ...(varied ? { thumbnailURL: shaped(shapes[index % shapes.length], index) } : {}),
    product: { attributes: [{ id: 'colour', name: 'colour', displayName: 'Colour', value: index % 2 ? 'Black' : 'Sand' }] }, productView: 'Front' }))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? { ...source, files, children: [{ ...source, id: 'child', name: 'Summer', numberOfFiles: 8, files: [], children: [] }] }
      : name === 'collection.search' ? { total: files.length, page: 1, totalPages: 1, results: files, facets: { fileTypes: { image: files.length }, assetTypes: { photo: files.length }, productViews: {}, attributes: { colour: { Sand: 4 } } } }
      : name === 'assetType.list' ? [type]
      : name === 'productAttribute.listFacets' ? [{ id: 'colour', name: 'colour', displayName: 'Colour', values: ['Sand', 'Black'] }]
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: new URL(test.info().project.use.baseURL!).hostname, path: '/' }])
}

for (const width of [1440, 390]) {
  test(`menu applies and persists attributes with keyboard support at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await fixture(page)
    await page.goto('/collections/campaign')
    const trigger = page.getByRole('button', { name: 'Display preferences', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('dialog', { name: 'Display preferences' })
    await expect(menu).toBeVisible()
    await expect(menu).toHaveCSS('border-radius', '16px')
    await menu.getByRole('tab', { name: 'List', exact: true }).click()
    const table = page.locator('.collection-list-files_table')
    await expect(table.getByRole('columnheader', { name: 'Size', exact: true })).toBeVisible()
    await menu.getByRole('button', { name: 'Size', exact: true }).click()
    await expect(table.getByRole('columnheader', { name: 'Size', exact: true })).toHaveCount(0)
    await menu.getByRole('button', { name: 'Colour', exact: true }).click()
    await expect(table.getByRole('columnheader', { name: 'Colour', exact: true })).toBeVisible()
    await expect(table.getByRole('button', { name: 'Copy Sand', exact: true }).first()).toBeVisible()
    await menu.getByRole('button', { name: 'Season', exact: true }).click()
    await expect(table.getByRole('columnheader', { name: 'Season', exact: true })).toBeVisible()
    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `/tmp/damvia-display-list-${width}.png` })
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.reload()
    await expect(table.getByRole('columnheader', { name: 'Colour', exact: true })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Size', exact: true })).toHaveCount(0)
    await trigger.click()
    await menu.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(menu.getByRole('tab', { name: 'Grid', exact: true })).toHaveAttribute('aria-selected', 'true')
    await menu.getByRole('tab', { name: 'List', exact: true }).click()
    await expect(table.getByRole('columnheader', { name: 'Size', exact: true })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Colour', exact: true })).toHaveCount(0)
  })
}

for (const width of [1440, 390]) test(`masonry fills the width with even gaps at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await fixture(page, false, true)
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Display preferences' })
  const preview = page.locator('button[aria-label^="Preview "]')
  await expect(preview.first().locator('img')).toHaveCSS('object-fit', 'contain')
  await menu.getByRole('tab', { name: 'Masonry', exact: true }).click()
  await expect(preview.first().locator('img')).toHaveCSS('object-fit', 'cover')

  const geometry = async () => page.locator('article:has(button[aria-label^="Preview "])').evaluateAll(cards => {
    const boxes = cards.map(card => card.getBoundingClientRect())
    const container = cards[0].parentElement!.getBoundingClientRect()
    const columns = boxes.filter(box => Math.abs(box.x - boxes[0].x) < 1 || box.y === boxes[0].y)
    const tops = [...new Set(boxes.map(box => Math.round(box.y)))].sort((a, b) => a - b)
    // Every neighbour in the first column, and the page edges, measured.
    const firstColumn = boxes.filter(box => Math.abs(box.x - boxes[0].x) < 1).sort((a, b) => a.y - b.y)
    return {
      heights: boxes.map(box => Math.round(box.height)),
      leftGutter: Math.round(boxes[0].x - container.x),
      rightGutter: Math.round(container.right - Math.max(...boxes.map(box => box.right))),
      verticalGaps: firstColumn.slice(1).map((box, index) => Math.round(box.y - firstColumn[index].bottom)),
      rowCount: tops.length,
      perRow: columns.length,
      // A tile whose shape differs from its picture's would crop it.
      cropped: cards.map(card => {
        const image = card.querySelector('img')
        const box = card.getBoundingClientRect()
        if (!image?.naturalWidth) return false
        return Math.abs(box.height / box.width - image.naturalHeight / image.naturalWidth) > 0.02
      }),
    }
  })

  let layout = await geometry()
  // The columns share the full width, so nothing is left over at either edge.
  expect(layout.leftGutter).toBeLessThanOrEqual(3)
  expect(layout.rightGutter).toBeLessThanOrEqual(3)
  // Tiles follow their own proportions but never overlap or touch.
  expect(new Set(layout.heights).size).toBeGreaterThan(1)
  layout.cropped.forEach(cropped => expect(cropped).toBe(false))
  layout.verticalGaps.forEach(gap => expect(gap).toBeGreaterThanOrEqual(6))
  layout.verticalGaps.forEach(gap => expect(gap).toBeLessThanOrEqual(12))

  // The overlay carries the details the caption used to.
  const card = page.locator('article:has(button[aria-label^="Preview "])').first()
  const overlay = card.locator('.pointer-events-none')
  await expect(overlay).toHaveCSS('opacity', '0')
  await preview.first().hover()
  await expect(overlay).toHaveCSS('opacity', '1')
  await page.screenshot({ path: `/tmp/damvia-display-masonry-${width}.png` })

  // Nothing moves on hover, so closing a preview cannot leave a card stuck.
  await expect(card).toHaveCSS('scale', 'none')
  await preview.first().click()
  await page.keyboard.press('Escape')
  await page.mouse.move(0, 0)
  await expect(card).toHaveCSS('scale', 'none')
  // The overlay stays while focus is on the picture: in masonry it is the only
  // place a keyboard user reads the file's name.

  // The size slider changes how many pictures share a row, and survives a reload.
  const before = layout.perRow
  // Clicking the picture dismissed the popover; open it again for the slider.
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  await menu.getByRole('slider').focus()
  await page.keyboard.press('ArrowLeft')
  // A phone is one column wide whatever the size, so only a desktop retiles.
  if (width > 700) await expect.poll(async () => (await geometry()).perRow).not.toBe(before)
  await expect(menu.getByRole('slider')).toHaveAttribute('aria-valuenow', '2')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(preview.first()).toBeVisible()
  layout = await geometry()
  expect(layout.leftGutter).toBeLessThanOrEqual(3)
  expect(layout.rightGutter).toBeLessThanOrEqual(3)
})

for (const width of [1440, 390]) test(`collection properties stay independent of the file view at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await fixture(page)
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Display preferences' })
  await menu.getByRole('combobox', { name: 'Content type' }).click()
  await page.getByRole('option', { name: 'Collections', exact: true }).click()
  // Collections are cards or rows; masonry is only ever offered for files.
  await expect(menu.getByRole('tab', { name: 'Masonry', exact: true })).toHaveCount(0)
  await menu.getByRole('tab', { name: 'List', exact: true }).click()
  const collections = page.locator('.collection-list-collections_table')
  await expect(collections.getByRole('columnheader', { name: 'Files', exact: true })).toBeVisible()
  await menu.getByRole('button', { name: 'Description', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await menu.getByRole('button', { name: 'Files', exact: true }).click()
  await expect(collections.getByRole('columnheader', { name: 'Files', exact: true })).toHaveCount(0)
  await menu.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(collections).toHaveCount(0)
})

test('mixed files offer product columns and malformed saved details recover', async ({ page }) => {
  await fixture(page, true)
  await page.addInitScript(() => localStorage.setItem('dam_display_details', '{broken'))
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Display preferences' })
  await menu.getByRole('tab', { name: 'List', exact: true }).click()
  await menu.getByRole('button', { name: 'Colour', exact: true }).click()
  await expect(page.locator('.collection-list-files_table').getByRole('columnheader', { name: 'Colour', exact: true })).toBeVisible()
})

test('search pills remove individual filters, retain sort and share display preferences', async ({ page }) => {
  await fixture(page)
  await page.goto('/search?asset_types=photo&attributes[colour]=Sand&sort=newest')
  const removeColour = page.getByRole('button', { name: 'Remove filter Colour: Sand', exact: true })
  await expect(removeColour).toBeVisible()
  await expect(removeColour).toHaveCSS('border-radius', '999px')
  // The category is now named once per pill, beside every value it groups.
  await expect(page.locator('.filter-pill', { has: removeColour }).locator('.filter-category')).toHaveText('Colour')
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Display preferences' })
  await menu.getByRole('tab', { name: 'List', exact: true }).click()
  await expect(page.locator('.collection-list-files_table')).toBeVisible()
  await menu.getByRole('button', { name: 'Colour', exact: true }).click()
  await page.screenshot({ path: '/tmp/damvia-display-search.png' })
  await page.keyboard.press('Escape')
  await page.screenshot({ path: '/tmp/damvia-filter-pills.png' })
  await removeColour.click()
  await expect(page).not.toHaveURL(/colour/)
  await expect(page).toHaveURL(/asset_types=photo/)
  await expect(page).toHaveURL(/sort=newest/)
  await page.getByRole('combobox', { name: 'Sort results' }).click()
  await page.getByRole('option', { name: 'Name A to Z', exact: true }).click()
  await expect(page).toHaveURL(/sort=name/)
  await page.getByRole('button', { name: 'Remove filter Asset type: Photography', exact: true }).click()
  await expect(page).not.toHaveURL(/asset_types/)
  await page.goto('/collections/campaign')
  await expect(page.locator('.collection-list-files_table').getByRole('columnheader', { name: 'Colour', exact: true })).toBeVisible()
})
