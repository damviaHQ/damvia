import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

async function fixture(page: Page) {
  const source = responses['collection.findById'] as any
  const collection = (id: string, name: string, publicCollection: boolean, children: any[] = []) => ({
    ...source, id, name, public: publicCollection, ownerId: publicCollection ? 'other-user' : 'preview-user',
    parent: null, parentId: null, children, files: [], sampleFiles: [], numberOfFiles: 0, canEdit: false,
  })
  const libraryFavorite = collection('library-approved', 'Approved', true)
  const privateFavorite = collection('private-approved', 'Approved', false)
  const tree = [collection('campaigns', 'Campaigns', true, [collection('summer', 'Summer', true, [libraryFavorite])]),
    collection('shortlist', 'Launch shortlist', false, [privateFavorite])]
  const files = [libraryFavorite, privateFavorite].map((parent, index) => ({ ...source.files[index], id: `favorite-${index}`, name: 'Hero photo.jpg', collectionId: parent.id }))
  const calls: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    calls.push(name)
    const data = name === 'collection.tree' ? tree
      : name === 'favorite.listCollections' ? [libraryFavorite, privateFavorite]
      : name === 'favorite.list' ? files
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return { calls, errors }
}

test('favorite collections and files show their full locations on thumbnail and name hover or keyboard focus', async ({ page }) => {
  const { calls, errors } = await fixture(page)
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
  expect(calls).not.toContain('collection.findById')
  await collections.first().getByRole('link', { name: 'Open Approved', exact: true }).hover()
  await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(paths[0])
  await page.screenshot({ path: '/tmp/damvia-favorites-path-tooltip.png' })
  await files.first().getByRole('button', { name: 'Preview Hero photo.jpg', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close preview', exact: true }).click()
  expect(errors).toEqual([])
})
