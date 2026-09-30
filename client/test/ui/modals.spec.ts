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
import { collection, user } from './lib/fixtures'
import { expect, test } from './lib/trpc'

test('client dialogs and nested content have readable headings and contained layouts', async ({ page, mockTrpc, shot }) => {
  let editor = false
  const license = { id: 'license', name: 'Campaign license', scopes: [], details: '<p>Approved campaign use only.</p><ul><li>Keep the original credits.</li></ul>' }
  const files = collection.files.map(file => ({ ...file, license }))
  await mockTrpc({
    'collection.findById': () => ({ ...collection, files, canEdit: true, limitedToGroupIds: [], invitations: [], page: editor ? { id: 'page', blocks: [] } : null }),
    'user.me': { ...user, role: 'admin', company: 'Studio' },
    'collection.getFiles': { files, licenses: [license], recordCount: 0, columns: [], previewRows: [], previewPictures: [], viewsEnabled: false },
    'collection.lastAddedFiles': files,
  })
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  const accountMenu = page.getByRole('menu')
  await expect(accountMenu).toHaveCSS('width', '240px')
  for (const item of await accountMenu.getByRole('menuitem').all()) {
    await expect(item).toHaveCSS('height', '36px')
    expect(await item.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await shot('account-menu')
  await page.keyboard.press('Escape')
  const capture = async (name: string) => {
    await shot(`review-${name}`)
    for (const dialog of await page.getByRole('dialog').all()) {
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
  }
  for (const [button, screenshot] of [['Collection settings', 'edit'], ['Share collection', 'share'], ['Create collection', 'create']]) {
    if (button !== 'Create collection') {
      await page.getByRole('button', { name: 'Collection actions', exact: true }).click()
      await page.getByRole('menuitem', { name: button, exact: true }).click()
    } else await page.getByRole('button', { name: button, exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await capture(screenshot)
    await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: /Preview / }).first().click()
  await capture('preview')
  await page.getByRole('button', { name: 'Campaign license', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Campaign license' })).toBeVisible()
  await capture('license')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Close preview' }).click()
  await page.getByRole('button', { name: 'Select All in', exact: true }).click()
  await page.getByTitle('Add selection to your collection', { exact: true }).click()
  await capture('add-selection')
  await page.getByRole('tab', { name: 'Public Collections', exact: true }).click()
  await page.getByRole('button', { name: 'Create new', exact: true }).click()
  await capture('create-public')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByTitle('Download selection', { exact: true }).click()
  await expect(page.getByText('Selected files', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Campaign license', exact: true })).toBeVisible()
  await capture('download-selection')
  await page.getByRole('button', { name: 'Campaign license', exact: true }).click()
  await capture('selection-license')
  await page.keyboard.press('Escape')
  editor = true
  await page.reload()
  // The editor is reached from the collection itself, and its library is the
  // screen's left sidebar rather than a dialog.
  await page.getByRole('button', { name: 'Collection actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit page', exact: true }).click()
  await capture('editor')
  for (const block of ['Collections', 'Files', 'Latest files', 'Text', 'Picture', 'Video']) {
    await page.getByRole('button', { name: new RegExp(`^${block} `) }).click()
    await capture(`editor-${block.toLowerCase().replace(' ', '-')}`)
  }
})
