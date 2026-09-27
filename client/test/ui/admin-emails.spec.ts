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
import { expect, test, trpcError } from './lib/trpc'

const template = {
  key: 'reset-password',
  label: 'Password reset',
  trigger: 'Someone asks to reset their password.',
  recipients: 'The account owner',
  hasButton: true,
  variables: [{ name: 'appName', description: 'The name of this Damvia instance' }, { name: 'url', description: 'The password reset link' }],
  blocks: [],
  content: { subject: 'Reset your password', preheader: 'Valid for one hour.', heading: 'Reset your password', bodyHtml: '<p>Choose a new password.</p>', buttonLabel: 'Choose a new password' },
  defaults: { subject: 'Reset your password', preheader: 'Valid for one hour.', heading: 'Reset your password', bodyHtml: '<p>Choose a new password.</p>', buttonLabel: 'Choose a new password' },
  customised: true,
  updatedAt: '2026-09-20T10:00:00.000Z',
}
const list = [
  { key: 'reset-password', label: 'Password reset', group: 'account', trigger: template.trigger, recipients: template.recipients, subject: 'Reset your password', customised: true, updatedAt: '2026-09-20T10:00:00.000Z', updatedBy: 'Ada' },
  { key: 'invitation', label: 'Collection invitation', group: 'sharing', trigger: 'Someone shares a collection.', recipients: 'The invited person', subject: 'Invited', customised: false, updatedAt: null, updatedBy: null },
  { key: 'disk-alert', label: 'Server disk alert', group: 'alerts', trigger: 'The disk fills up.', recipients: 'SERVER_ALERT_EMAILS', subject: 'Disk', customised: false, updatedAt: null, updatedBy: null },
]
const settings = { senderName: null, senderAddress: null, replyTo: null, footerText: '', effectiveFrom: { name: 'Damvia', address: 'no-reply@localhost' } }
const previewHtml = (input: { content: { subject: string } }) => ({ subject: input.content.subject, html: `<html><body><h1>${input.content.subject}</h1></body></html>` })

test('the emails page groups every email and saves the sender', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({ 'emailTemplate.list': list, 'emailTemplate.getSettings': settings, 'emailTemplate.updateSettings': (input: unknown) => input, 'emailTemplate.get': template, 'emailTemplate.preview': previewHtml }, { role: 'admin' })
  await page.goto('/admin/emails')
  for (const group of ['Account', 'Sharing and downloads', 'Alerts']) await expect(page.getByRole('heading', { name: group })).toBeVisible()
  const reset = page.getByRole('link', { name: /Password reset/ })
  await expect(reset).toContainText('Customised')
  await expect(reset).toContainText('by Ada')
  await expect(page.getByText('no-reply@localhost')).toBeVisible()

  await page.getByLabel('Name', { exact: true }).fill('  Acme Assets ')
  await page.getByLabel('Address', { exact: true }).fill('assets@acme.test')
  await page.getByLabel(/^Footer/).fill('Acme Ltd')
  await page.getByRole('button', { name: 'Save sender' }).click()
  await expect.poll(() => api.count('emailTemplate.updateSettings')).toBe(1)
  expect(api.last('emailTemplate.updateSettings')).toEqual({ senderName: 'Acme Assets', senderAddress: 'assets@acme.test', replyTo: null, footerText: 'Acme Ltd' })

  await reset.click()
  await expect(page).toHaveURL(/\/admin\/emails\/reset-password$/)
})

test('editing an email previews the draft, inserts variables, saves, sends a test and resets', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'emailTemplate.get': template,
    'emailTemplate.list': list,
    'emailTemplate.preview': previewHtml,
    'emailTemplate.update': (input: { content: typeof template.content }) => ({ content: input.content, customised: true, updatedAt: new Date().toISOString() }),
    'emailTemplate.sendTest': { sentTo: 'admin@example.test' },
    'emailTemplate.reset': { content: template.defaults, customised: false, updatedAt: null },
  }, { role: 'admin' })
  await page.goto('/admin/emails/reset-password')
  await expect(page.locator('.admin-topbar h1')).toHaveText('Password reset')
  const preview = page.frameLocator('iframe[title="Email preview"]')
  await expect(preview.locator('h1')).toHaveText('Reset your password')
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeDisabled()

  const subject = page.getByLabel('Subject', { exact: true })
  await subject.fill('Reset your  password')
  await subject.press('Home')
  await page.getByRole('button', { name: /^appName/ }).click()
  await expect(subject).toHaveValue('{{ appName }}Reset your  password')
  await expect(preview.locator('h1')).toHaveText('{{ appName }}Reset your password')
  expect(api.last('emailTemplate.preview').content.subject).toBe('{{ appName }}Reset your  password')

  await page.getByRole('button', { name: 'Send me a test' }).click()
  await expect(page.getByText('Test sent to admin@example.test')).toBeVisible()
  expect(api.last('emailTemplate.sendTest').content.subject).toBe('{{ appName }}Reset your  password')

  await save.click()
  await expect(page.getByText('Email saved')).toBeVisible()
  expect(api.last('emailTemplate.update')).toMatchObject({ key: 'reset-password', content: { subject: '{{ appName }}Reset your  password' } })
  await expect(save).toBeDisabled()

  await page.getByRole('button', { name: 'Reset to default' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore default' }).click()
  await expect(page.getByText('Default wording restored')).toBeVisible()
  expect(api.inputs('emailTemplate.reset')).toEqual(['reset-password'])
  await expect(subject).toHaveValue('Reset your password')
})

test('a template error shows next to the preview and blocks the test email', async ({ page, mockTrpc }) => {
  await mockTrpc({
    'emailTemplate.get': template,
    'emailTemplate.preview': (input: { content: { subject: string } }) => input.content.subject.includes('{%')
      ? trpcError(400, 'BAD_REQUEST', 'The template has an error: tag {% if %} not closed')
      : previewHtml(input),
  }, { role: 'admin' })
  await page.goto('/admin/emails/reset-password')
  await expect(page.frameLocator('iframe[title="Email preview"]').locator('h1')).toHaveText('Reset your password')
  await page.getByLabel('Subject', { exact: true }).fill('{% if %}Broken')
  await expect(page.getByRole('alert')).toContainText('tag {% if %} not closed')
  await expect(page.getByRole('button', { name: 'Send me a test' })).toBeDisabled()
  await page.getByLabel('Subject', { exact: true }).fill('Fixed')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('the brand accent colours the portal but not the admin', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'settings.getBrandTheme': { accentColor: '#e4572e' }, 'emailTemplate.list': list, 'emailTemplate.getSettings': settings }, { role: 'admin' })
  await page.goto('/')
  const portalBlue = () => page.locator('.dv-theme').first().evaluate(element => getComputedStyle(element).getPropertyValue('--dv-color-blue').trim())
  await expect.poll(portalBlue).toBe('#e4572e')
  await page.goto('/admin/emails')
  await expect.poll(portalBlue).not.toBe('#e4572e')
})
