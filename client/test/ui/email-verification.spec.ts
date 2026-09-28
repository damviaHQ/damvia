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
import { user } from './lib/fixtures'
import { expect, test, trpcError, unauthorized } from './lib/trpc'

const pending = { ...user, approved: false, emailVerified: false, regionId: 'r1', mfaEnabled: false, mfaSetupRequired: false, hasPassword: true }

// The mail is often read on another device, where nobody is signed in.
test('the confirmation link works signed out and leaves the address bar', async ({ page, mockTrpc }) => {
  const mock = await mockTrpc({ 'user.me': unauthorized(), 'user.verifyEmail': undefined })
  await page.goto('/?verificationCode=abc123')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('[data-sonner-toast]').first()).toContainText('Your email address is confirmed. Sign in to continue.')
  expect(mock.inputs('user.verifyEmail')).toEqual(['abc123'])
})

test('a used confirmation link says so', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'user.me': unauthorized(), 'user.verifyEmail': trpcError(400, 'BAD_REQUEST', 'This confirmation link is invalid or has already been used.') })
  await page.goto('/?verificationCode=used')
  await expect(page.locator('[data-sonner-toast]').first()).toContainText('invalid or has already been used')
})

test('someone waiting for the confirmation mail can correct their address or sign out', async ({ page, mockTrpc }) => {
  const mock = await mockTrpc({ 'user.me': pending, 'user.changeUnverifiedEmail': undefined, 'auth.logout': undefined })
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('alex@example.test')
  await page.getByRole('button', { name: 'change it', exact: true }).click()
  const field = page.getByLabel('Email address', { exact: true })
  await expect(field).toHaveValue('alex@example.test')
  mock.set({ 'user.changeUnverifiedEmail': trpcError(400, 'BAD_REQUEST', 'Email address already taken.') })
  await field.fill('taken@example.test')
  await page.getByRole('button', { name: 'Send to this address', exact: true }).click()
  await expect(page.getByText('Email address already taken.', { exact: true })).toBeVisible()
  mock.set({ 'user.changeUnverifiedEmail': undefined, 'user.me': { ...pending, email: 'alex@example.com' } })
  await field.fill('alex@example.com')
  await page.getByRole('button', { name: 'Send to this address', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('alex@example.com')
  expect(mock.last('user.changeUnverifiedEmail')).toBe('alex@example.com')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect.poll(() => mock.count('auth.logout')).toBe(1)
})
