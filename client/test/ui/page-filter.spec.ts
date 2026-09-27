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
import { type Page } from '@playwright/test'
import { collection as source } from './lib/fixtures'
import { addFilter } from './lib/page'
import { expect, test, type MockTrpc } from './lib/trpc'

// A page holding two asset types, three formats and two colours, so every facet
// has something to narrow and sorting has something to reorder.
const sample = (index: number, name: string, mimeType: string, type: 'photo' | 'render', colour: string, size: number) => ({
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
  sample(0, 'Chair front.jpg', 'image/jpeg', 'photo', 'Sand', 3_000_000),
  sample(1, 'Chair side.png', 'image/png', 'photo', 'Black', 900_000),
  sample(2, 'Living room.jpg', 'image/jpeg', 'render', 'Sand', 12_000_000),
  sample(3, 'Catalogue.pdf', 'application/pdf', 'render', 'Black', 400_000),
]

const children = [
  { ...source, id: 'child-chairs', name: 'Chair campaign', numberOfFiles: 4, files: [], children: [], page: null },
  { ...source, id: 'child-tables', name: 'Table campaign', numberOfFiles: 2, files: [], children: [], page: null },
]

function fixture(mockTrpc: MockTrpc) {
  return mockTrpc({
    // The second collection holds a single file, to prove the values reset on the way in.
    'collection.findById': (id: string) => id === 'child-tables'
      ? { ...source, id: 'child-tables', name: 'Table campaign', files: [files[3]], children: [], page: null }
      : { ...source, files, children, page: null },
  })
}

const cards = (page: Page) => page.locator('article:has(button[aria-label^="Preview "])')
test('hover opens filter values and allows direct selection', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Add filter', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Add filter', exact: true })
  await picker.getByRole('button', { name: 'Format', exact: true }).hover()
  await expect(page.getByRole('dialog', { name: 'Format', exact: true })).toBeVisible()
  await picker.getByRole('button', { name: 'Asset type', exact: true }).hover()
  await expect(page.getByRole('dialog', { name: 'Format', exact: true })).toHaveCount(0)
  const values = page.getByRole('dialog', { name: 'Asset type', exact: true })
  await values.getByRole('checkbox', { name: 'Renders' }).click()
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Asset type, Renders' })).toBeVisible()
  await expect(values).toBeVisible()
  await values.getByRole('checkbox', { name: 'Photography' }).click()
  await expect(cards(page)).toHaveCount(4)
  await values.getByRole('checkbox', { name: 'Renders' }).click()
  await expect(cards(page)).toHaveCount(2)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Add filter', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Asset type, Photography' })).toBeVisible()
})

test('name is always visible and Save persists dimensions without values', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  const name = page.getByRole('textbox', { name: 'Filter by name' })
  await expect(name).toBeVisible()
  await addFilter(page, 'Asset type')
  await page.reload()
  await expect(page.getByRole('button', { name: /^Asset type,/ })).toHaveCount(0)
  await addFilter(page, 'Asset type')
  await page.getByRole('button', { name: /^Asset type,/ }).click()
  await page.getByRole('checkbox', { name: 'Renders' }).click()
  await page.keyboard.press('Escape')
  await name.fill('Living')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await name.fill('Chair')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dam_page_filters')!))).toEqual(['assetTypes'])
  await page.reload()
  await expect(name).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Asset type, Any' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await addFilter(page, 'Format')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Format filter' }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await expect(cards(page)).toHaveCount(4)
  await page.goto('/collections/child-tables')
  await expect(name).toBeVisible()
  await expect(name).toHaveValue('')
})

test('Clear resets values and removing a filter also clears its values', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  await addFilter(page, 'Asset type')
  await page.getByRole('button', { name: /^Asset type,/ }).click()
  await page.getByRole('checkbox', { name: 'Renders' }).click()
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Asset type, Any' })).toBeVisible()
  await page.getByRole('button', { name: /^Asset type,/ }).click()
  await page.getByRole('checkbox', { name: 'Renders' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Remove Asset type filter' }).click()
  await expect(page.getByRole('button', { name: /^Asset type,/ })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Filter by name' })).toBeVisible()
  await expect(cards(page)).toHaveCount(4)
})

test('orientation filters files by their dimensions', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  await addFilter(page, 'Orientation')
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

test('a name narrows the files and the sub-collections at once, and empty sections go away', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  await addFilter(page, 'Name')
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

test('a selected filter narrows the files and can be cleared, in grid, masonry and list alike', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  await addFilter(page, 'Asset type')

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

test('a list column header sorts, and size sorts by its bytes rather than its text', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
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

for (const width of [1440, 900, 768]) {
  test(`filters wrap without horizontal overflow at ${width}px`, async ({ page, mockTrpc }) => {
    await page.setViewportSize({ width, height: 700 })
    await fixture(mockTrpc)
    await page.goto('/collections/campaign')
    await addFilter(page, 'Name', 'Asset type', 'File type', 'Format', 'Colour')
    const rail = page.locator('.filter-rail')
    await expect(rail).toBeVisible()
    const dimensions = await page.evaluate(() => {
      const measure = (el: Element) => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight })
      return {
        document: measure(document.documentElement),
        main: measure(document.querySelector('main')!),
        rail: measure(document.querySelector('.filter-rail')!),
      }
    })
    expect(dimensions.document).toEqual({ x: 0, y: 0 })
    expect(dimensions.main.x).toBe(0)
    expect(dimensions.rail.y).toBe(0)
    expect(dimensions.rail.x).toBe(0)
    if (width < 1000) expect((await rail.boundingBox())!.height).toBeGreaterThan(50)
  })
}
