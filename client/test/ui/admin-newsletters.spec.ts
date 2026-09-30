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
import { expect, test } from './lib/trpc'

const nobody = { everyone: false, roles: [], groupIds: [], regionIds: [], includeUserIds: [], excludeUserIds: [] }
const counts = { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0, bounced: 0, complained: 0 }
const draft = {
  id: 'n1', name: 'September update', subject: 'News for {{ user.firstName }}', preheader: '', heading: 'What is new', bodyHtml: '<p>Hello</p>',
  audienceId: null, filter: nobody, status: 'draft', scheduledAt: null, startedAt: null, sentAt: null, updatedAt: '2026-09-20T10:00:00.000Z',
  counts, variables: [{ name: 'user.firstName', description: "The reader's first name" }],
  pace: { perSecond: 5, limit: 2000, sent: 0, remaining: 2000, nextAt: null },
}
const directory = {
  'group.list': [{ id: 'g1', name: 'Retail', isDefault: false }],
  'region.list': [{ id: 'r1', name: 'Europe', defaultGroupId: 'g1', licenseCount: 0, userCount: 3 }],
  'newsletter.people': [{ id: 'u1', name: 'Ada', email: 'ada@example.test', role: 'guest', reachable: true }],
  'newsletter.audiences': [],
}
const previewHtml = (input: { subject: string, heading: string }) => ({ subject: input.subject.replace('{{ user.firstName }}', 'Grace'), html: `<html><body><h1>${input.heading}</h1></body></html>` })
const sizeOf = (filter: typeof nobody) => filter.everyone ? { count: 42, sample: [] } : filter.roles.length ? { count: 3, sample: [{ id: 'u1', name: 'Ada', email: 'ada@example.test' }] } : { count: 0, sample: [] }

test('the newsletters page starts empty and a new newsletter opens in the editor', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({ 'newsletter.list': [], ...directory, 'newsletter.create': { id: 'n1' }, 'newsletter.get': draft, 'newsletter.preview': previewHtml, 'newsletter.audienceSize': sizeOf }, { role: 'admin' })
  await page.goto('/admin/newsletters')
  await expect(page.getByRole('heading', { name: 'No newsletters yet' })).toBeVisible()
  await page.getByRole('button', { name: 'New newsletter' }).click()
  await expect(page).toHaveURL(/\/admin\/newsletters\/n1$/)
  expect(api.count('newsletter.create')).toBe(1)
  await expect(page.frameLocator('iframe[title="Newsletter preview"]').locator('h1')).toHaveText('What is new')
})

test('a newsletter is written, sent to a chosen audience and confirmed with the count', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc({
    ...directory,
    'newsletter.list': [],
    'newsletter.get': { ...draft, pace: { ...draft.pace, limit: 2, remaining: 1 } },
    'newsletter.preview': previewHtml,
    'newsletter.audienceSize': sizeOf,
    'newsletter.update': (input: { id: string, bodyHtml: string }) => ({ id: input.id, bodyHtml: input.bodyHtml }),
    'newsletter.sendTest': { sentTo: 'admin@example.test' },
    'newsletter.schedule': { scheduledAt: new Date().toISOString(), recipients: 3 },
  }, { role: 'admin' })
  await page.goto('/admin/newsletters/n1')
  const preview = page.frameLocator('iframe[title="Newsletter preview"]')
  await expect(preview.locator('h1')).toHaveText('What is new')
  await page.getByLabel(/^Heading/).fill('Autumn catalogue')
  await expect(preview.locator('h1')).toHaveText('Autumn catalogue')
  await expect(page.getByRole('region', { name: 'Preview' }).getByText('News for Grace')).toBeVisible()
  await shot('newsletter-compose')

  await page.getByRole('button', { name: 'Send me a test' }).click()
  await expect(page.getByText('Test sent to admin@example.test')).toBeVisible()

  await page.getByRole('button', { name: /Audience/ }).first().click()
  await page.getByText('Choose who', { exact: true }).click()
  await page.getByRole('button', { name: 'Guests' }).click()
  await expect(page.getByRole('status').filter({ hasText: '3 recipients' })).toContainText('Guests: Ada')
  expect(api.last('newsletter.audienceSize')).toMatchObject({ everyone: false, roles: ['guest'] })
  await shot('newsletter-audience')

  await page.getByRole('button', { name: /Review and send/ }).click()
  await expect(page.getByRole('note')).toContainText('1 can go now; the rest follow over the next 1 day(s)')
  await shot('newsletter-review')
  await page.getByRole('button', { name: 'Send now' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('Send to 3 people?')
  await confirm.getByRole('button', { name: 'Send now' }).click()
  await expect(page.getByText('Sending to 3 people')).toBeVisible()
  expect(api.last('newsletter.update')).toMatchObject({ id: 'n1', heading: 'Autumn catalogue', filter: { roles: ['guest'] } })
  expect(api.last('newsletter.schedule')).toEqual({ id: 'n1', at: null })
})

test('images and buttons already in a newsletter survive editing and saving', async ({ page, mockTrpc }) => {
  const image = 'http://localhost:3000/v1/newsletter-images/11111111-1111-1111-1111-111111111111.png'
  const api = await mockTrpc({
    ...directory,
    'newsletter.list': [],
    'newsletter.get': { ...draft, bodyHtml: `<p>Hello</p><img src="${image}" alt="Team" width="480"><a data-button="" href="https://example.test/go">Open it</a><p>Bye</p>` },
    'newsletter.preview': previewHtml,
    'newsletter.audienceSize': sizeOf,
    'newsletter.update': (input: { id: string, bodyHtml: string }) => ({ id: input.id, bodyHtml: input.bodyHtml }),
  }, { role: 'admin' })
  await page.goto('/admin/newsletters/n1')
  await expect(page.locator('.newsletter-body a[data-button]')).toHaveText('Open it')
  await page.locator('.newsletter-body p').last().click()
  await page.keyboard.type(' now')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Newsletter saved')).toBeVisible()
  const saved = api.last('newsletter.update').bodyHtml
  expect(saved).toContain(`<img src="${image}" alt="Team" width="480">`)
  expect(saved).toContain('<a data-button="" href="https://example.test/go">Open it</a>')
  expect(saved).toContain('<p>Bye now</p>')
})

test('a sent newsletter shows what happened to each person and retries failures', async ({ page, mockTrpc, shot }) => {
  const sent = { ...draft, status: 'sent', sentAt: '2026-09-21T09:00:00.000Z', filter: { ...nobody, everyone: true }, counts: { total: 4, pending: 0, sent: 1, failed: 1, skipped: 1, bounced: 1, complained: 0 } }
  const api = await mockTrpc({
    ...directory,
    'newsletter.get': sent,
    'newsletter.preview': previewHtml,
    'newsletter.audienceSize': sizeOf,
    'newsletter.list': [],
    'newsletter.recipients': (input: { status?: string }) => {
      const all = [
        { id: 'r1', name: 'Ada', email: 'ada@example.test', status: 'sent', error: null, sentAt: sent.sentAt },
        { id: 'r2', name: 'Bea', email: 'bea@example.test', status: 'failed', error: '550 mailbox unavailable', sentAt: null },
        { id: 'r3', name: 'Cy', email: 'cy@example.test', status: 'skipped', error: null, sentAt: null },
        { id: 'r4', name: 'Di', email: 'di@example.test', status: 'bounced', error: null, sentAt: sent.sentAt },
      ].filter(item => !input.status || item.status === input.status)
      return { items: all, total: all.length }
    },
    'newsletter.resume': { retried: 1 },
  }, { role: 'admin' })
  await page.goto('/admin/newsletters/n1')
  await expect(page.getByRole('heading', { name: 'Delivery' })).toBeVisible()
  await expect(page.getByText('550 mailbox unavailable')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Bounced' })).toBeVisible()
  await shot('newsletter-sent')
  await page.getByRole('group', { name: 'Show recipients' }).getByRole('button', { name: 'Failed' }).click()
  await expect(page.getByRole('cell', { name: 'Ada' })).toHaveCount(0)
  expect(api.last('newsletter.recipients')).toMatchObject({ id: 'n1', status: 'failed' })
  await expect(page.getByLabel('Subject')).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry 1 failed' }).click()
  await expect(page.getByText('Trying 1 again')).toBeVisible()
  expect(api.inputs('newsletter.resume')).toEqual(['n1'])
})

test('saved audiences are listed with who they reach and edited in a dialog', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc({
    ...directory,
    'newsletter.list': [],
    'newsletter.audiences': [{ id: 'a1', name: 'European guests', filter: { ...nobody, roles: ['guest'], regionIds: ['r1'] }, updatedAt: '2026-09-20T10:00:00.000Z', count: 3 }],
    'newsletter.audienceSize': sizeOf,
    'newsletter.saveAudience': (input: { name: string }) => ({ id: 'a1', name: input.name }),
  }, { role: 'admin' })
  await page.goto('/admin/newsletters?tab=audiences')
  const row = page.getByRole('button', { name: /^European guests/ })
  await expect(row).toContainText('Guests in the region Europe')
  await expect(row).toContainText('3 people now')
  await row.click()
  const dialog = page.getByRole('dialog')
  await shot('audience-dialog')
  await dialog.getByLabel('Name').fill('Guests in Europe')
  await dialog.getByRole('button', { name: 'Save audience' }).click()
  await expect(page.getByText('Audience saved')).toBeVisible()
  expect(api.last('newsletter.saveAudience')).toMatchObject({ id: 'a1', name: 'Guests in Europe', filter: { roles: ['guest'], regionIds: ['r1'] } })
})

test('the unsubscribe link asks before it acts, and only the account subscribes again', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'newsletter.subscription': { email: 'a••••@example.test', subscribed: true },
    'newsletter.unsubscribe': { email: 'a••••@example.test', subscribed: false },
  })
  await page.goto('/unsubscribe?token=signed-token-value')
  await expect(page.getByRole('heading', { name: 'Unsubscribe from newsletters?' })).toBeVisible()
  expect(api.count('newsletter.unsubscribe')).toBe(0)
  await page.getByRole('button', { name: 'Unsubscribe' }).click()
  await expect(page.getByRole('heading', { name: 'You are unsubscribed' })).toBeVisible()
  expect(api.last('newsletter.unsubscribe')).toEqual({ token: 'signed-token-value' })
  await expect(page.getByRole('button', { name: /Subscribe/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open my profile' })).toHaveAttribute('href', '/account')
})
