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
import { recordsApi } from './lib/records'
import { expect, test } from './lib/trpc'

test('admin typography and icons follow shared tokens in pages and portals', async ({ page, mockTrpc, shot }) => {
  await mockTrpc({
    ...recordsApi,
    'settings.getEnrichment': { recordLabelSingular: 'Product', recordLabelPlural: 'Products', viewsEnabled: false, viewSeparator: '.', viewDigits: 2, thumbnailView: '00' },
    'settings.getReadiness': { requiredAttributeIds: [], requiredViews: [], readyLabel: 'Ready to use', incompleteLabel: 'To complete' },
  }, { role: 'admin' })
  await page.goto('/admin/groups')
  const menu = page.locator('.menu-item').first()
  await expect(menu).toHaveCSS('font-size', '14px')
  await expect(menu.locator('svg')).toHaveCSS('width', '16px')
  await expect(page.locator('.admin-topbar h1')).toHaveText('Groups')
  await expect(page.locator('.admin-topbar h1')).toHaveCSS('font-size', '20px')
  await page.locator('.admin-topbar-info').click()
  await expect(page.locator('.admin-topbar-about')).toHaveText('Control which collections people can access.')
  await page.keyboard.press('Escape')
  // A page's actions are teleported into the top bar, beside its title.
  const action = page.locator('.admin-topbar #admin-topbar-actions button').first()
  await expect(action).toHaveCSS('font-size', '14px')
  await action.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('label').first()).toHaveCSS('font-size', '14px')
  await page.addStyleTag({ content: '.dv-theme { --dv-size-body: 16px; --dv-icon-compact: 20px; }' })
  await expect(menu).toHaveCSS('font-size', '16px')
  await expect(menu.locator('svg')).toHaveCSS('width', '20px')
  await expect(dialog.locator('label').first()).toHaveCSS('font-size', '16px')
  await shot('admin-shared-sizing')
  await page.keyboard.press('Escape')
  await expect(action).toBeFocused()
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toHaveCSS('font-size', '20px')
  await expect(page.locator('.overview-summary')).toBeVisible()
  await expect(page.locator('.admin-dashboard .dv-button').first()).toHaveCSS('font-size', '14px')
  await shot('dashboard-sizing')
  await page.goto('/admin/data-enrichment/records/import')
  await expect(page.locator('.admin-topbar-parent')).toHaveText('Products')
  await expect(page.getByRole('heading', { name: 'Import products', level: 1 })).toBeVisible()
  await page.goto('/admin/settings')
  await expect(page.locator('.admin-topbar h1')).toHaveText('Settings')
  await expect(page.locator('.admin-topbar-parent')).toHaveCount(0)
})
