import { expect, test } from '@playwright/test'
import { responses } from './client-fixtures'

test('desktop collection preserves selection, previews, search and account controls', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    await route.fulfill({ json: { result: { data: responses[name] ?? [] } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/collections/campaign')
  await expect(page.locator('.collection__path')).toContainText('Autumn essentials')
  const favorites = page.getByRole('link', { name: 'Favorites', exact: true })
  const collections = page.getByRole('button', { name: 'My collections', exact: true })
  const favoriteLabel = (await favorites.locator('span').last().boundingBox())!
  const collectionLabel = (await collections.locator('span').last().boundingBox())!
  expect(favoriteLabel.x).toBe(collectionLabel.x)
  await expect(favorites.locator('svg')).toHaveCSS('width', '16px')
  await expect(collections.locator('svg')).toHaveCSS('width', '16px')
  expect((await favorites.boundingBox())!.height).toBe((await collections.boundingBox())!.height)
  expect((await collections.boundingBox())!.y - (await favorites.boundingBox())!.y).toBe(40)
  await expect(page.getByRole('button', { name: 'Create collection', exact: true }).locator('svg')).toHaveCSS('width', '16px')

  await expect(page.getByRole('button', { name: /Preview / })).toHaveCount(8)
  await expect(page.getByRole('button', { name: /Preview / }).first()).toHaveCSS('padding', '8px')
  await expect(page.getByRole('button', { name: 'Display preferences', exact: true }).locator('svg')).toHaveCSS('width', '24px')
  await expect(page.locator('.collection__path ol')).toHaveCSS('gap', '8px')
  await expect(page.locator('.collection__path ol')).toHaveCSS('flex-wrap', 'nowrap')
  const firstAssetCheckbox = page.getByRole('checkbox', { name: 'Select Campaign — Sand.jpg', exact: true })
  await firstAssetCheckbox.focus()
  await page.keyboard.press('Space')
  await expect(firstAssetCheckbox).toBeChecked()
  const favoriteColor = await page.getByRole('button', { name: 'Add to favorites: Campaign — Sand.jpg', exact: true }).evaluate(element => getComputedStyle(element).color)
  await expect(firstAssetCheckbox).toHaveCSS('background-color', favoriteColor)
  await expect(firstAssetCheckbox.locator('svg')).toHaveCSS('stroke-width', '3px')
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'mixed')
  await expect(page.getByRole('checkbox').first().locator('[data-checkbox-indicator="mixed"]')).toBeVisible()
  await expect(page.getByRole('checkbox').first().locator('svg')).toHaveCSS('stroke-width', '3px')
  await page.screenshot({ path: '/tmp/damvia-checkbox-rendered-weight.png' })
  await page.getByRole('checkbox').first().focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox').first()).toBeChecked()
  await expect(page.locator('.dashboard-layout-topbar__selector').getByText('8 items selected', { exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Select all in', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Select all in', exact: true }).click()
  await expect(page.locator('.dashboard-layout-topbar__selector').getByText('8 items selected', { exact: true })).toBeVisible()
  const selectionToolbar = page.locator('.dashboard-layout-topbar__selector')
  await expect(selectionToolbar).toHaveCSS('font-size', '14px')
  await expect(selectionToolbar.locator('svg').first()).toHaveCSS('width', '24px')
  await page.addStyleTag({ content: '.dv-theme { --dv-size-body: 16px; }' })
  await expect(selectionToolbar).toHaveCSS('font-size', '16px')
  await expect(page.getByRole('link', { name: 'Favorites', exact: true })).toHaveCSS('font-size', '16px')
  await page.addStyleTag({ content: '.dv-theme { --dv-size-body: 14px; }' })
  await page.getByRole('checkbox').first().click()
  await expect(page.getByRole('button', { name: 'Select all in', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Search assets', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('animation-name', 'none')
  await expect(dialog).toHaveCSS('transition-duration', '0s')
  await expect(dialog).toHaveCSS('border-radius', '12px')
  const mode = dialog.getByRole('button', { name: 'Search mode', exact: true })
  await mode.click()
  await expect(mode).toHaveText('search an exact term in')
  await expect(mode).toHaveAttribute('aria-pressed', 'true')
  await mode.focus()
  await page.keyboard.press('Space')
  await expect(mode).toHaveText('search multiple references of')
  await expect(mode).toHaveAttribute('aria-pressed', 'false')
  await page.waitForTimeout(250)
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'Asset types', exact: true }).click()
  const photography = dialog.getByRole('checkbox', { name: 'Photography', exact: true })
  await expect(photography).toBeVisible()
  await expect(photography).toHaveCSS('width', '16px')
  await photography.focus()
  await page.keyboard.press('Space')
  await expect(photography).toBeChecked()
  await page.keyboard.press('Space')
  await expect(photography).not.toBeChecked()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: /Preview / }).first().click()
  await expect(page.getByRole('radio', { name: 'Original (HD)', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: 'PNG', exact: true }).click()
  await expect(page.getByText('Image quality', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Display preferences', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('radio', { name: 'List', exact: true }).nth(1).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('table')).toBeVisible()
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Manage your profile and account details.')
  expect(errors).toEqual([])
})

test('neutral authentication uses shared controls and keeps account links accessible', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    await route.fulfill({ json: { result: { data: responses[name] ?? { exists: false, imageUrl: null } } } })
  })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeDisabled()
  await page.getByLabel('Your email').fill('alex@example.test')
  await page.getByLabel('Password', { exact: true }).fill('preview-password')
  await page.getByRole('checkbox').check()
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toHaveCSS('background-color', 'rgb(38, 38, 38)')
  await page.getByRole('link', { name: 'Reset password', exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toHaveCSS('background-color', 'rgb(38, 38, 38)')
  expect(errors).toEqual([])
})

for (const tree of ['menu', 'collections'] as const) {
  test(`${tree} tree shows the current collection and continuous ancestor lines`, async ({ page }) => {
    const collection = { id: 'library', name: 'Library', public: true, children: [
      { id: 'earlier', name: 'A — Earlier collection', public: true, children: [{ id: 'other', name: 'Other assets', children: [] }] },
      { id: 'campaigns', name: 'Campaigns', public: true, children: [{ id: 'campaign', name: 'Autumn essentials', public: true, children: [] }] },
    ] }
    const menu = (item: any): any => ({ id: `menu-${item.id}`, type: 'collection', hasAccess: true, collectionId: item.id, collectionName: item.name, children: item.children.map(menu) })
    await page.route('**/trpc/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
      const data = name === 'collection.tree' ? (tree === 'collections' ? [collection] : [])
        : name === 'menuItem.list' ? (tree === 'menu' ? [menu(collection)] : [])
        : name === 'user.me' && tree === 'collections' ? { ...(responses['user.me'] as object), role: 'guest' }
        : responses[name] ?? []
      await route.fulfill({ json: { result: { data } } })
    })
    await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
    await page.goto('/collections/campaign')
    const sidebar = page.locator('aside')
    const active = sidebar.getByRole('link', { name: 'Autumn essentials', exact: true })
    await expect(active).toBeVisible()
    await expect(active).toHaveAttribute('aria-current', 'page')
    await expect(active).toHaveCSS('font-weight', tree === 'menu' ? '700' : '500')
    const background = await active.evaluate(element => getComputedStyle(element).backgroundColor)
    if (tree === 'menu') expect(background).not.toBe('rgba(0, 0, 0, 0)')
    else expect(background).toBe('rgba(0, 0, 0, 0)')
    await expect(sidebar.locator('[data-tree-connector]').first()).toHaveCSS('background-color', 'rgb(212, 212, 212)')
    await expect(sidebar.locator('[data-tree-connector]')).toHaveCount(7)
    await sidebar.getByRole('button', { name: 'Expand A — Earlier collection', exact: true }).click()
    const precedingLine = sidebar.locator('[data-tree-connector].h-full').first()
    expect((await precedingLine.boundingBox())!.height).toBe(72)
    await sidebar.getByRole('button', { name: 'Collapse Campaigns', exact: true }).click()
    await expect(active).toBeHidden()
    await sidebar.getByRole('button', { name: 'Expand Campaigns', exact: true }).click()
    await expect(active).toBeVisible()
  })
}

test('collection modals share field spacing and respond to one token change', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? { ...(responses[name] as object), canEdit: true, canEditLimitedToGroupIds: true, limitedToGroupIds: [], invitations: [], parent: { id: 'library', name: 'Brand library', synchronized: true } } : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'Collection settings', exact: true }).click()
  const dialog = page.getByRole('dialog')
  for (const name of ['Details', 'Visibility', 'Appearance']) await expect(dialog.getByRole('heading', { name, exact: true })).toBeVisible()
  const label = dialog.locator('label[for="collection-description"]')
  const input = dialog.getByLabel('Description', { exact: true })
  const gap = async () => { const a = (await label.boundingBox())!; const b = (await input.boundingBox())!; return b.y - a.y - a.height }
  await expect(input).toHaveCSS('height', '40px')
  await expect(label).toHaveCSS('font-size', '13px')
  expect(await gap()).toBe(8)
  await page.screenshot({ path: '/tmp/damvia-modal-standard.png' })
  await page.addStyleTag({ content: '.dv-theme { --dv-field-gap: 12px; --dv-control-height: 48px; --dv-field-label-size: 15px; }' })
  await expect(input).toHaveCSS('height', '48px')
  await expect(label).toHaveCSS('font-size', '15px')
  expect(await gap()).toBe(12)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Share collection', exact: true }).click()
  await expect(dialog.getByLabel('Guest email', { exact: true })).toHaveCSS('height', '48px')
  await expect(dialog.locator('label[for="email"]')).toHaveCSS('font-size', '15px')
  const expiryLabel = (await dialog.locator('label[for="expiresAt"]').boundingBox())!
  const expiryInput = (await dialog.getByLabel('Expiry date', { exact: true }).boundingBox())!
  expect(expiryInput.y - expiryLabel.y - expiryLabel.height).toBe(12)
  expect(errors).toEqual([])
})

test('search filters consume the shared field tokens', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.search' ? { results: [], page: 1, totalPages: 1 } : name === 'assetType.list' ? ['Events', 'Products', 'Photography with a very long category name'].map((label, i) => ({ ...(responses[name] as any[])[0], id: `type-${i}`, name: label })) : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/search')
  const label = page.locator('label[for="search-assetTypes"]')
  const control = label.locator('..').locator('.vue-treeselect__control')
  await expect(label).toHaveCSS('font-size', '13px')
  await expect(control).toHaveCSS('height', '40px')
  const a = (await label.boundingBox())!; const b = (await control.boundingBox())!
  expect(b.y - a.y - a.height).toBe(8)
  await control.click()
  const filterCheckbox = page.locator('.vue-treeselect__checkbox').first()
  await expect(filterCheckbox).toHaveCSS('width', '16px')
  await expect(filterCheckbox).toHaveCSS('border-radius', '0px')
  await filterCheckbox.click()
  await expect(filterCheckbox).toHaveCSS('background-color', 'rgb(82, 82, 82)')
  await page.locator('.vue-treeselect__checkbox').nth(1).click()
  await page.locator('.vue-treeselect__checkbox').nth(2).click()
  const multiSelect = control.locator('..')
  await expect(multiSelect.locator('.vue-treeselect__placeholder')).toBeHidden()
  await expect(multiSelect.locator('.vue-treeselect__multi-value-item')).toHaveCount(3)
  expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/damvia-search-multiselect.png' })
  await page.keyboard.press('Escape')
  await multiSelect.locator('.vue-treeselect__x-container').click()
  await expect(multiSelect.locator('.vue-treeselect__multi-value-item')).toHaveCount(0)
  await expect(multiSelect.locator('.vue-treeselect__placeholder')).toBeVisible()
  await page.addStyleTag({ content: '.dv-theme { --dv-field-gap: 12px; --dv-control-height: 48px; --dv-field-label-size: 15px; }' })
  await expect(label).toHaveCSS('font-size', '15px')
  await expect(control).toHaveCSS('height', '48px')
  const c = (await label.boundingBox())!; const d = (await control.boundingBox())!
  expect(d.y - c.y - c.height).toBe(12)
  expect(errors).toEqual([])
})

test('breadcrumb ellipsis stays compact, centered and transparent', async ({ page }) => {
  const parent = { id: 'marketing', name: 'Marketing Assets', parent: { id: 'brand', name: 'Brand', parent: { id: 'season', name: 'Season', parent: { id: 'root', name: 'MARKETING ASSETS', parent: null } } } }
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'collection.findById' ? { ...(responses[name] as object), name: 'EVT-25028 Festival Aurora 2025', parent } : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/collections/campaign')
  const currentLabel = page.locator('.collection__path .dv-breadcrumb__current .dv-breadcrumb__label')
  await expect(currentLabel).toHaveText('EVT-25028 Festival Aurora 2025')
  expect(await currentLabel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const trigger = page.getByRole('button', { name: 'Show 2 hidden path items', exact: true })
  await expect(trigger).toHaveCSS('width', '20px')
  await trigger.hover()
  await expect(trigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const button = (await trigger.boundingBox())!
  const icon = (await trigger.locator('svg').boundingBox())!
  expect(Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2)).toBeLessThan(0.5)
  expect(Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2)).toBeLessThan(0.5)
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Season', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Brand', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})
