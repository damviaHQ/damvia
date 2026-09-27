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
import { collection as source, files as sampleFiles } from './lib/fixtures'
import { expect, serverError, test, type MockTrpc } from './lib/trpc'

// Removing a favorite waits until the spec says whether the save succeeds.
async function fixture(mockTrpc: MockTrpc) {
  const collection = { ...source, id: 'personal', name: 'Launch shortlist', public: false, ownerId: 'preview-user', canEdit: false, parent: null, parentId: null, children: [], files: [], sampleFiles: [] }
  let files = [sampleFiles[0]]
  let collections = [collection]
  const pending = new Map<string, (success: boolean) => void>()
  const remove = (name: string, done: () => void) => async () => {
    const success = await new Promise<boolean>(resolve => pending.set(name, resolve))
    if (!success) return serverError('Could not save favorite')
    done()
    return null
  }
  await mockTrpc({
    'favorite.list': () => files,
    'favorite.listCollections': () => collections,
    'collection.tree': [collection],
    'favorite.remove': remove('favorite.remove', () => { files = [] }),
    'favorite.removeCollection': remove('favorite.removeCollection', () => { collections = [] }),
  })
  return { pending, file: sampleFiles[0] }
}

for (const kind of ['file', 'collection']) {
  for (const succeeds of [true, false]) {
    test(`${kind} disappears from Favorites before the save finishes and ${succeeds ? 'stays removed' : 'returns on failure'}`, async ({ page, mockTrpc }) => {
      const { pending, file } = await fixture(mockTrpc)
      await page.goto('/favorites')
      const name = kind === 'file' ? file.name : 'Launch shortlist'
      const endpoint = kind === 'file' ? 'favorite.remove' : 'favorite.removeCollection'
      const section = page.getByRole('region', { name: kind === 'file' ? 'Assets' : 'Collections', exact: true })
      await section.getByRole('button', { name: `Remove from favorites: ${name}`, exact: true }).click()
      await expect(section).toHaveCount(0)
      await expect.poll(() => pending.has(endpoint)).toBe(true)
      pending.get(endpoint)!(succeeds)
      if (succeeds) {
        // Navigate away and back without reloading to check the settled shared cache.
        await page.getByRole('link', { name: 'Autumn essentials', exact: true }).first().click()
        await page.getByRole('link', { name: 'Favorites', exact: true }).click()
        await expect(section).toHaveCount(0)
      } else {
        await expect(section.getByRole('button', { name: `Remove from favorites: ${name}`, exact: true })).toBeEnabled()
        await expect(page.getByText('Could not save favorite', { exact: true })).toBeVisible()
      }
    })
  }
}

test('removing in preview immediately updates the underlying file star while the save is pending', async ({ page, mockTrpc }) => {
  const { pending, file } = await fixture(mockTrpc)
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: `Preview ${file.name}`, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Remove from favorites', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Add to favorites', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Close preview', exact: true }).click()
  const star = page.getByRole('button', { name: `Add to favorites: ${file.name}`, exact: true })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await expect(star).toBeDisabled()
  await expect.poll(() => pending.has('favorite.remove')).toBe(true)
  pending.get('favorite.remove')!(true)
  await expect(star).toBeEnabled()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
})

test('list view clears the file star immediately and restores it on a failed save', async ({ page, mockTrpc }) => {
  const { pending, file } = await fixture(mockTrpc)
  await page.addInitScript(() => localStorage.setItem('dam_display_preferences', JSON.stringify({ photo: 'list' })))
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: `Remove ${file.name} from favorites`, exact: true }).click()
  const star = page.getByRole('button', { name: `Add ${file.name} to favorites`, exact: true })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await expect(star).toBeDisabled()
  await expect.poll(() => pending.has('favorite.remove')).toBe(true)
  pending.get('favorite.remove')!(false)
  await expect(page.getByRole('button', { name: `Remove ${file.name} from favorites`, exact: true })).toBeEnabled()
})
