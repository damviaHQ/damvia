import { expect, test } from '@playwright/test'
import { responses } from './client-fixtures'

test('admin typography and icons follow shared tokens in pages and portals', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    const data = name === 'user.me' ? { ...(responses[name] as object), role: 'admin' }
      : name === 'dashboard.summary' ? {
        assets: { byStatus: { up_to_date: 120 } }, users: { total: 8, pendingApproval: 0, maintenanceContacts: 1 },
        downloads: { last7DaysByStatus: { completed: 12 } }, collections: { total: 6 },
        jobs: { downloading: 0, measuring: 0 }, storage: { usedBytes: 1024, quotaBytes: 10240, percent: 10, serverContactEmails: [], disk: null },
        recentUsers: [], recentInvitations: [], recentFiles: [], recentDownloads: [],
      }
      : responses[name] ?? []
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.goto('/admin/groups')
  const menu = page.locator('.menu-item').first()
  await expect(menu).toHaveCSS('font-size', '14px')
  await expect(menu.locator('svg')).toHaveCSS('width', '16px')
  await expect(page.locator('.admin-heading h1')).toHaveCSS('font-size', '32px')
  const action = page.locator('.admin-heading button').first()
  await expect(action).toHaveCSS('font-size', '14px')
  await action.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('label').first()).toHaveCSS('font-size', '14px')
  await page.addStyleTag({ content: '.dv-theme { --dv-size-body: 16px; --dv-icon-compact: 20px; }' })
  await expect(menu).toHaveCSS('font-size', '16px')
  await expect(menu.locator('svg')).toHaveCSS('width', '20px')
  await expect(dialog.locator('label').first()).toHaveCSS('font-size', '16px')
  await page.screenshot({ path: '/tmp/damvia-admin-shared-sizing.png' })
  await page.keyboard.press('Escape')
  await expect(action).toBeFocused()
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toHaveCSS('font-size', '32px')
  await expect(page.locator('.overview-summary')).toBeVisible()
  await expect(page.locator('.admin-dashboard .dv-button').first()).toHaveCSS('font-size', '14px')
  await page.screenshot({ path: '/tmp/damvia-dashboard-sizing.png' })
  expect(errors).toEqual([])
})
