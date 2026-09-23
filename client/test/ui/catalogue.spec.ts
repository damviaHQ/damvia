import { expect, test } from '@playwright/test'
import { responses } from './client-fixtures'

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

type Call = { name: string, input: any }

async function fixture(page: import('@playwright/test').Page, overrides: Record<string, unknown> = {}) {
  const errors: string[] = []
  const calls: Call[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/trpc/')[1]
    const raw = route.request().method() === 'POST' ? route.request().postData() : url.searchParams.get('input')
    calls.push({ name, input: raw ? JSON.parse(raw) : undefined })
    const data = name in overrides ? overrides[name]
      : name === 'catalogue.list' ? list
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return { errors, calls }
}

test('a card carries the reference, the title field and the visuals, and nothing else', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/catalogue')

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
  expect(errors).toEqual([])
})

test('a reader gets the list they were given, with a search box and no filter panel', async ({ page }) => {
  const { errors, calls } = await fixture(page)
  await page.goto('/catalogue')
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()

  // The facets and the readiness filter were tools of whoever builds the list.
  await expect(page.getByText('FILTERS')).toHaveCount(0)
  await expect(page.getByLabel('Readiness')).toHaveCount(0)
  expect(calls.some(call => call.name === 'catalogue.facets')).toBe(false)

  await page.getByLabel('Search products').fill('citron')
  await expect.poll(() => calls.filter(call => call.name === 'catalogue.list').at(-1)?.input?.search).toBe('citron')
  expect(errors).toEqual([])
})

test('a card opens the product page, which lists the values and the files', async ({ page }) => {
  const { errors } = await fixture(page, {
    'catalogue.get': {
      ...products[0],
      fields: list.fields.map(({ name, displayName, valueType, position }) => ({ name, displayName, valueType, position })),
      readinessLabels: { ready: 'Ready to use', incomplete: 'To complete', defined: true },
      cardTitleField: 'name',
      siblings: [{ ...products[1], recordKey: 'BOT-CIT-4PK' }],
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
  await expect(page.getByText('Other entries of Citron')).toBeVisible()
  expect(errors).toEqual([])
})

test('selecting products offers to add them to a collection and does not follow the reader away', async ({ page }) => {
  const { errors, calls } = await fixture(page)
  await page.goto('/catalogue')

  await page.getByLabel('Select BOT-CIT-250', { exact: true }).check()
  await expect(page.getByRole('button', { name: 'Add 1 to a collection' })).toBeVisible()
  await page.getByLabel('Select BOT-GIN-250', { exact: true }).check()
  await expect(page.getByRole('button', { name: 'Add 2 to a collection' })).toBeVisible()

  // The selection is shared with the library, where a product means nothing.
  await page.goto('/collections/campaign')
  await expect(page.locator('.collection__path')).toContainText('Autumn essentials')
  await page.goto('/catalogue')
  await expect(page.getByRole('button', { name: /Add \d+ to a collection/ })).toHaveCount(0)
  expect(calls.some(call => call.name === 'collection.getFiles' && call.input?.items?.some((item: any) => item.type === 'record'))).toBe(false)
  expect(errors).toEqual([])
})
