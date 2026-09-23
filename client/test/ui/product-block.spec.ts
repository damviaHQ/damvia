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

async function fixture(page: Page, products: ReturnType<typeof product>[], total = products.length) {
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? pageWithProductsBlock()
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

  await expect(page.getByRole('link', { name: /BOT-CIT-250/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /BOT-GIN-250/ })).toBeVisible()
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
  await expect(page.getByRole('link', { name: /BOT-CIT-250/ })).toBeVisible()

  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('checkbox', { name: 'Season', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Season,/ }).click()
  await page.getByRole('checkbox', { name: 'Autumn', exact: true }).check()

  await expect(page.getByRole('link', { name: /BOT-CIT-250/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /BOT-GIN-250/ })).toHaveCount(0)
})
