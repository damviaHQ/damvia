import { expect, test } from '@playwright/test'
import { responses } from './client-fixtures'

test('account panels keep aligned controls, visible headings and contained navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'assetType.list' ? ['Events', 'Products', 'Photography'].map((label, i) => ({ ...(responses[name] as any[])[0], id: `type-${i}`, name: label }))
      : name === 'download.list' ? [{ id: 'download-1', createdAt: '2026-09-19', expiresAt: '2026-09-26', status: 'completed', fileCount: 12, url: 'https://example.test/download' }]
      : name === 'collection.invitation.getUserInvitations' ? [{ id: 'invite-1', createdAt: '2026-09-19', expiresAt: '2099-09-26', email: 'alexandra.morgan@example.test', collection: { id: 'campaign', name: 'Autumn essentials campaign', public: true } }]
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Display preferences', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Display preferences', exact: true })).toBeVisible()
  await expect(dialog.locator('[data-display-row]')).toHaveCount(5)
  const rows = await dialog.locator('[data-display-row]').evaluateAll(elements => elements.map(element => {
    const controls = element.querySelector('[role="radiogroup"]')!.getBoundingClientRect()
    return { x: controls.x, width: controls.width }
  }))
  expect(new Set(rows.map(row => row.x)).size).toBe(1)
  expect(await dialog.locator('aside').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/damvia-account-display.png' })
  for (const panel of ['Profile', 'Downloads', 'Links']) {
    await dialog.getByRole('tab', { name: panel, exact: true }).click()
    await expect(dialog.getByRole('heading', { name: panel, exact: true })).toBeVisible()
    const active = dialog.getByRole('tab', { name: panel, exact: true })
    await expect(active).toHaveAttribute('aria-selected', 'true')
    const hovered = await active.evaluate(element => getComputedStyle(element).backgroundColor)
    await page.mouse.move(0, 0)
    await expect(active).toHaveCSS('background-color', hovered)
    expect(hovered).not.toBe('rgba(0, 0, 0, 0)')
    if (panel === 'Links') expect(await dialog.locator('table').evaluate(element => element.scrollWidth <= element.parentElement!.clientWidth)).toBe(true)
    await expect(dialog.locator('[data-account-content]')).not.toContainText('Loading')
    await page.screenshot({ path: `/tmp/damvia-account-${panel.toLowerCase()}.png` })
    if (panel === 'Profile') {
      await dialog.getByRole('button', { name: 'Delete account', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page.screenshot({ path: '/tmp/damvia-review-delete-account.png' })
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    }
  }
  expect(errors).toEqual([])
})

test('client dialogs and nested content have readable headings and contained layouts', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let editor = false
  const collection = responses['collection.findById'] as any
  const license = { id: 'license', name: 'Campaign license', scopes: [], details: '<p>Approved campaign use only.</p><ul><li>Keep the original credits.</li></ul>' }
  const files = collection.files.map((file: any) => ({ ...file, license }))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? { ...collection, files, canEdit: true, limitedToGroupIds: [], invitations: [], page: editor ? { id: 'page', blocks: [] } : null }
      : name === 'user.me' ? { ...(responses[name] as object), role: 'admin', company: 'Studio' }
      : name === 'collection.getFiles' ? { files, licenses: [license], recordCount: 0, columns: [], previewRows: [], previewPictures: [], viewsEnabled: false }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  const accountMenu = page.getByRole('menu')
  await expect(accountMenu).toHaveCSS('width', '240px')
  for (const item of await accountMenu.getByRole('menuitem').all()) {
    await expect(item).toHaveCSS('height', '36px')
    expect(await item.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.screenshot({ path: '/tmp/damvia-account-menu.png' })
  await page.keyboard.press('Escape')
  const capture = async (name: string) => {
    await page.screenshot({ path: `/tmp/damvia-review-${name}.png` })
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
  expect(errors).toEqual([])
})
