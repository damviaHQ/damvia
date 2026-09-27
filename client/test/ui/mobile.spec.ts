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
import { type Page } from '@playwright/test'
import { defaults, files, user } from './lib/fixtures'
import { expect, test } from './lib/trpc'

// The phone interface: its own navigation and screens over the same API.
const ready = { id: 'd1', status: 'ready', fileCount: 3, recordCount: 0, downloadType: 'email', url: 'https://api.example.test/v1/downloads/d1', expiresAt: '2026-10-04T10:00:00Z', createdAt: '2026-09-27T10:00:00Z', updatedAt: '2026-09-27T10:05:00Z' }

const phone = (page: Page) => page.setViewportSize({ width: 390, height: 844 })
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

test('a collection opens with the phone navigation, a two-column grid and a preview Back closes', async ({ page }) => {
  await phone(page)
  await page.goto('/collections/campaign')
  await expect(page.getByRole('heading', { name: 'Autumn essentials', level: 1 })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'Main' })
  for (const name of ['Home', 'Library', 'Search', 'Saved', 'Account']) await expect(tabs.getByRole('link', { name })).toBeVisible()
  expect(await fits(page)).toBe(true)
  await page.getByRole('button', { name: /Campaign — Sand\.jpg/ }).click()
  const preview = page.getByRole('dialog', { name: 'Campaign — Sand.jpg' })
  await expect(preview).toBeVisible()
  await expect(page).toHaveURL(/preview=file-0/)
  await page.goBack()
  await expect(preview).toHaveCount(0)
})

test('a small download starts now; above 1 GB the only choice is a link by email', async ({ page, mockTrpc }) => {
  await phone(page)
  const small = files.slice(0, 2).map(file => ({ ...file, size: 400_000_000 }))
  const api = await mockTrpc({
    'collection.getFiles': { files: small, licenses: [], recordCount: 0, columns: [], previewRows: [], previewPictures: [], viewsEnabled: false, mainView: null, allowDirectDownload: true },
    'download.create': { ...ready, status: 'preparing', url: null },
  })
  await page.goto('/collections/campaign?preview=file-0')
  await page.getByRole('dialog').getByRole('button', { name: 'Download' }).click()
  const sheet = page.getByRole('dialog', { name: 'Download' })
  await expect(sheet.getByRole('button', { name: 'Download now' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Email me a link instead' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  expect(api.inputs('collection.getFiles')).toEqual([{ items: [{ type: 'file', id: 'file-0' }] }])
  expect(api.count('download.create')).toBe(0)

  const large = files.slice(0, 2).map(file => ({ ...file, size: 600_000_000 }))
  await mockTrpc({
    'collection.getFiles': { files: large, licenses: [], recordCount: 0, columns: [], previewRows: [], previewPictures: [], viewsEnabled: false, mainView: null, allowDirectDownload: false },
    'download.create': { ...ready, status: 'preparing', url: null },
  })
  await page.goto('/collections/campaign?preview=file-0')
  await page.getByRole('dialog').getByRole('button', { name: 'Download' }).click()
  const bigSheet = page.getByRole('dialog', { name: 'Download' })
  await expect(bigSheet.getByText('Over 1 GB. We’ll email you a link when it’s ready.')).toBeVisible()
  await expect(bigSheet.getByRole('button', { name: 'Download now' })).toHaveCount(0)
  await bigSheet.getByRole('button', { name: 'Email me a link' }).click()
  await expect.poll(() => api.count('download.create')).toBe(1)
  expect(api.last('download.create')).toMatchObject({ downloadType: 'email' })
})

test('a ready download is one tap from a copied link', async ({ page, context, mockTrpc }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await phone(page)
  await mockTrpc({ 'download.list': [ready] })
  await page.goto('/downloads')
  await expect(page.getByText('Anyone with a download link can download its files until it expires.')).toBeVisible()
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(ready.url)
})

test('the library walks the menu one level at a time', async ({ page }) => {
  await phone(page)
  await page.goto('/library')
  await page.getByRole('link', { name: 'Brand guidelines' }).click()
  await expect(page).toHaveURL(/\/collections\/collection-1/)
})

test('search opens full-screen filters that apply in one step', async ({ page, mockTrpc }) => {
  const results = files.slice(0, 3)
  await phone(page)
  await mockTrpc({ 'recordAttribute.listFacets': [], 'metadataField.listFacets': [], 'variantAxis.listFacets': [], 'collection.searchNotFound': [], 'collection.search': { results, total: 3, page: 1, totalPages: 1, nextPage: null, facets: { assetTypes: { photo: 3 }, fileTypes: {}, extensions: { jpg: 3 }, recordViews: {}, attributes: {}, metadata: {}, metadataRanges: {}, variantAxes: {} }, rangeResults: [], rangeTotal: 0 } })
  await page.goto('/search?q=Campaign')
  await expect(page.getByText('3 files')).toBeVisible()
  await page.getByRole('button', { name: /^Filters/ }).click()
  const filters = page.getByRole('dialog', { name: 'Filters' })
  await filters.getByRole('checkbox', { name: 'JPG' }).check()
  await expect(page).not.toHaveURL(/extensions=/)
  await filters.getByRole('button', { name: /^Apply/ }).click()
  await expect(filters).toHaveCount(0)
  await expect(page).toHaveURL(/extensions=jpg/)
  await expect(page).toHaveURL(/q=Campaign/)
  expect(await fits(page)).toBe(true)
})

test('guests have no Saved tab, members cannot open user management, editors ask for a computer', async ({ page, mockTrpc }) => {
  await phone(page)
  await mockTrpc({}, { role: 'guest' })
  await page.goto('/collections/campaign')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Saved' })).toHaveCount(0)
  await mockTrpc({}, { role: 'member' })
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Saved' })).toBeVisible()
  await page.goto('/admin/users')
  await expect(page).not.toHaveURL(/\/admin\/users/)
  await page.goto('/collections/campaign/edit')
  await expect(page.getByRole('heading', { name: 'Open this on a computer' })).toBeVisible()
})

test('a manager approves a waiting person from the phone', async ({ page, mockTrpc }) => {
  const waiting = { id: 'u2', name: 'Jamie Laurent', email: 'jamie@example.test', company: 'Retail', role: 'member', region: 'Europe', regionId: 'r1', groups: [], approved: false, emailVerified: true, suspendedAt: null, mfaEnabled: false, createdAt: '2026-09-26T08:00:00Z', lastLoginAt: null, maintenanceContact: false }
  await phone(page)
  const api = await mockTrpc({ 'user.me': { ...user, role: 'manager', regionId: 'r1' }, 'user.list': [waiting], 'group.list': [], 'user.approve': null })
  await page.goto('/admin/users')
  await expect(page.getByRole('tab', { name: /Needs approval/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('link', { name: /Jamie Laurent/ }).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect.poll(() => api.inputs('user.approve')).toEqual(['u2'])
})

test('a long file name and a wide video stay inside the screen in the preview and the download sheet', async ({ page, mockTrpc }) => {
  const name = '92352_02352_PAMPA_SS26_16x9_EN_ST_LOGO_FINAL_MASTER_VERSION_WITH_SUBTITLES.mp4'
  const video = { ...files[0], id: 'long-video', name, mimeType: 'video/mp4', size: 92_000_000 }
  await phone(page)
  await mockTrpc({
    'collection.findById': { ...(defaults['collection.findById'] as object), files: [video, ...files.slice(1)] },
    'collection.getFiles': { files: [video], licenses: [], recordCount: 0, columns: [], previewRows: [], previewPictures: [], viewsEnabled: false, mainView: null, allowDirectDownload: true },
  })
  await page.goto('/collections/campaign?preview=long-video')
  const preview = page.getByRole('dialog', { name })
  await expect(preview).toBeVisible()
  const widest = () => page.evaluate(() => Math.max(...[...document.querySelectorAll('[role="dialog"], [role="dialog"] *')].map(element => element.getBoundingClientRect().right)))
  expect(await widest()).toBeLessThanOrEqual(390)
  for (const action of ['Download', 'Save', 'Add', 'Copy link']) await expect(preview.getByRole('button', { name: action, exact: true })).toBeInViewport({ ratio: 1 })
  await preview.getByRole('button', { name: 'Download', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Download' })).toBeVisible()
  expect(await widest()).toBeLessThanOrEqual(390)
})
