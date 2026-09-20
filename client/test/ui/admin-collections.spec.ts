import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

const collections = [{
  id: 'campaign', name: 'Autumn essentials', public: true, draft: false, synchronized: false,
  children: [], page: { id: 'page-1' }, thumbnailURL: null, orphanedAt: null, orphanedReason: null,
  orphanedFromName: null, parentId: null,
}]

async function fixture(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'user.me' ? { ...(responses[name] as object), role: 'admin' }
      : name === 'collection.treeAdmin' ? collections
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return { errors }
}

// An admin who runs the collections should not have to leave the dashboard,
// find the collection in the menu and hunt for the pencil to arrange its page.
test('a collection row opens its page editor, and the collection itself in a new tab', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/admin/collections')

  const row = page.getByRole('listitem').filter({ hasText: 'Autumn essentials' })
  const open = row.getByRole('link', { name: 'Open Autumn essentials' })
  await expect(open).toHaveAttribute('href', '/collections/campaign')
  await expect(open).toHaveAttribute('target', '_blank')

  await row.getByRole('link', { name: 'Edit the page of Autumn essentials' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign\/edit$/)
  await expect(page.getByRole('heading', { name: /Editing/ })).toBeVisible()
  expect(errors).toEqual([])
})
