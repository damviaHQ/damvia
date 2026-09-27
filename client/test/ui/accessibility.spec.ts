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
import AxeBuilder from '@axe-core/playwright'
import { type Page } from '@playwright/test'
import { emptySearch, files, user } from './lib/fixtures'
import { expect, test, unauthorized, type Answers, type MockOptions } from './lib/trpc'

// WCAG 2.1 A and AA rules checked by axe-core on the main screens. Automated
// checks find about a third of real problems; keyboard, zoom and screen reader
// passes are still needed before claiming conformance.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const people = [
  { id: 'u1', name: 'Alex Morgan', email: 'alex@example.test', company: 'Studio', region: 'Europe', regionId: 'r1', role: 'member', emailVerified: true, approved: true, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', lastLoginAt: '2026-09-26T10:00:00Z', suspendedAt: null, mfaEnabled: false, groups: [] },
  { id: 'u2', name: 'Sam Lee', email: 'sam@example.test', company: 'Studio', region: 'Europe', regionId: 'r1', role: 'guest', emailVerified: false, approved: false, createdAt: '2026-09-02T10:00:00Z', updatedAt: '2026-09-02T10:00:00Z', lastLoginAt: null, suspendedAt: '2026-09-20T10:00:00Z', mfaEnabled: true, groups: [] },
]
const auditPage = {
  total: 2,
  items: [
    { id: 'a1', createdAt: '2026-09-27T09:00:00Z', actorId: 'admin', actorLabel: 'admin@example.test', action: 'user.updated', targetType: 'user', targetId: 'u1', targetLabel: 'alex@example.test', before: { role: 'guest' }, after: { role: 'member' }, ip: '203.0.113.5', userAgent: 'Mozilla/5.0' },
    { id: 'a2', createdAt: '2026-09-27T08:00:00Z', actorId: null, actorLabel: null, action: 'auth.sign_in_failed', targetType: 'email', targetId: 'x@example.test', targetLabel: null, before: null, after: null, ip: '198.51.100.7', userAgent: null },
  ],
}
const sessions = [
  { id: 's1', method: 'password', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0', createdAt: '2026-09-27T08:00:00Z', lastSeenAt: '2026-09-27T09:00:00Z', current: true },
  { id: 's2', method: 'sso', userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1', createdAt: '2026-09-26T08:00:00Z', lastSeenAt: '2026-09-26T09:00:00Z', current: false },
]

type Screen = {
  url: string
  // What shows once the screen has its data, so axe runs on the real page.
  ready: (page: Page) => ReturnType<Page['locator']>
  role?: MockOptions['role']
  signedOut?: boolean
  phone?: boolean
  // A step after the page is ready, such as opening a panel.
  open?: (page: Page) => Promise<void>
  answers?: Answers
}

const results = { 'collection.search': { ...emptySearch, results: files.slice(0, 3), total: 3, totalPages: 1, facets: { ...emptySearch.facets, assetTypes: { photo: 3 }, fileTypes: { image: 3 }, extensions: { jpg: 3 } } } }
const heading = (page: Page) => page.getByRole('heading', { level: 1 }).first()
const screens: Record<string, Screen> = {
  'sign-in': { url: '/login', signedOut: true, ready: page => page.getByRole('button', { name: 'Log in', exact: true }) },
  'privacy policy': { url: '/privacy-policy', signedOut: true, ready: page => page.getByRole('heading', { name: 'Privacy and cookie policy' }) },
  'collection': { url: '/collections/campaign', ready: page => page.getByRole('button', { name: /^Preview / }).first() },
  'search': { url: '/search?q=Campaign', answers: results, ready: page => page.getByText('3 results', { exact: true }) },
  'admin users': { url: '/admin/users', role: 'admin', answers: { 'user.list': people, 'group.list': [], 'region.list': [{ id: 'r1', name: 'Europe' }] }, ready: page => page.getByText('sam@example.test') },
  'admin audit log': { url: '/admin/audit-log', role: 'admin', answers: { 'audit.list': auditPage, 'audit.actions': ['auth.sign_in_failed', 'user.updated'] }, ready: page => page.getByText('198.51.100.7') },
  'phone collection': { url: '/collections/campaign', phone: true, ready: heading },
  'phone search': { url: '/search?q=Campaign', phone: true, answers: results, ready: page => page.getByText('3 files', { exact: true }) },
  'phone search filters': { url: '/search?q=Campaign&panel=filters', phone: true, answers: results, ready: page => page.getByRole('dialog', { name: 'Filters' }) },
  'phone downloads': { url: '/downloads', phone: true, ready: heading },
  'phone menu': { url: '/collections/campaign', phone: true, ready: heading,
    open: async page => { await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Menu' }).click(); await expect(page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Brand guidelines' })).toBeVisible() } },
  'phone sign-in': { url: '/login', phone: true, signedOut: true, answers: { 'settings.getAuthBackgroundImage': { imageUrl: 'https://example.test/cover.jpg', exists: true } }, ready: page => page.getByRole('button', { name: 'Log in', exact: true }) },
  'phone users as manager': { url: '/admin/users', phone: true, role: 'manager', answers: { 'user.list': people, 'group.list': [] }, ready: page => page.getByRole('link', { name: /Alex Morgan/ }) },
}

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  const summary = violations.map(violation => `${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 3).map(node => `${node.target.join(' ')} ${process.env.AXE_DETAIL ? node.html.slice(0, 300) + ' → ' + node.failureSummary : ''}`).join(' | ')}`)
  expect(summary).toEqual([])
}

for (const [name, screen] of Object.entries(screens)) {
  test(`${name} has no WCAG 2.1 AA violations found by axe`, async ({ page, mockTrpc }) => {
    if (screen.phone) await page.setViewportSize({ width: 390, height: 844 })
    const api = await mockTrpc({
      'user.me': screen.signedOut ? unauthorized() : { ...user, role: screen.role ?? 'member', regionId: 'r1', mfaEnabled: false, mfaSetupRequired: false, hasPassword: true },
      ...screen.answers,
    })
    await page.goto(screen.url)
    await expect(screen.ready(page)).toBeVisible()
    await screen.open?.(page)
    await api.settled()
    await expectNoViolations(page)
  })
}

test('account security tab has no WCAG 2.1 AA violations found by axe', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'user.me': { ...user, regionId: 'r1', mfaEnabled: false, mfaSetupRequired: false, hasPassword: true },
    'auth.sessions': sessions,
  })
  await page.goto('/collections/campaign')
  await page.getByRole('banner', { name: 'Page tools' }).getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click()
  await page.getByRole('dialog').getByRole('tab', { name: 'Security', exact: true }).click()
  await expect(page.getByText("Where you're signed in")).toBeVisible()
  await api.settled()
  await expectNoViolations(page)
})
