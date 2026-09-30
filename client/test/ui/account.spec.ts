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
import { assetType, user } from './lib/fixtures'
import { expect, test, type MockTrpc } from './lib/trpc'

const days = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()
const download = (id: string, status: string, created: number, extra = {}) => ({
  id, status, downloadType: 'direct', fileCount: 33, recordCount: 0, url: status === 'ready' ? `https://example.test/${id}` : null,
  createdAt: days(created), updatedAt: days(created), expiresAt: days(created + 7), ...extra,
})
const downloads = [
  download('ready-1', 'ready', 0, { recordCount: 33 }),
  download('preparing-1', 'preparing', 0),
  download('failed-1', 'failed', -1),
  download('expired-1', 'expired', -9, { fileCount: 1 }),
  download('expired-2', 'expired', -11, { fileCount: 6 }),
]
const invitations = [
  { id: 'invite-1', createdAt: days(-1), expiresAt: days(20), email: 'alexandra.morgan@example.test', collection: { id: 'campaign', name: 'Autumn essentials campaign', public: true } },
  { id: 'invite-2', createdAt: days(-40), expiresAt: days(-10), email: 'sam.lee@example.test', collection: { id: 'archive', name: 'Spring archive', public: true } },
]

async function mockAccount(mockTrpc: MockTrpc) {
  return mockTrpc({
    'user.me': { ...user, company: 'Studio' },
    'assetType.list': ['Events', 'Products', 'Photography'].map((label, i) => ({ ...assetType, id: `type-${i}`, name: label })),
    'download.list': downloads,
    'download.contents': {
      total: 35, unavailable: 1, recordList: { name: 'record-list.xlsx', rows: 33 },
      entries: [
        { id: 'entry-1', name: 'look-01.jpg', folder: 'SS25/Newsletter', size: 2_400_000, mimeType: 'image/jpeg', thumbnailURL: null },
        { id: 'entry-2', name: 'teaser.mp4', folder: 'SS25/Newsletter', size: 48_000_000, mimeType: 'video/mp4', thumbnailURL: null },
      ],
    },
    'collection.invitation.getUserInvitations': invitations,
    'collection.invitation.remove': null,
    'auth.sessions': [],
  })
}

test('the account opens as a page with its own sidebar and returns to the library', async ({ page, mockTrpc, shot }) => {
  await mockAccount(mockTrpc)
  await page.goto('/collections/campaign')
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Display preferences', exact: true }).click()
  await expect(page).toHaveURL(/\/account\/display$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Display preferences' })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Account' })
  await expect(nav).toContainText('Alex Morgan')
  await expect(nav).toContainText('alex@example.test')
  await expect(nav.getByRole('link', { name: 'Display preferences' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: /Downloads/ })).toContainText('1')

  const rows = page.locator('[data-display-row]')
  await expect(rows).toHaveCount(6)
  const rights = await rows.evaluateAll(elements => elements.map(element => Math.round(element.querySelector('[role="radiogroup"]')!.getBoundingClientRect().right)))
  expect(new Set(rights).size).toBe(1)
  expect(await page.locator('#client-navigation').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await shot('account-display')

  for (const section of ['Profile', 'Security', 'Links']) {
    await nav.getByRole('link', { name: section, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: section })).toBeVisible()
    await expect(nav.getByRole('link', { name: section, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[data-account-content]')).not.toContainText('Loading')
    await shot(`account-${section.toLowerCase()}`)
  }

  await nav.getByRole('link', { name: 'Back to library' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign$/)
  await expect(page.getByRole('navigation', { name: 'Account' })).toHaveCount(0)
})

test('downloads separate what is available from what expired', async ({ page, mockTrpc, shot }) => {
  const api = await mockAccount(mockTrpc)
  await page.goto('/account/downloads')
  await expect(page.getByRole('heading', { level: 1, name: 'Downloads' })).toBeVisible()
  const available = page.getByRole('region', { name: /Available/ })
  await expect(available.locator('[data-download-row]')).toHaveCount(3)
  const ready = available.locator('[data-status="ready"]')
  await expect(ready).toContainText('33 files · 33')
  await expect(ready.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'https://example.test/ready-1')
  await expect(ready.getByRole('button', { name: 'Copy download link' })).toBeVisible()
  await expect(available.locator('[data-status="preparing"]')).toContainText('Preparing')
  await expect(available.locator('[data-status="failed"]')).toContainText('Failed')
  await expect(available.locator('[data-status="preparing"], [data-status="failed"]').getByRole('link')).toHaveCount(0)

  await ready.getByRole('button', { name: /33 files/ }).click()
  await expect(ready.getByRole('button', { name: /33 files/ })).toHaveAttribute('aria-expanded', 'true')
  const contents = ready.locator('[data-download-contents]')
  await expect(contents).toContainText('record-list.xlsx')
  await expect(contents).toContainText('look-01.jpg')
  await expect(contents).toContainText('SS25/Newsletter')
  await expect(contents).toContainText('and 32 more files')
  await expect(contents).toContainText('1 file is no longer available to you.')
  await expect.poll(() => api.last('download.contents')).toEqual({ id: 'ready-1' })

  const expired = page.locator('[data-expired-downloads]')
  await expect(expired.locator('[data-download-row]').first()).toBeHidden()
  await expired.locator('summary').click()
  await expect(expired.locator('[data-download-row]')).toHaveCount(2)
  await expect(expired.getByRole('link')).toHaveCount(0)
  await expect(expired.getByRole('button', { name: 'Copy download link' })).toHaveCount(0)
  await expect(expired.getByRole('button')).toHaveCount(0)
  await shot('account-downloads')
})

test('removing a guest asks for confirmation first', async ({ page, mockTrpc }) => {
  const api = await mockAccount(mockTrpc)
  await page.goto('/account/links')
  const rows = page.locator('[data-link-row]:visible')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Autumn essentials campaign')
  await expect(rows.first()).toContainText('alexandra.morgan@example.test')
  expect(await page.locator('[data-account-content]').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await rows.first().getByRole('button', { name: 'Remove access' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('alexandra.morgan@example.test')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  expect(api.count('collection.invitation.remove')).toBe(0)
  await rows.first().getByRole('button', { name: 'Remove access' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove access' }).click()
  await expect.poll(() => api.count('collection.invitation.remove')).toBe(1)
})

test('profile keeps account deletion behind a confirmation', async ({ page, mockTrpc, shot }) => {
  await mockAccount(mockTrpc)
  await page.goto('/account/profile')
  await expect(page.getByLabel('Name')).toHaveValue('Alex Morgan')
  await page.getByRole('button', { name: 'Delete account', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await shot('review-delete-account')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('the phone downloads address opens the account page on a computer', async ({ page, mockTrpc }) => {
  await mockAccount(mockTrpc)
  await page.goto('/downloads')
  await expect(page).toHaveURL(/\/account\/downloads$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Downloads' })).toBeVisible()
})

test('display preferences show the library default and what the reader changed', async ({ page, mockTrpc, shot }) => {
  await mockAccount(mockTrpc)
  await page.goto('/account/display')
  const events = page.locator('[data-display-row]').filter({ hasText: 'Events' })
  await expect(events).toContainText('Library default')
  await events.getByRole('radio', { name: 'Masonry' }).click()
  await expect(events).toContainText('Your choice · library default is grid')
  await events.getByRole('radio', { name: 'Small' }).click()
  await expect(events.getByRole('radio', { name: 'Small' })).toHaveAttribute('aria-checked', 'true')
  await expect(events.getByRole('img', { name: /own proportions/ })).toBeVisible()
  const photography = page.locator('[data-display-row]').filter({ hasText: 'Photography' })
  await photography.getByRole('radio', { name: 'List' }).click()
  await expect(photography.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true')
  await expect(photography.getByRole('img', { name: /columns of details/ })).toBeVisible()
  await page.mouse.move(0, 0)
  await shot('account-display-choices')
  const collections = page.locator('[data-display-row]').filter({ hasText: 'Collections' })
  await expect(collections.getByRole('radio')).toHaveCount(2)
  await events.getByRole('button', { name: 'Use default for Events' }).click()
  await expect(events).toContainText('Library default')
  await expect(events.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true')
  const variants = page.locator('[data-variants-row]')
  await expect(variants.getByRole('img', { name: /stacked on a single card/ })).toBeVisible()
  await variants.scrollIntoViewIfNeeded()
  await shot('account-display-variants-on')
  await page.getByRole('switch', { name: 'Group variants' }).click()
  await expect(page.getByRole('switch', { name: 'Group variants' })).toHaveAttribute('aria-checked', 'false')
  await expect(variants.getByRole('img', { name: /three separate files/ })).toBeVisible()
  await page.mouse.move(0, 0)
  await shot('account-display-variants')
  await page.getByRole('button', { name: 'Use library defaults everywhere' }).click()
  await expect(page.getByRole('switch', { name: 'Group variants' })).toHaveAttribute('aria-checked', 'true')
})
