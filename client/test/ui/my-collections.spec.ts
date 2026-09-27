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
import { collection } from './lib/fixtures'
import { expect, serverError, test, type MockTrpc } from './lib/trpc'

const personal = (id: string, name: string, children: any[] = []): any => ({
  id, name, children, ownerId: 'preview-user', public: false, canEdit: true,
  numberOfFiles: 0, sampleFiles: [], page: null,
})

function fixture(mockTrpc: MockTrpc, tree: any[] = []) {
  return mockTrpc({
    'collection.tree': tree,
    'collection.ListPrivateCollections': tree,
    'collection.createUserCollection': (input: { name: string }) => {
      const created = personal('created', input.name)
      tree.push(created)
      return created
    },
    'collection.findById': (id: string) => ({ ...collection, ...personal(id, id === 'created' ? 'Launch shortlist' : 'Nested collection'), files: [], parent: null }),
  })
}

test('empty My collections is a keyboard-accessible destination with a working create action', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  const link = page.locator('aside').getByRole('link', { name: 'My collections', exact: true })
  await expect(link).toHaveCSS('cursor', 'pointer')
  await expect(page.getByRole('button', { name: 'Expand My collections', exact: true })).toHaveCount(0)
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/collections$/)
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toBeVisible()
  await shot('my-collections-empty')
  await page.getByRole('button', { name: 'Create your first collection', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('What this collection holds')).toHaveCount(0)
  await dialog.getByLabel('Collection name', { exact: true }).fill('Launch shortlist')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/collections\/created$/)
  expect(api.inputs('collection.createUserCollection')).toEqual([{ name: 'Launch shortlist' }])
  await expect(dialog).toBeHidden()
  await expect(page.locator('aside').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
  await link.click()
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toHaveCount(0)
  await expect(page.locator('main').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
})

test('personal trees match library rows and the chevron toggles without navigating', async ({ page, mockTrpc, shot }) => {
  const tree = [personal('zulu', 'Zulu'), personal('alpha', 'Alpha', [personal('nested', 'Nested collection')]),
    { ...personal('public', 'Public collection'), public: true },
    { ...personal('shared', 'Someone else’s collection'), ownerId: 'other-user' }]
  await fixture(mockTrpc, tree)
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
  await shot('my-collections-tree')
  await sidebar.getByRole('button', { name: 'Collapse My collections', exact: true }).click()
  await expect(active).toBeHidden()
  await expect(page).toHaveURL(/\/collections\/nested$/)
  await sidebar.getByRole('link', { name: 'My collections', exact: true }).click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(sidebar.getByRole('link', { name: 'Alpha', exact: true })).toBeVisible()
  await shot('my-collections-list')
  await library.click()
  await main.hover()
  await expect(library).toHaveCSS('background-color', activeBackground)
  await page.getByRole('button', { name: 'Create collection', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('loading and failed requests do not show the empty collection invitation', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  api.set({ 'collection.tree': async () => { await pending; return serverError('Unavailable') } })
  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: 'My collections', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toHaveCount(0)
  release()
  await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t load your collections' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toHaveCount(0)
  api.set({ 'collection.tree': [] })
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toBeVisible()
})

test('My collections label toggles the tree while navigating, with aligned sidebar labels and icons', async ({ page, mockTrpc, shot }) => {
  await fixture(mockTrpc, [personal('alpha', 'Alpha')])
  await page.goto('/favorites')
  const sidebar = page.locator('aside')
  const collections = sidebar.getByRole('link', { name: 'My collections', exact: true })
  const favorites = sidebar.getByRole('link', { name: 'Favorites', exact: true })
  const child = sidebar.getByRole('link', { name: 'Alpha', exact: true })
  const favoriteLabel = (await favorites.locator('span').last().boundingBox())!
  const collectionLabel = (await collections.locator('span').last().boundingBox())!
  expect(favoriteLabel.x).toBe(collectionLabel.x)
  const star = (await favorites.locator('svg').boundingBox())!
  const chevron = (await sidebar.getByRole('button', { name: 'Expand My collections', exact: true }).locator('svg').boundingBox())!
  expect(star.x + star.width / 2).toBe(chevron.x + chevron.width / 2)
  await expect(collections).toHaveAttribute('aria-expanded', 'false')
  await collections.click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(collections).toHaveAttribute('aria-expanded', 'true')
  await expect(child).toBeVisible()
  await collections.click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(collections).toHaveAttribute('aria-expanded', 'false')
  await expect(child).toBeHidden()
  await collections.focus()
  await page.keyboard.press('Enter')
  await expect(collections).toHaveAttribute('aria-expanded', 'true')
  await expect(child).toBeVisible()
  await child.click()
  await expect(page).toHaveURL(/\/collections\/alpha$/)
  await collections.click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(collections).toHaveAttribute('aria-expanded', 'false')
  await expect(child).toBeHidden()
  await favorites.click()
  await collections.click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(child).toBeVisible()
  await page.locator('main').hover()
  await shot('sidebar-alignment')
})
