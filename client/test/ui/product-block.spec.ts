import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

// The Products block draws a catalogue collection with the same chrome files
// already use: filters, selection, grid or list. See docs/administration/catalogue.md.
const product = (index: number, recordKey: string, season: string) => ({
  id: `product-${index}`,
  recordKey,
  metaData: { season },
  thumbnailURL: null,
  visuals: [],
  visualCount: 0,
  fileCount: 0,
  readiness: { filled: 0, total: 0, ready: true },
  family: null,
})

const fields = [{ name: 'season', displayName: 'Season', valueType: 'text', facetable: true, position: 0 }]

function pageWithProductsBlock() {
  const source = responses['collection.findById'] as any
  return {
    ...source,
    files: [],
    children: [],
    catalogueMode: 'products',
    numberOfRecords: 3,
    page: { id: 'page-1', collectionId: 'campaign', showActionBar: true, assets: {}, blocks: [
      { id: 'block-1', type: 'products', size: 'full', data: { title: '', layout: null, collectionId: null } },
    ] },
  }
}

async function fixture(page: Page, products: ReturnType<typeof product>[], total = products.length, collection = pageWithProductsBlock()) {
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? collection
      : name === 'catalogue.list' ? { products, total, fields, cardTitleField: null }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: new URL(test.info().project.use.baseURL!).hostname, path: '/' }])
}

test('a Products block draws the catalogue of the collection it is on', async ({ page }) => {
  const products = [product(0, 'BOT-CIT-250', 'Autumn'), product(1, 'BOT-GIN-250', 'Autumn')]
  await fixture(page, products)
  await page.goto('/collections/campaign')

  await expect(page.getByRole('link', { name: 'BOT-CIT-250', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'BOT-GIN-250', exact: true })).toBeVisible()
})

test('a collection outgrowing one page of products points to the full catalogue', async ({ page }) => {
  const products = Array.from({ length: 96 }, (_, i) => product(i, `SKU-${i}`, 'Autumn'))
  await fixture(page, products, 240)
  await page.goto('/collections/campaign')

  const notice = page.getByRole('link', { name: /Showing 96 of 240 products/ })
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('href', /\/catalogue\?collection=campaign/)
})

test('a field on the products narrows the block through the collection filter bar', async ({ page }) => {
  const products = [product(0, 'BOT-CIT-250', 'Autumn'), product(1, 'BOT-GIN-250', 'Spring')]
  await fixture(page, products)
  await page.goto('/collections/campaign')
  await expect(page.getByRole('link', { name: 'BOT-CIT-250', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('checkbox', { name: 'Season', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Season,/ }).click()
  await page.getByRole('checkbox', { name: 'Autumn', exact: true }).check()

  await expect(page.getByRole('link', { name: 'BOT-CIT-250', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'BOT-GIN-250', exact: true })).toHaveCount(0)
})

test('select all includes product blocks and selecting twice clears them', async ({ page }) => {
  await fixture(page, [product(0, 'SKU-1', 'Autumn'), product(1, 'SKU-2', 'Spring')])
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Select All in', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Select SKU-1', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Select SKU-2', exact: true })).toBeChecked()
  await expect(page.locator('.dashboard-layout-topbar__selector')).toContainText('2 items selected')
  await expect(page.getByRole('button', { name: 'Download selection' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select all items in this collection' }).click()
  await expect(page.getByRole('checkbox', { name: 'Select SKU-1', exact: true })).not.toBeChecked()
})


for (const layout of ['automatic', 'products', 'files']) {
  test(`a personal collection shows files and products with the ${layout} layout`, async ({ page }) => {
    const products = [product(0, 'PERSONAL-001', 'Winter')]
    const source = responses['collection.findById'] as any
    const collection = { ...pageWithProductsBlock(), public: false, ownerId: 'preview-user', synchronized: false, canEdit: true, files: source.files.slice(0, 1), numberOfRecords: 1 }
    if (layout === 'automatic') collection.page = null as any
    if (layout === 'files') collection.page.blocks = [{ id: 'file-block', type: 'files', size: 'full', data: { title: '', layout: null, collectionId: null } }]
    await fixture(page, products, 1, collection)
    await page.goto('/collections/campaign')
    await expect(page.getByRole('link', { name: 'PERSONAL-001', exact: true })).toHaveCount(1)
    await expect(page.getByText(source.files[0].name, { exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: 'Select All in', exact: true }).click()
    await expect(page.locator('.dashboard-layout-topbar__selector')).toContainText('2 items selected')
    await expect(page.getByRole('button', { name: 'Download selection' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
    await page.getByRole('button', { name: 'Collection actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Collection settings', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('What readers browse here')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Add by reference', exact: true })).toBeVisible()
    await expect(dialog.getByText('This collection can hold files and products. Its contents are displayed automatically.')).toBeVisible()
  })
}
