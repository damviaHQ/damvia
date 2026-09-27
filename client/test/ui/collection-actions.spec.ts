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
import { files } from './lib/fixtures'
import { expect, forbidden, serverError, test, type MockTrpc } from './lib/trpc'

const collection = { id: 'personal', name: 'Launch shortlist', public: false, ownerId: 'preview-user', canEdit: true, children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: null, synchronized: false, invitations: [], limitedToGroupIds: [] }

type Options = { editable?: boolean, guest?: boolean, failSave?: boolean, synchronized?: boolean, failRename?: boolean, failDelete?: boolean, synchronizedParent?: boolean, missingParent?: boolean }

function fixture(mockTrpc: MockTrpc, { editable = true, guest = false, failSave = false, synchronized = false, failRename = false, failDelete = false, synchronizedParent = false, missingParent = false }: Options = {}) {
  const parent = synchronizedParent ? { ...collection, id: 'parent', synchronized: true } : null
  const item = { ...collection, canEdit: editable, synchronized, parentId: parent?.id ?? null, parent }
  let deleted = false
  let saved = false
  const favorite = (add: boolean) => () => {
    if (failSave) return serverError('Could not save favorite')
    saved = add
    return null
  }
  return mockTrpc({
    'collection.tree': () => deleted ? [] : [{ ...item, parent: missingParent ? null : parent }],
    'collection.findById': item,
    'collection.remove': () => {
      if (failDelete) return forbidden('This collection cannot be edited.')
      deleted = true
      return null
    },
    'collection.rename': (input: { id: string, name: string }) => {
      if (failRename) return forbidden('This collection cannot be edited.')
      item.name = input.name
      return item
    },
    'favorite.addCollection': favorite(true),
    'favorite.removeCollection': favorite(false),
    'favorite.listCollections': () => saved && !deleted ? [item] : [],
    'favorite.list': [files[0]],
    'collection.invitation.create': null,
  }, { role: guest ? 'guest' : 'member' })
}

test('collection menu aligns to its trigger and opens edit and share directly', async ({ page, mockTrpc, shot }) => {
  await fixture(mockTrpc)
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
  await shot('collection-actions-menu')
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
})

test('the search filters button of a collection opens search scoped to the collection and its sub-collections', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc)
  await page.goto('/collections/personal')
  await page.getByRole('banner', { name: 'Page tools' }).getByRole('button', { name: 'Search filters', exact: true }).click()
  await expect(page).toHaveURL(/\/search\?/)
  await expect(page).toHaveURL(/from_collection=personal/)
  await expect(page).toHaveURL(/search_scope=current_with_sub/)
  await expect(page.locator('[data-search-panel]').getByRole('link', { name: 'Back to Launch shortlist', exact: true })).toBeVisible()
  await expect.poll(() => api.last('collection.search')).toMatchObject({ collectionId: 'personal' })
})

test('collection stars persist across reloads and favorites show collections alongside files', async ({ page, mockTrpc, shot }) => {
  const api = await fixture(mockTrpc, { editable: false })
  await page.goto('/collections')
  const star = page.getByRole('button', { name: 'Add to favorites: Launch shortlist', exact: true })
  await star.click()
  await expect(page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(api.inputs('favorite.addCollection')).toEqual([{ collectionId: 'personal' }])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Collections', exact: true })).toContainText('Launch shortlist')
  await expect(page.getByRole('region', { name: 'Assets', exact: true })).toContainText('Campaign — Sand.jpg')
  await shot('collection-favorites')
  await page.locator('main article').first().hover()
  await expect(page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Collections', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Assets', exact: true })).toBeVisible()
  expect(api.inputs('favorite.removeCollection')).toEqual([{ collectionId: 'personal' }])
})

test('failed favorites leave the star unchanged and show a useful error', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, { failSave: true })
  await page.goto('/collections')
  const star = page.getByRole('button', { name: 'Add to favorites: Launch shortlist', exact: true })
  await star.click()
  await expect(page.getByText('Could not save favorite', { exact: true })).toBeVisible()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await expect(star).toBeEnabled()
  expect(api.inputs('favorite.addCollection')).toEqual([{ collectionId: 'personal' }])
})

test('guest collection pages do not expose or request favorites', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, { guest: true, editable: false })
  await page.goto('/collections/personal')
  await expect(page.locator('.collection__path')).toContainText('Launch shortlist')
  await expect(page.getByRole('button', { name: /favorites: Launch shortlist/ })).toHaveCount(0)
  expect(api.count('favorite.listCollections')).toBe(0)
})

test('rename updates the card and sidebar and rejects empty names', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc)
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
  // The name is trimmed before it is sent.
  expect(api.inputs('collection.rename')).toEqual([{ id: 'personal', name: 'New shortlist' }])
})

test('synchronized collections offer edit and share but no rename', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc, { synchronized: true })
  await page.goto('/collections')
  await page.locator('main article').hover()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(3)
  await expect(page.getByRole('menuitem', { name: 'Rename collection', exact: true })).toHaveCount(0)
})

test('rename failures preserve the name and keep the dialog open', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, { failRename: true })
  await page.goto('/collections')
  await page.locator('main article').hover()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rename collection', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Collection name', { exact: true }).fill('New shortlist')
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('This collection cannot be edited.')
  expect(api.inputs('collection.rename')).toEqual([{ id: 'personal', name: 'New shortlist' }])
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('main').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
})

test('delete requires confirmation and refreshes the collection list and sidebar', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc)
  await page.goto('/collections')
  const trigger = page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true })
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Launch shortlist')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(api.count('collection.remove')).toBe(0)
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete collection', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('main article')).toHaveCount(0)
  await expect(page.locator('aside').getByRole('link', { name: 'Launch shortlist', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/collections$/)
  expect(api.inputs('collection.remove')).toEqual(['personal'])
})

test('delete failures preserve the collection and keep confirmation open', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc, { failDelete: true })
  await page.goto('/collections')
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Delete collection', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('This collection cannot be edited.')
  await expect(dialog.getByRole('button', { name: 'Delete collection', exact: true })).toBeEnabled()
  expect(api.inputs('collection.remove')).toEqual(['personal'])
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('main').getByRole('link', { name: 'Launch shortlist', exact: true })).toBeVisible()
})

for (const missingParent of [false, true]) {
  test(`children of synchronized collections hide delete (missing parent: ${missingParent})`, async ({ page, mockTrpc }) => {
    const api = await fixture(mockTrpc, { synchronizedParent: true, missingParent })
    await page.goto('/collections')
    await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit collection', exact: true })).toBeVisible()
    if (missingParent) await expect.poll(() => api.count('collection.findById')).toBeGreaterThan(0)
    await expect(page.getByRole('menuitem', { name: 'Delete collection', exact: true })).toHaveCount(0)
    expect(api.count('collection.remove')).toBe(0)
  })
}

test('deleting a favorited collection refreshes favorites without leaving the page', async ({ page, mockTrpc }) => {
  const api = await fixture(mockTrpc)
  await page.goto('/collections')
  await page.getByRole('button', { name: 'Add to favorites: Launch shortlist', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove from favorites: Launch shortlist', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Favorites', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Collections', exact: true })).toContainText('Launch shortlist')
  // A refetch landing while the menu is open would close it under the pointer.
  await api.settled()
  await page.getByRole('button', { name: 'Actions for Launch shortlist', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete collection', exact: true }).click()
  const assetQueries = api.count('favorite.list')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete collection', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Collections', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Assets', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/favorites$/)
  await expect.poll(() => api.count('favorite.list')).toBeGreaterThan(assetQueries)
})

test('dismissing a collection menu with an outside click hides its trigger, while Escape restores keyboard focus', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
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
  // Menu focus restoration runs after unmount, so wait for the settled state.
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
})
