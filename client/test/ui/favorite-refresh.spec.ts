import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

async function fixture(page: Page) {
  const source = responses['collection.findById'] as any
  const collection = { ...source, id: 'personal', name: 'Launch shortlist', public: false, ownerId: 'preview-user', canEdit: false, parent: null, parentId: null, children: [], files: [], sampleFiles: [] }
  let files = [source.files[0]]
  let collections = [collection]
  const pending = new Map<string, (success: boolean) => void>()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    if (name === 'favorite.remove' || name === 'favorite.removeCollection') {
      const success = await new Promise<boolean>(resolve => pending.set(name, resolve))
      if (!success) {
        await route.fulfill({ status: 500, json: { error: { message: 'Could not save favorite', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } } })
        return
      }
      if (name === 'favorite.remove') files = []
      else collections = []
    }
    const data = name === 'favorite.list' ? files : name === 'favorite.listCollections' ? collections
      : name === 'collection.tree' ? [collection] : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return { pending, errors, file: source.files[0] }
}

for (const kind of ['file', 'collection']) {
  for (const succeeds of [true, false]) {
    test(`${kind} disappears from Favorites before the save finishes and ${succeeds ? 'stays removed' : 'returns on failure'}`, async ({ page }) => {
      const { pending, errors, file } = await fixture(page)
      await page.goto('/favorites')
      const name = kind === 'file' ? file.name : 'Launch shortlist'
      const endpoint = kind === 'file' ? 'favorite.remove' : 'favorite.removeCollection'
      const section = page.getByRole('region', { name: kind === 'file' ? 'Assets' : 'Collections', exact: true })
      await section.getByRole('button', { name: `Remove from favorites: ${name}`, exact: true }).click()
      await expect(section).toHaveCount(0)
      await expect.poll(() => pending.has(endpoint)).toBe(true)
      pending.get(endpoint)!(succeeds)
      if (succeeds) {
        await expect.poll(() => errors).toEqual([])
        // Navigate away and back without reloading to check the settled shared cache.
        await page.getByRole('link', { name: 'Autumn essentials', exact: true }).first().click()
        await page.getByRole('link', { name: 'Favorites', exact: true }).click()
        await expect(section).toHaveCount(0)
      } else {
        await expect(section.getByRole('button', { name: `Remove from favorites: ${name}`, exact: true })).toBeEnabled()
        await expect(page.getByText('Could not save favorite', { exact: true })).toBeVisible()
      }
      expect(errors).toEqual([])
    })
  }
}

test('removing in preview immediately updates the underlying file star while the save is pending', async ({ page }) => {
  const { pending, errors, file } = await fixture(page)
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
  expect(errors).toEqual([])
})

test('list view clears the file star immediately and restores it on a failed save', async ({ page }) => {
  const { pending, errors, file } = await fixture(page)
  await page.addInitScript(() => localStorage.setItem('dam_display_preferences', JSON.stringify({ photo: 'list' })))
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: `Remove ${file.name} from favorites`, exact: true }).click()
  const star = page.getByRole('button', { name: `Add ${file.name} to favorites`, exact: true })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await expect(star).toBeDisabled()
  await expect.poll(() => pending.has('favorite.remove')).toBe(true)
  pending.get('favorite.remove')!(false)
  await expect(page.getByRole('button', { name: `Remove ${file.name} from favorites`, exact: true })).toBeEnabled()
  expect(errors).toEqual([])
})
