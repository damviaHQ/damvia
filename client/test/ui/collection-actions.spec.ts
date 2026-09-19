import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

const collection = { id: 'personal', name: 'Launch shortlist', public: false, ownerId: 'preview-user', canEdit: true, children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: null, synchronized: false, invitations: [], limitedToGroupIds: [] }

async function fixture(page: Page, { editable = true, guest = false, failSave = false } = {}) {
  const item = { ...collection, canEdit: editable }
  let saved = false
  const errors: string[] = []
  const calls: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    calls.push(name)
    let data = responses[name] ?? []
    if (name === 'collection.tree') data = [item]
    if (name === 'collection.findById') data = item
    if (name === 'user.me' && guest) data = { ...(responses[name] as object), role: 'guest' }
    if (name === 'favorite.addCollection' || name === 'favorite.removeCollection') {
      expect(route.request().postDataJSON()).toEqual({ collectionId: item.id })
      if (failSave) {
        await route.fulfill({ status: 500, json: { error: { message: 'Could not save favorite', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } } })
        return
      }
      saved = name === 'favorite.addCollection'
    }
    if (name === 'favorite.listCollections') data = saved ? [item] : []
    if (name === 'favorite.list') data = [(responses['collection.findById'] as any).files[0]]
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return { errors, calls }
}

test('collection menu aligns to its trigger and opens edit and share directly', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections')
  const card = page.locator('main article').first()
  await card.hover()
  const trigger = card.getByRole('button', { name: 'Actions for Launch shortlist', exact: true })
  const a = (await trigger.boundingBox())!
  await trigger.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  const b = (await menu.boundingBox())!
  expect(Math.abs((a.x + a.width) - (b.x + b.width))).toBeLessThan(1)
  expect(Math.abs(b.y - a.y - a.height - 4)).toBeLessThan(1)
  for (const name of ['Open collection', 'Add to favorites', 'Share collection', 'Edit collection']) {
    await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible()
  }
  await page.screenshot({ path: '/tmp/damvia-collection-actions-menu.png' })
  await menu.getByRole('menuitem', { name: 'Edit collection', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toHaveValue('Launch shortlist')
  await page.keyboard.press('Escape')
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Share collection', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Share collection', exact: true })).toBeVisible()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('dialog').getByLabel('Guest email', { exact: true }).fill('guest@example.test')
  await page.getByRole('dialog').getByRole('button', { name: 'Copy Link', exact: true }).click()
  await expect(page.getByText('Invitation link copied!', { exact: true })).toBeVisible()
  const invitation = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  expect(invitation.pathname).toBe('/collections/personal')
  expect(JSON.parse(Buffer.from(invitation.searchParams.get('auth_params')!, 'base64').toString())).toMatchObject({ collectionId: 'personal', email: 'guest@example.test' })
  await page.keyboard.press('Escape')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'Open collection', exact: true }).click()
  await expect(page).toHaveURL(/\/collections\/personal$/)
  expect(errors).toEqual([])
})

test('collection stars persist across reloads and favorites show collections alongside files', async ({ page }) => {
  const { errors } = await fixture(page, { editable: false })
  await page.goto('/collections')
  const star = page.getByRole('button', { name: 'Add to favorites: Launch shortlist', exact: true })
  await star.click()
  await expect(page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Collections', exact: true })).toContainText('Launch shortlist')
  await expect(page.getByRole('region', { name: 'Assets', exact: true })).toContainText('Campaign — Sand.jpg')
  await page.screenshot({ path: '/tmp/damvia-collection-favorites.png' })
  await page.locator('main article').first().hover()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Edit collection', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Share collection', exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Remove from favorites', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Collections', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Assets', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('failed favorites leave the star unchanged and show a useful error', async ({ page }) => {
  await fixture(page, { failSave: true })
  await page.goto('/collections')
  const star = page.getByRole('button', { name: 'Add to favorites: Launch shortlist', exact: true })
  await star.click()
  await expect(page.getByText('Could not save favorite', { exact: true })).toBeVisible()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await expect(star).toBeEnabled()
})

test('guest collection pages do not expose or request favorites', async ({ page }) => {
  const { calls } = await fixture(page, { guest: true, editable: false })
  await page.goto('/collections/personal')
  await expect(page.locator('.collection__path')).toContainText('Launch shortlist')
  await expect(page.getByRole('button', { name: /favorites: Launch shortlist/ })).toHaveCount(0)
  expect(calls).not.toContain('favorite.listCollections')
})
