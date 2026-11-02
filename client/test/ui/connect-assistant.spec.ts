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
import { expect, test, TrpcError } from './lib/trpc'

// The page where a person lets an AI assistant reach the library.
const query = 'response_type=code&client_id=c1&redirect_uri=https%3A%2F%2Fassistant.example.com%2Fcb&code_challenge=abc&code_challenge_method=S256&state=s1'
const described = {
  client: { name: 'Claude', clientUri: null, logoUri: null, returnsTo: 'assistant.example.com', registeredAt: new Date().toISOString() },
  scopes: ['damvia.read', 'damvia.download'],
  refusal: null,
  errorRedirect: null,
}

test('the person sees who asks, where they return and what the assistant may do, then allows it', async ({ page, mockTrpc, shot }) => {
  let approved: unknown = null
  await mockTrpc({
    'oauth.describe': described,
    'oauth.approve': (input: unknown) => { approved = input; return { redirectTo: 'https://assistant.example.com/cb?code=xyz&state=s1' } },
  })
  await page.route('https://assistant.example.com/**', route => route.fulfill({ body: 'back at the assistant' }))
  await page.goto(`/connect-assistant?${query}`)
  await expect(page.getByRole('heading', { name: 'Connect an AI assistant' })).toBeVisible()
  await expect(page.getByText('Claude', { exact: true })).toBeVisible()
  await expect(page.getByText(user.email)).toBeVisible()
  await expect(page.getByText('assistant.example.com', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await shot('connect-assistant')
  await page.getByRole('button', { name: 'Allow' }).click()
  await expect(page).toHaveURL(/assistant\.example\.com\/cb\?code=xyz/)
  expect(approved).toMatchObject({ client_id: 'c1', state: 's1', code_challenge_method: 'S256' })
})

test('a guest is told they cannot connect an assistant, with no button to allow it', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'oauth.describe': { ...described, refusal: 'guest' } })
  await page.goto(`/connect-assistant?${query}`)
  await expect(page.getByRole('alert')).toHaveText('Guest accounts cannot connect an AI assistant.')
  await expect(page.getByRole('button', { name: 'Allow' })).toHaveCount(0)
})

test('an invalid request says so instead of asking', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'oauth.describe': new TrpcError(400, 'BAD_REQUEST', 'The return address does not belong to this assistant.') })
  await page.goto(`/connect-assistant?${query}`)
  await expect(page.getByRole('alert')).toHaveText('The return address does not belong to this assistant.')
})
