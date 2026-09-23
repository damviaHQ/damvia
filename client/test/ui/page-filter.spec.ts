import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

// A page holding two asset types, three formats and two colours, so every facet
// has something to narrow and sorting has something to reorder.
const shot = (index: number, name: string, mimeType: string, type: 'photo' | 'render', colour: string, size: number) => ({
  id: `file-${index}`,
  name,
  size: String(size),
  dimensions: index === 1 ? { width: 600, height: 800 } : { width: 800, height: 600 },
  updatedAt: `2026-0${index + 1}-01T10:00:00Z`,
  mimeType,
  thumbnailURL: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e6e2dc"/></svg>'),
  fileURL: '#',
  collectionId: 'campaign',
  assetTypeId: type,
  assetType: { id: type, name: type === 'photo' ? 'Photography' : 'Renders', defaultDisplay: 'grid', attributes: [], recordAttributes: [{ id: 'colour', name: 'colour', displayName: 'Colour' }], listDisplayItems: ['size', 'format', 'updated_at'] },
  record: { id: `record-${index}`, attributes: [{ id: 'colour', name: 'colour', displayName: 'Colour', value: colour }] },
  recordView: 'Front',
  attributes: [],
  licenses: [],
  createdAt: '2026-09-01T10:00:00Z',
})

const files = [
  shot(0, 'Chair front.jpg', 'image/jpeg', 'photo', 'Sand', 3_000_000),
  shot(1, 'Chair side.png', 'image/png', 'photo', 'Black', 900_000),
  shot(2, 'Living room.jpg', 'image/jpeg', 'render', 'Sand', 12_000_000),
  shot(3, 'Catalogue.pdf', 'application/pdf', 'render', 'Black', 400_000),
]

const children = [
  { ...(responses['collection.findById'] as any), id: 'child-chairs', name: 'Chair campaign', numberOfFiles: 4, files: [], children: [], page: null },
  { ...(responses['collection.findById'] as any), id: 'child-tables', name: 'Table campaign', numberOfFiles: 2, files: [], children: [], page: null },
]

async function fixture(page: Page) {
  const source = responses['collection.findById'] as any
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const id = new URL(route.request().url()).searchParams.get('input')
    // The second collection holds a single file, to prove the values reset on the way in.
    const other = id?.includes('child-tables')
    const data = name === 'collection.findById'
      ? other
        ? { ...source, id: 'child-tables', name: 'Table campaign', files: [files[3]], children: [], page: null }
        : { ...source, files, children, page: null }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: new URL(test.info().project.use.baseURL!).hostname, path: '/' }])
}

const cards = (page: Page) => page.locator('article:has(button[aria-label^="Preview "])')
const funnel = (page: Page) => page.getByRole('button', { name: 'Filters', exact: true })

// The funnel offers the page's filters; only the ticked ones reach the bar.
async function activate(page: Page, ...names: string[]) {
  await funnel(page).click()
  const picker = page.getByRole('dialog', { name: 'Filters' })
  for (const name of names) await picker.getByRole('checkbox', { name, exact: true }).click()
  await page.keyboard.press('Escape')
}

test('nothing shows until a filter is chosen, and a choice stays across reloads and collections', async ({ page }) => {
  await fixture(page)
  await page.goto('/collections/campaign')
  const bar = page.getByRole('search', { name: 'Filter this page' })
  const name = page.getByRole('textbox', { name: 'Filter by name' })
  await expect(bar).toHaveCount(0)

  // The funnel lists what this page can be filtered by, and nothing is on by default.
  await funnel(page).click()
  const picker = page.getByRole('dialog', { name: 'Filters' })
  for (const choice of ['Name', 'Asset type', 'File type', 'Format', 'Colour']) {
    await expect(picker.getByRole('checkbox', { name: choice, exact: true })).not.toBeChecked()
  }
  await picker.getByRole('checkbox', { name: 'Name', exact: true }).click()
  await page.keyboard.press('Escape')

  // Only the ticked one is drawn: the other facets stay off the bar.
  await expect(bar).toBeVisible()
  await expect(name).toBeVisible()
  await expect(page.getByRole('button', { name: /^Asset type,/ })).toHaveCount(0)

  await page.reload()
  await expect(name).toBeVisible()
  await page.goto('/collections/child-tables')
  await expect(name).toBeVisible()
  // The values describe the collection being read, so they do not travel with it.
  await expect(name).toHaveValue('')

  await page.goto('/collections/campaign')
  await activate(page, 'Name')
  await expect(bar).toHaveCount(0)
  await page.reload()
  await expect(bar).toHaveCount(0)
})

test('taking a filter off the bar takes its values with it', async ({ page }) => {
  await fixture(page)
  await page.goto('/collections/campaign')
  await activate(page, 'Asset type')
  await page.getByRole('button', { name: /^Asset type,/ }).click()
  await page.getByRole('checkbox', { name: 'Renders' }).click()
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(2)
  // The funnel says how many values that filter is holding.
  await funnel(page).click()
  await expect(page.getByRole('dialog', { name: 'Filters' }).getByRole('checkbox', { name: 'Asset type', exact: true })).toBeChecked()
  await page.keyboard.press('Escape')

  await activate(page, 'Asset type')
  await expect(page.getByRole('search', { name: 'Filter this page' })).toHaveCount(0)
  // A filter nobody can see must not keep narrowing the page.
  await expect(cards(page)).toHaveCount(4)
})

test('orientation filters files by their dimensions', async ({ page }) => {
  await fixture(page)
  await page.goto('/collections/campaign')
  await activate(page, 'Orientation')
  await page.getByRole('button', { name: /^Orientation,/ }).click()
  await page.getByRole('checkbox', { name: 'Portrait' }).click()
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Orientation, Portrait' })).toBeVisible()
  await page.getByRole('button', { name: 'Orientation, Portrait' }).click()
  await expect(page.locator('#page-filter-orientations-title')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Portrait' }).click()
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(4)
})

test('a name narrows the files and the sub-collections at once, and empty sections go away', async ({ page }) => {
  await fixture(page)
  await page.goto('/collections/campaign')
  await activate(page, 'Name')
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'Open Chair campaign' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Table campaign' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Filter by name' }).fill('chair')
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Open Chair campaign' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Table campaign' })).toHaveCount(0)
  // Two files and one sub-collection out of four and two.
  await expect(page.getByText('3 of 6 items')).toBeVisible()

  // Nothing matches on either side, so both headings leave with their items.
  await page.getByRole('textbox', { name: 'Filter by name' }).fill('nothing here')
  await expect(cards(page)).toHaveCount(0)
  await expect(page.getByText('Collections', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Photography', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Clear the name filter' }).click()
  await expect(cards(page)).toHaveCount(4)
})

test('a selected filter narrows the files and can be cleared, in grid, masonry and list alike', async ({ page }) => {
  await fixture(page)
  await page.goto('/collections/campaign')
  await activate(page, 'Asset type')

  await page.getByRole('button', { name: /^Asset type,/ }).click()
  await page.getByRole('checkbox', { name: 'Renders' }).click()
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Asset type, Renders' })).toBeVisible()

  for (const view of ['Masonry', 'List'] as const) {
    await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
    await page.getByRole('dialog', { name: 'Display preferences' }).getByRole('tab', { name: view, exact: true }).click()
    await page.keyboard.press('Escape')
    const rows = view === 'List' ? page.locator('.collection-list-files_table tbody tr') : cards(page)
    await expect(rows).toHaveCount(2)
  }

  // Back to the grid, then the value is unchecked and everything returns.
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  await page.getByRole('dialog', { name: 'Display preferences' }).getByRole('tab', { name: 'Grid', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Asset type, Renders' }).click()
  await page.getByRole('checkbox', { name: 'Renders' }).click()
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Asset type, Any' })).toBeVisible()
})

test('a list column header sorts, and size sorts by its bytes rather than its text', async ({ page }) => {
  await fixture(page)
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  await page.getByRole('dialog', { name: 'Display preferences' }).getByRole('tab', { name: 'List', exact: true }).click()
  await page.keyboard.press('Escape')

  const table = page.locator('.collection-list-files_table')
  // The name cell holds a checkbox and a preview button beside the text, so the
  // file name is read from its own link rather than from the whole cell.
  const names = async () => (await table.locator('tbody tr td:first-child').allInnerTexts()).map(text => text.trim().split('\n').map(line => line.trim()).filter(Boolean)[0])
  // The header of a sortable column carries the button; its cell carries aria-sort.
  const button = (name: string) => table.locator('th').getByRole('button', { name, exact: true })
  const cell = (name: string) => table.locator('th').filter({ has: page.getByRole('button', { name, exact: true }) })

  await button('File').click()
  await expect(cell('File')).toHaveAttribute('aria-sort', 'ascending')
  expect(await names()).toEqual(['Catalogue.pdf', 'Chair front.jpg', 'Chair side.png', 'Living room.jpg'])

  await button('File').click()
  await expect(cell('File')).toHaveAttribute('aria-sort', 'descending')
  expect(await names()).toEqual(['Living room.jpg', 'Chair side.png', 'Chair front.jpg', 'Catalogue.pdf'])

  // 400 kB, 900 kB, 3 MB, 12 MB: ordering the printed text would not give this.
  await button('Size').click()
  await expect(cell('Size')).toHaveAttribute('aria-sort', 'ascending')
  await expect(cell('File')).not.toHaveAttribute('aria-sort', 'ascending')
  expect(await names()).toEqual(['Catalogue.pdf', 'Chair side.png', 'Chair front.jpg', 'Living room.jpg'])
})

for (const width of [1440, 900, 390]) {
  test(`filter overflow is confined to the horizontal rail at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await fixture(page)
    await page.goto('/collections/campaign')
    await activate(page, 'Name', 'Asset type', 'File type', 'Format', 'Colour')
    const rail = page.locator('.filter-rail-viewport')
    await expect(rail).toBeVisible()
    const dimensions = await page.evaluate(() => {
      const measure = (el: Element) => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight })
      return {
        document: measure(document.documentElement),
        main: measure(document.querySelector('main')!),
        rail: measure(document.querySelector('.filter-rail-viewport')!),
      }
    })
    expect(dimensions.document).toEqual({ x: 0, y: 0 })
    expect(dimensions.main.x).toBe(0)
    expect(dimensions.rail.y).toBe(0)
    if (width < 1000) expect(dimensions.rail.x).toBeGreaterThan(0)
  })
}
