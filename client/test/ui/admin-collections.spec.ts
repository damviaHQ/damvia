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
import { expect, test } from './lib/trpc'

const collections = [{
  id: 'campaign', name: 'Autumn essentials', public: true, draft: false, synchronized: false,
  children: [], page: { id: 'page-1' }, thumbnailURL: null, orphanedAt: null, orphanedReason: null,
  orphanedFromName: null, parentId: null,
}]

// An admin who runs the collections should not have to leave the dashboard,
// find the collection in the menu and hunt for the pencil to arrange its page.
test('a collection row opens its page editor, and the collection itself in a new tab', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'collection.treeAdmin': collections }, { role: 'admin' })
  await page.goto('/admin/collections')

  const row = page.getByRole('listitem').filter({ hasText: 'Autumn essentials' })
  const open = row.getByRole('link', { name: 'Open Autumn essentials' })
  await expect(open).toHaveAttribute('href', '/collections/campaign')
  await expect(open).toHaveAttribute('target', '_blank')

  // The collection's own settings are named for what they are, so neither
  // button reads as "edit" while the other one edits the page.
  await expect(row.getByRole('button', { name: 'Settings of Autumn essentials' })).toBeVisible()

  await row.getByRole('link', { name: 'Edit the page of Autumn essentials' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign\/edit$/)
  await expect(page.getByRole('heading', { name: /Editing/ })).toBeVisible()
})
