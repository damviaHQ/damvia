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
import { collection as source } from './lib/fixtures'
import { expect, test } from './lib/trpc'

const collection = (id: string, name: string, publicCollection: boolean, children: any[] = []): any => ({
  ...source, id, name, public: publicCollection, ownerId: publicCollection ? 'other-user' : 'preview-user',
  parent: null, parentId: null, children, files: [], sampleFiles: [], numberOfFiles: 0, canEdit: false,
})
const libraryFavorite = collection('library-approved', 'Approved', true)
const privateFavorite = collection('private-approved', 'Approved', false)
const tree = [collection('campaigns', 'Campaigns', true, [collection('summer', 'Summer', true, [libraryFavorite])]),
  collection('shortlist', 'Launch shortlist', false, [privateFavorite])]
const favoriteFiles = [libraryFavorite, privateFavorite].map((parent, index) => ({ ...source.files[index], id: `favorite-${index}`, name: 'Hero photo.jpg', collectionId: parent.id }))

test('favorite collections and files show their full locations on thumbnail and name hover or keyboard focus', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc({ 'collection.tree': tree, 'favorite.listCollections': [libraryFavorite, privateFavorite], 'favorite.list': favoriteFiles })
  await page.goto('/favorites')
  const collections = page.getByRole('region', { name: 'Collections', exact: true }).locator('article')
  const files = page.getByRole('region', { name: 'Assets', exact: true }).locator('article')
  const paths = ['Library / Campaigns / Summer / Approved', 'My collections / Launch shortlist / Approved']
  for (let index = 0; index < paths.length; index++) {
    const thumbnail = collections.nth(index).getByRole('link', { name: 'Open Approved', exact: true })
    const label = collections.nth(index).getByRole('link', { name: 'Approved', exact: true })
    await thumbnail.hover()
    await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(paths[index])
    await label.hover()
    await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(paths[index])
    await expect(label).not.toHaveAttribute('title')
    await page.mouse.move(0, 0)
    await page.keyboard.press('Tab')
    await label.focus()
    await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(paths[index])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveCount(0)

    const file = files.nth(index)
    const preview = file.getByRole('button', { name: 'Preview Hero photo.jpg', exact: true })
    const name = file.getByRole('button', { name: 'Hero photo.jpg', exact: true })
    await preview.hover()
    await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(`${paths[index]} / Hero photo.jpg`)
    await name.hover()
    await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(`${paths[index]} / Hero photo.jpg`)
    await expect(name).not.toHaveAttribute('title')
    await page.mouse.move(0, 0)
    await page.keyboard.press('Tab')
    await name.focus()
    await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(`${paths[index]} / Hero photo.jpg`)
    await page.keyboard.press('Escape')
  }
  expect(api.count('collection.findById')).toBe(0)
  await collections.first().getByRole('link', { name: 'Open Approved', exact: true }).hover()
  await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(paths[0])
  await shot('favorites-path-tooltip')
  await files.first().getByRole('button', { name: 'Preview Hero photo.jpg', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close preview', exact: true }).click()
})
