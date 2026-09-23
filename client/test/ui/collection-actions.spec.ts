import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

const collection = { id: 'personal', name: 'Launch shortlist', public: false, ownerId: 'preview-user', canEdit: true, children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: null, synchronized: false, invitations: [], limitedToGroupIds: [] }

async function fixture(page: Page, { editable = true, guest = false, failSave = false, synchronized = false, failRename = false, failDelete = false, synchronizedParent = false, missingParent = false } = {}) {
  const parent = synchronizedParent ? { ...collection, id: 'parent', synchronized: true } : null
  const item = { ...collection, canEdit: editable, synchronized, parentId: parent?.id ?? null, parent }
  let deleted = false
  let saved = false
  const errors: string[] = []
  const calls: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    calls.push(name)
    let data = responses[name] ?? []
    if (name === 'collection.tree') data = deleted ? [] : [{ ...item, parent: missingParent ? null : parent }]
    if (name === 'collection.findById') data = item
    if (name === 'collection.remove') {
      expect(route.request().postDataJSON()).toBe(item.id)
      if (failDelete) {
        await route.fulfill({ status: 403, json: { error: { message: 'This collection cannot be edited.', code: -32003, data: { code: 'FORBIDDEN', httpStatus: 403 } } } })
        return
      }
      deleted = true
      data = null
    }
    if (name === 'collection.rename') {
      expect(route.request().postDataJSON()).toEqual({ id: item.id, name: 'New shortlist' })
      if (failRename) {
        await route.fulfill({ status: 403, json: { error: { message: 'This collection cannot be edited.', code: -32003, data: { code: 'FORBIDDEN', httpStatus: 403 } } } })
        return
      }
      item.name = route.request().postDataJSON().name
      data = item
    }
    if (name === 'user.me' && guest) data = { ...(responses[name] as object), role: 'guest' }
    if (name === 'favorite.addCollection' || name === 'favorite.removeCollection') {
      expect(route.request().postDataJSON()).toEqual({ collectionId: item.id })
      if (failSave) {
        await route.fulfill({ status: 500, json: { error: { message: 'Could not save favorite', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } } })
        return
      }
      saved = name === 'favorite.addCollection'
    }
    if (name === 'favorite.listCollections') data = saved && !deleted ? [item] : []
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
  for (const name of ['Rename collection', 'Share collection', 'Edit collection', 'Delete collection']) {
    await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible()
  }
  await expect(menu.getByRole('menuitem')).toHaveCount(4)
  await expect(menu.getByRole('menuitem', { name: /Open collection|favorites/ })).toHaveCount(0)
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
  await card.getByRole('link', { name: 'Open Launch shortlist', exact: true }).click()
  await expect(page).toHaveURL(/\/collections\/personal$/)
  expect(errors).toEqual([])
})

test('collection search menu entry opens search scoped to the collection and its sub-collections', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections/personal')
  await page.getByRole('button', { name: 'Collection actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Search in this collection', exact: true }).click()
  await expect(page).toHaveURL(/from_collection=personal/)
  await expect(page).toHaveURL(/search_scope=current_with_sub/)
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
  await expect(page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true }).click()
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


test('rename updates the card and sidebar and rejects empty names', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections')
  await page.locator('main article').hover()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rename collection', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const input = dialog.getByLabel('Collection name', { exact: true })
  await expect(input).toHaveValue('Launch shortlist')
  await expect(input).toBeFocused()
  await input.fill('   ')
  await expect(dialog.getByRole('button', { name: 'Rename', exact: true })).toBeDisabled()
  await input.fill('  New shortlist  ')
  await input.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('main').getByRole('link', { name: 'New shortlist', exact: true })).toBeVisible()
  await expect(page.locator('aside').getByRole('link', { name: 'New shortlist', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('synchronized collections offer edit and share but no rename', async ({ page }) => {
  await fixture(page, { synchronized: true })
  await page.goto('/collections')
  await page.locator('main article').hover()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(3)
  await expect(page.getByRole('menuitem', { name: 'Rename collection', exact: true })).toHaveCount(0)
})

test('rename failures preserve the name and keep the dialog open', async ({ page }) => {
  await fixture(page, { failRename: true })
  await page.goto('/collections')
  await page.locator('main article').hover()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rename collection', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Collection name', { exact: true }).fill('New shortlist')
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('This collection cannot be edited.')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('main').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
})


test('delete requires confirmation and refreshes the collection list and sidebar', async ({ page }) => {
  const { calls, errors } = await fixture(page)
  await page.goto('/collections')
  const trigger = page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true })
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Launch shortlist')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(calls).not.toContain('collection.remove')
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete collection', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('main article')).toHaveCount(0)
  await expect(page.locator('aside').getByRole('link', { name: 'Launch shortlist', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/collections$/)
  expect(calls.filter(call => call === 'collection.remove')).toHaveLength(1)
  expect(errors).toEqual([])
})

test('delete failures preserve the collection and keep confirmation open', async ({ page }) => {
  await fixture(page, { failDelete: true })
  await page.goto('/collections')
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Delete collection', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('This collection cannot be edited.')
  await expect(dialog.getByRole('button', { name: 'Delete collection', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('main').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
})

for (const missingParent of [false, true]) {
  test(`children of synchronized collections hide delete (missing parent: ${missingParent})`, async ({ page }) => {
    const { calls } = await fixture(page, { synchronizedParent: true, missingParent })
    await page.goto('/collections')
    await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit collection', exact: true })).toBeVisible()
    if (missingParent) await expect.poll(() => calls.includes('collection.findById')).toBe(true)
    await expect(page.getByRole('menuitem', { name: 'Delete collection', exact: true })).toHaveCount(0)
    expect(calls).not.toContain('collection.remove')
  })
}


test('deleting a favorited collection refreshes favorites without leaving the page', async ({ page }) => {
  const { calls, errors } = await fixture(page)
  await page.goto('/collections')
  await page.getByRole('button', { name: 'Add to favorites: Launch shortlist', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  const assetQueries = calls.filter(call => call === 'favorite.list').length
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete collection', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Collections', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Assets', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/favorites$/)
  await expect.poll(() => calls.filter(call => call === 'favorite.list').length).toBeGreaterThan(assetQueries)
  expect(errors).toEqual([])
})


test('dismissing a collection menu with an outside click hides its trigger, while Escape restores keyboard focus', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections')
  const card = page.locator('main article').first()
  const trigger = card.getByRole('button', { name: 'Actions for Launch shortlist', exact: true, includeHidden: true })
  const actions = trigger.locator('..')
  const heading = (await page.getByRole('heading', { name: 'My collections', exact: true }).boundingBox())!
  await card.hover()
  await trigger.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.mouse.move(heading.x + 5, heading.y + 5)
  await expect(actions).toHaveCSS('opacity', '1')
  await page.mouse.click(heading.x + 5, heading.y + 5)
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  // Menu focus restoration runs after unmount, so observe the settled state.
  await page.waitForTimeout(100)
  await expect(actions).toHaveCSS('opacity', '0')
  await expect(trigger).not.toBeFocused()
  await card.hover()
  await expect(actions).toHaveCSS('opacity', '1')
  await page.mouse.move(heading.x + 5, heading.y + 5)
  await page.keyboard.press('Tab')
  await trigger.focus()
  await expect(actions).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(actions).toHaveCSS('opacity', '1')
  expect(errors).toEqual([])
})
