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
import { collection, files as sampleFiles } from './lib/fixtures'
import { addFilter } from './lib/page'
import { expect, test, type Answers, type MockTrpc } from './lib/trpc'

// The reader-facing catalogue: cards, the search box and the jump to a
// product page. See docs/administration/catalogue.md.
const visual = (view: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ddd"/><text x="4" y="24">${view}</text></svg>`)}`

const products = [
  {
    id: 'bot-cit-250', recordKey: 'BOT-CIT-250',
    metaData: { name: 'Citron & bergamote', format: '250 ml' },
    thumbnailURL: visual('00'), visuals: [{ id: 'v1', view: '00', thumbnailURL: visual('00') }, { id: 'v2', view: '01', thumbnailURL: visual('01') }],
    visualCount: 8, fileCount: 8,
    readiness: { filled: 3, total: 3, ready: true },
    family: { key: 'citron', label: 'Citron' },
  },
  {
    id: 'bot-gin-250', recordKey: 'BOT-GIN-250',
    metaData: { name: 'Gingembre & citron vert', format: '250 ml' },
    thumbnailURL: null, visuals: [], visualCount: 0, fileCount: 0,
    readiness: { filled: 1, total: 3, ready: false },
    family: null,
  },
]
const list = {
  products,
  total: 2,
  cardTitleField: 'name',
  fields: [
    { name: 'name', displayName: 'Name', valueType: 'text', facetable: false, position: 0 },
    { name: 'format', displayName: 'Format', valueType: 'text', facetable: true, position: 1 },
  ],
}

const facets = { total: 2, assetTypes: [], fileTypes: [], extensions: [], attributes: [{ id: 'format', label: 'Format', options: [{ id: '250 ml', label: '250 ml', count: 1 }, { id: '500 ml', label: '500 ml', count: 1 }] }] }

function fixture(mockTrpc: MockTrpc, overrides: Answers = {}) {
  return mockTrpc({ 'catalogue.facets': facets, 'catalogue.list': list, ...overrides })
}

test('a card carries the reference, the title field and the visuals, and nothing else', async ({ page, mockTrpc, shot }) => {
  await fixture(mockTrpc)
  await page.goto('/catalogue')

  await expect(page.locator('aside').getByRole('link', { name: 'Products', exact: true })).toHaveCount(0)
  const card = page.locator('article', { hasText: 'BOT-CIT-250' })
  await expect(card).toBeVisible()
  await expect(card.getByText('BOT-CIT-250', { exact: true })).toBeVisible()
  await expect(card.getByText('Citron & bergamote')).toBeVisible()
  // Four visuals are carried by a card, the rest are counted.
  await expect(card.getByText('+6')).toBeVisible()

  // Readiness, file counts and the key prefix belong to administration, not to
  // a reader browsing a catalogue.
  await expect(page.getByText('SKU ·')).toHaveCount(0)
  await expect(page.getByText('Ready to use')).toHaveCount(0)
  await expect(page.getByText('8 files')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'By model' })).toHaveCount(0)
  await shot('catalogue-grid', { fullPage: true })
})

test('the search bar switches explicitly between files and products', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, {
    'collection.search': { total: 0, page: 1, totalPages: 0, results: [], facets: { assetTypes: {}, fileTypes: {}, extensions: {}, recordViews: {}, attributes: {}, metadata: {}, metadataRanges: {}, variantAxes: {} } },
  })
  await page.goto('/catalogue')
  const searchBar = page.locator('form[role="search"]')
  const chip = searchBar.getByRole('group', { name: 'Search for' })
  const inputBox = (await searchBar.getByRole('combobox').boundingBox())!
  const chipBox = (await chip.boundingBox())!
  const barBox = (await searchBar.boundingBox())!
  expect(chipBox.x).toBeGreaterThan(inputBox.x + inputBox.width)
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(barBox.x + barBox.width)
  await expect(chip).toHaveCSS('border-top-width', '0px')
  await expect(chip).toHaveCSS('border-radius', '0px')
  const files = page.getByRole('button', { name: 'Search files', exact: true })
  const products = page.getByRole('button', { name: 'Search products', exact: true })
  await expect(files).toHaveAttribute('aria-pressed', 'true')
  await products.click()
  await expect(products).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Search products' })).toHaveAttribute('placeholder', 'Search for a product')
  await page.getByRole('combobox', { name: 'Search products' }).click()
  const mode = page.locator('[data-search-options]').getByRole('button', { name: 'Search mode' })
  await expect(mode).toHaveText('search multiple references of')
  await page.getByRole('combobox', { name: 'Search products' }).fill('BOT-CIT-250, BOT-GIN-250')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/search\?.*kind=products/)
  await expect(page.locator('article', { hasText: 'BOT-CIT-250' })).toBeVisible()
  await expect.poll(() => api.last('catalogue.list')?.searchTerms).toEqual(['BOT-CIT-250', 'BOT-GIN-250'])
  await expect(page.locator('[data-search-panel]')).not.toContainText('Asset type')
  await page.locator('[data-search-panel]').getByRole('switch', { name: 'Exact phrase' }).click()
  await expect(page).toHaveURL(/exact_match=true/)
  await expect.poll(() => api.last('catalogue.list')?.search).toBe('BOT-CIT-250 BOT-GIN-250')
  await page.getByRole('combobox', { name: 'Search products' }).click()
  await expect(mode).toHaveText('search an exact phrase in')
  await files.click()
  await expect(page).not.toHaveURL(/exact_match=true/)
  await expect(page).not.toHaveURL(/kind=products/)
  await expect.poll(() => api.count('collection.search') > 0).toBe(true)
  await products.click()
  await expect(page).toHaveURL(/kind=products/)
  await expect(page.locator('article', { hasText: 'BOT-CIT-250' })).toBeVisible()
  await page.goto('/catalogue')
  await expect(products).toHaveAttribute('aria-pressed', 'true')
  await files.click()
  await expect(page.getByRole('combobox', { name: 'Search files' })).toHaveAttribute('placeholder', 'Search for a file')
  await page.setViewportSize({ width: 768, height: 844 })
  await expect(chip).toBeVisible()
})

test('the catalogue shows selected filters and sends them to the paginated query', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, {
    'menuItem.list': [{ id: 'winter-menu', type: 'collection', name: 'Winter products', collectionName: 'Winter products', collectionId: 'winter', children: [], position: 0, hasAccess: true }],
  })
  await page.goto('/catalogue')
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeAttached()
  await expect(page.locator('aside').getByRole('link', { name: 'Winter products', exact: true })).toHaveAttribute('href', '/collections/winter')
  await page.getByLabel('Filter by name').fill('citron')
  await expect.poll(() => api.last('catalogue.list')?.search).toBe('citron')
  await addFilter(page, 'Format')
  await page.getByRole('button', { name: 'Format, Any' }).click()
  await page.getByRole('checkbox', { name: '500 ml', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect.poll(() => api.last('catalogue.list')?.filters).toEqual([{ column: 'format', op: 'has_any', values: ['500 ml'] }])
  await expect(page.getByRole('button', { name: 'Format, 500 ml' })).toBeVisible()
})

test('a card opens the product page, which lists the values and the files', async ({ page, mockTrpc, shot }) => {
  await fixture(mockTrpc, {
    'catalogue.get': {
      ...products[0],
      fields: list.fields.map(({ name, displayName, valueType, position }) => ({ name, displayName, valueType, position })),
      readinessLabels: { ready: 'Ready to use', incomplete: 'To complete', defined: true },
      cardTitleField: 'name',
      siblings: [{ ...products[1], recordKey: 'BOT-CIT-4PK' }],
      relatedTotal: 1,
      collectionFiles: sampleFiles.slice(0, 2).map((file, index) => ({ ...file, name: `BOT-CIT-250-0${index}.jpg`, record: { id: 'bot-cit-250', attributes: [{ id: 'product-type', name: 'type', displayName: 'Product Type', value: 'Bottle', facetable: true }] } })),
      files: [
        { id: 'f1', name: 'BOT-CIT-250-00.jpg', path: '/Packshots', view: '00', mimeType: 'image/jpeg', size: '1', thumbnailURL: visual('00') },
        { id: 'f2', name: 'BOT-CIT-250-01.jpg', path: '/Packshots', view: '01', mimeType: 'image/jpeg', size: '1', thumbnailURL: visual('01') },
      ],
    },
  })
  await page.goto('/catalogue')
  await page.getByRole('link', { name: /BOT-CIT-250/ }).first().click()

  await expect(page).toHaveURL(/\/products\/bot-cit-250$/)
  await expect(page.getByRole('heading', { name: 'Citron & bergamote', exact: true })).toBeVisible()
  await expect(page.getByRole('term').filter({ hasText: 'Format' })).toBeVisible()
  await expect(page.getByText('BOT-CIT-250-01.jpg')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Related Products' })).toBeVisible()
  await addFilter(page, 'Product Type')
  await page.getByRole('button', { name: 'Product Type, Any' }).click()
  await page.getByRole('checkbox', { name: 'Bottle', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(page.getByText('BOT-CIT-250-01.jpg')).toBeVisible()
  await shot('product', { fullPage: true })
})

test('selecting products offers download and add to collection, and clears on navigation', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, {
    'collection.getFiles': {
      files: [], licenses: [], allowDirectDownload: true, viewsEnabled: true,
      recordCount: 2, columns: [{ id: 'recordKey', label: 'Reference' }],
      previewRows: products.map(product => [product.recordKey]),
      previewPictures: products.map(() => null),
    },
  })
  await page.goto('/catalogue')

  await page.getByLabel('Select BOT-CIT-250', { exact: true }).check()
  await expect(page.getByRole('button', { name: 'Add selection to your collection' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download selection' })).toBeVisible()
  await page.getByLabel('Select BOT-GIN-250', { exact: true }).check()
  await expect(page.locator('.dashboard-layout-topbar__selector')).toContainText('2 items selected')

  await page.getByRole('button', { name: 'Download selection' }).click()
  const dialog = page.getByRole('dialog', { name: 'Download products' })
  await expect(dialog.getByRole('button', { name: 'Download Excel' })).toBeEnabled()
  expect(api.inputs('collection.getFiles')[0]).toEqual({
    items: products.map(product => ({ type: 'record', id: product.id })),
  })
  await page.keyboard.press('Escape')

  // Leaving the catalogue clears its product selection.
  await page.goto('/collections/campaign')
  await expect(page.locator('#client-page-context')).toContainText('Autumn essentials')
  await page.goto('/catalogue')
  await expect(page.getByRole('button', { name: 'Add selection to your collection' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download selection' })).toHaveCount(0)
})

test('display preferences switch products to the shared table and persist field columns', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/catalogue')
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  await page.getByRole('tab', { name: 'List', exact: true }).click()
  await page.getByRole('button', { name: 'Format', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Format' })).toBeVisible()
  await expect(page.getByRole('row', { name: /BOT-CIT-250/ })).toContainText('Citron & bergamote')
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Format' })).toBeVisible()
})

test('a product selection creates a collection without choosing a type and uses it as the destination', async ({ page, mockTrpc }) => {
  const created = { ...collection, id: 'my-catalogue', name: 'My selection', catalogueMode: 'products', synchronized: false, files: [], children: [] }
  const api = await fixture(mockTrpc, { 'collection.createUserCollection': created, 'collection.addItems': created })
  await page.goto('/catalogue')
  await page.getByLabel('Select BOT-CIT-250', { exact: true }).check()
  await page.getByRole('button', { name: 'Add selection to your collection' }).click()
  await page.getByRole('button', { name: 'Create new', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a private collection' })
  await expect(dialog.getByLabel('What this collection holds')).toHaveCount(0)
  await dialog.getByLabel('Collection name').fill('My selection')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect.poll(() => api.inputs('collection.createUserCollection')[0]).toEqual({ name: 'My selection' })
  await page.getByRole('button', { name: 'Add to My selection', exact: true }).click()
  await expect.poll(() => api.inputs('collection.addItems')[0]).toEqual({ id: 'my-catalogue', items: [{ type: 'record', id: 'bot-cit-250' }] })
})

test('related pagination and links retain the collection context', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, {
    'catalogue.get': { ...products[0], fields: list.fields, cardTitleField: 'name', siblings: [products[1]], relatedTotal: 25, collectionFiles: [], files: [] },
  })
  await page.goto('/products/bot-cit-250?collection=campaign')
  await expect(page.getByRole('heading', { name: 'Related Products' })).toBeVisible()
  await page.getByRole('button', { name: 'Next related page' }).click()
  await expect.poll(() => api.last('catalogue.get')).toEqual({ id: 'bot-cit-250', collectionId: 'campaign', relatedOffset: 24 })
  await expect(page.getByRole('button', { name: 'Next related page' })).toBeDisabled()
  await page.getByRole('link', { name: 'Open BOT-GIN-250', exact: true }).click()
  await expect(page).toHaveURL(/products\/bot-gin-250\?collection=campaign$/)
  await expect.poll(() => api.last('catalogue.get').relatedOffset).toBe(0)
})

test('record assets use named groups and each asset type display preference', async ({ page, mockTrpc }) => {
  const base = sampleFiles[0]
  const file = (id: string, name: string, typeId: string, typeName: string, display: string) => ({
    ...base, id, name, assetTypeId: typeId,
    assetType: { ...base.assetType, id: typeId, name: typeName, defaultDisplay: display },
  })
  await fixture(mockTrpc, {
    'catalogue.get': {
      ...products[0], fields: list.fields, siblings: [], relatedTotal: 0, files: [],
      collectionFiles: [file('packshot', 'Front.jpg', 'packshots', 'Packshots', 'list'), file('campaign', 'Campaign.jpg', 'marketing', 'Marketing Assets', 'grid')],
    },
  })
  await page.goto('/products/bot-cit-250')
  const packshots = page.getByRole('region', { name: 'Packshots', exact: true })
  const marketing = page.getByRole('region', { name: 'Marketing Assets', exact: true })
  await expect(packshots.getByRole('heading', { name: 'Packshots' })).toBeVisible()
  await expect(packshots.getByRole('table')).toBeVisible()
  await expect(packshots.getByText('Front.jpg')).toBeVisible()
  await expect(marketing.getByText('Campaign.jpg')).toBeVisible()
  await expect(marketing.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Files', exact: true })).toHaveCount(0)
})
