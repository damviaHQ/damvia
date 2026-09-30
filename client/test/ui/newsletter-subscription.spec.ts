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

test('people manage news and updates from their profile, and see when their address bounced', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'newsletter.mySubscription': { subscribed: true, bouncedAt: '2026-09-28T10:00:00.000Z', bounceReason: '550 mailbox unavailable' },
    'newsletter.setMySubscription': (input: { subscribed: boolean }) => input,
  })
  await page.goto('/account/profile')
  const section = page.getByRole('region', { name: 'Email communication' })
  await expect(section.getByRole('status')).toContainText('550 mailbox unavailable')
  const box = section.getByRole('checkbox', { name: /^Receive news and updates from / })
  await expect(box).not.toBeChecked()
  await box.click()
  await expect.poll(() => api.last('newsletter.setMySubscription')).toEqual({ subscribed: true })
})
