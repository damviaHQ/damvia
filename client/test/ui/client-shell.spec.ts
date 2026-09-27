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
import { expect, test } from './lib/trpc'

const welcome = {
  id: 'welcome', name: 'Welcome', showActionBar: true,
  blocks: [
    { id: 'hero', type: 'hero', size: 'full', position: 0, data: { title: 'Welcome to the library', subtitle: 'Discover our latest campaign' } },
    { id: 'files', type: 'files', size: 'full', position: 1, data: { collectionId: 'campaign', title: 'Campaign assets' } },
  ],
}

test('page tools stay outside the hero and scrolling content, with account anchored in the sidebar', async ({ page, mockTrpc, shot }) => {
  await mockTrpc({
    'collection.findById': { ...collection, canEdit: true, invitations: [], limitedToGroupIds: [] },
    'page.findById': welcome,
  }, { role: 'admin' })
  await page.goto('/pages/welcome')
  const tools = page.getByRole('banner', { name: 'Page tools' })
  // The page filters sit in the tools, above the hero, never in the content.
  await expect(tools.getByRole('button', { name: 'Add filter', exact: true })).toBeVisible()
  await expect(tools.getByRole('textbox', { name: 'Filter by name' })).toBeVisible()
  await expect(page.locator('main .page-hero')).toBeVisible()
  await expect(page.locator('main').getByRole('button', { name: 'Add filter', exact: true })).toHaveCount(0)
  const account = page.locator('aside').getByRole('button', { name: 'My account', exact: true })
  const before = (await tools.boundingBox())!
  const accountBefore = (await account.boundingBox())!
  expect(accountBefore.y).toBeGreaterThan(900)
  expect((await page.locator('.page-hero').boundingBox())!.y).toBeGreaterThanOrEqual(before.y + before.height)
  await page.locator('main').evaluate(el => { el.scrollTop = 400 })
  await expect.poll(() => page.locator('main').evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect((await tools.boundingBox())!.y).toBe(before.y)
  expect((await account.boundingBox())!.y).toBe(accountBefore.y)
  await page.locator('main').evaluate(el => { el.scrollTop = 0 })
  await expect(tools.getByRole('button', { name: 'Add filter', exact: true })).toBeVisible()
  await expect(tools.getByRole('button', { name: 'Display preferences', exact: true })).toBeVisible()
  await shot('shell-hero')
  await tools.getByRole('button', { name: 'Page actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Edit page', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Collection actions' }).click()
  for (const name of ['Share collection', 'Collection settings', 'Edit page']) await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
  await shot('shell-actions')
})
