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
import { expect, test, type MockTrpc } from './lib/trpc'

async function open(page: Page, mockTrpc: MockTrpc, automatic = false) {
  const product = { id: 'products-link', parentId: 'assets-link' as string | null, type: 'collection', collectionId: 'products', data: {}, collectionName: 'Independent products', position: 0, followsCollectionParent: automatic, children: [{ id: 'child-link', parentId: 'products-link', type: 'collection', collectionName: 'Product details', data: {}, position: 0 }] }
  const assets = { id: 'assets-link', parentId: null, type: 'collection', collectionName: 'Cloud assets', position: 0, synchronized: true, data: { sync: true }, children: [product] }
  const items: unknown[] = [assets, { id: 'catalogue-section', parentId: null, type: 'section', data: { label: 'Catalogue' }, position: 1 }]
  const api = await mockTrpc({
    'menuItem.list': items,
    // Moving the product link out of the synced branch puts it at the top level.
    'menuItem.move': (input: { parentId: string | null }) => {
      assets.children = []
      product.parentId = input.parentId
      items.push(product)
      return null
    },
  }, { role: 'admin' })
  await page.goto('/admin/menu-items')
  await page.locator('.items-tree__item').filter({ hasText: 'Cloud assets' }).getByRole('button', { name: 'Cloud assets' }).click()
  await page.locator('.items-tree__item').filter({ hasText: 'Independent products' }).getByRole('button', { name: 'Menu item actions' }).click()
  return api
}

test('a root product collection linked under a synced branch can move out through the menu', async ({ page, mockTrpc }) => {
  const api = await open(page, mockTrpc)
  await page.getByRole('menuitem', { name: 'Move to…' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Collections and their access rules stay unchanged.')
  await dialog.getByRole('combobox').click()
  await expect(page.getByRole('option', { name: 'Catalogue', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: /Product details|Independent products/ })).toHaveCount(0)
  await page.getByRole('option', { name: 'Top level', exact: true }).click()
  await dialog.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(api.inputs('menuItem.move')).toEqual([{ id: 'products-link', parentId: null }])
  await expect(page.locator('.items-tree__children').getByText('Independent products', { exact: true })).toHaveCount(0)
  await expect(page.locator('.items-tree__item').filter({ hasText: 'Independent products' })).toBeVisible()
})

test('generated entries explain the collection relationship instead of offering a menu move', async ({ page, mockTrpc }) => {
  const api = await open(page, mockTrpc, true)
  await expect(page.getByRole('menuitem', { name: 'Remove from menu' })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'About automatic placement' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('move the collection in Collection settings, or make it private')
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click()
  expect(api.count('menuItem.move')).toBe(0)
})
