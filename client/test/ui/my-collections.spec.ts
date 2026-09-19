import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

const personal = (id: string, name: string, children: any[] = []): any => ({
  id, name, children, ownerId: 'preview-user', public: false, canEdit: true,
  numberOfFiles: 0, sampleFiles: [], page: null,
})

async function fixture(page: Page, tree: any[] = []) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data = responses[name] ?? []
    if (name === 'collection.tree' || name === 'collection.ListPrivateCollections') data = tree
    if (name === 'collection.createUserCollection') {
      const input = route.request().postDataJSON()
      expect(input).toEqual({ name: 'Launch shortlist' })
      const created = personal('created', input.name)
      tree.push(created)
      data = created
    }
    if (name === 'collection.findById') {
      const input = JSON.parse(new URL(route.request().url()).searchParams.get('input')!)
      data = { ...(responses[name] as object), ...personal(input, input === 'created' ? 'Launch shortlist' : 'Nested collection'), files: [], parent: null }
    }
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return errors
}

test('empty My collections is a keyboard-accessible destination with a working create action', async ({ page }) => {
  const errors = await fixture(page)
  await page.goto('/collections/campaign')
  const link = page.locator('aside').getByRole('link', { name: 'My collections', exact: true })
  await expect(link).toHaveCSS('cursor', 'pointer')
  await expect(page.getByRole('button', { name: 'Expand My collections', exact: true })).toHaveCount(0)
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/collections$/)
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toBeVisible()
  await page.screenshot({ path: '/tmp/damvia-my-collections-empty.png' })
  await page.getByRole('button', { name: 'Create your first collection', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Collection name', { exact: true }).fill('Launch shortlist')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/collections\/created$/)
  await expect(dialog).toBeHidden()
  await expect(page.locator('aside').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
  await link.click()
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toHaveCount(0)
  await expect(page.locator('main').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('personal trees match library rows and disclosure stays separate from navigation', async ({ page }) => {
  const tree = [personal('zulu', 'Zulu'), personal('alpha', 'Alpha', [personal('nested', 'Nested collection')]),
    { ...personal('public', 'Public collection'), public: true },
    { ...personal('shared', 'Someone else’s collection'), ownerId: 'other-user' }]
  const errors = await fixture(page, tree)
  await page.goto('/collections')
  const main = page.locator('main')
  await expect(main.locator('article')).toHaveCount(2)
  await expect(main.locator('article').first()).toContainText('Alpha')
  await expect(main.getByText('Public collection')).toHaveCount(0)
  await expect(main.getByText('Someone else’s collection')).toHaveCount(0)
  const sidebar = page.locator('aside')
  await sidebar.getByRole('button', { name: 'Expand Alpha', exact: true }).click()
  await expect(page).toHaveURL(/\/collections$/)
  await sidebar.getByRole('link', { name: 'Nested collection', exact: true }).click()
  await expect(page).toHaveURL(/\/collections\/nested$/)
  const active = sidebar.getByRole('link', { name: 'Nested collection', exact: true })
  await expect(active).toHaveCSS('font-weight', '700')
  await main.hover()
  const activeBackground = await active.evaluate(element => getComputedStyle(element).backgroundColor)
  expect(activeBackground).not.toBe('rgba(0, 0, 0, 0)')
  const library = sidebar.getByRole('link', { name: 'Autumn essentials', exact: true })
  for (const property of ['height', 'font-size', 'padding-left', 'padding-right', 'cursor']) {
    const expected = await library.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property)
    await expect(active).toHaveCSS(property, expected)
  }
  await expect(sidebar.locator('[data-tree-connector]')).toHaveCount(6)
  await page.screenshot({ path: '/tmp/damvia-my-collections-tree.png' })
  await sidebar.getByRole('button', { name: 'Collapse My collections', exact: true }).click()
  await expect(active).toBeHidden()
  await expect(page).toHaveURL(/\/collections\/nested$/)
  await sidebar.getByRole('link', { name: 'My collections', exact: true }).click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(sidebar.getByRole('link', { name: 'Alpha', exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/damvia-my-collections-list.png' })
  await library.click()
  await main.hover()
  await expect(library).toHaveCSS('background-color', activeBackground)
  await page.getByRole('button', { name: 'Create collection', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(errors).toEqual([])
})

test('loading and failed requests do not show the empty collection invitation', async ({ page }) => {
  await fixture(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/trpc/collection.tree*', async route => {
    await pending
    await route.fulfill({ status: 500, json: { error: { message: 'Unavailable', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } } })
  })
  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: 'My collections', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toHaveCount(0)
  release()
  await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t load your collections' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toHaveCount(0)
  await page.route('**/trpc/collection.tree*', route => route.fulfill({ json: { result: { data: [] } } }))
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toBeVisible()
})
