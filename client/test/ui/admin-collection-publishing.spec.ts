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
import type { Locator, Page } from '@playwright/test'
import { conflict, expect, test, type MockTrpc } from './lib/trpc'

// Times are entered and shown in the admin's own zone; pinned here so the
// expected values read the same on every machine.
test.use({ timezoneId: 'UTC', locale: 'en-US' })

const draft = (overrides = {}) => ({
  id: 'spring', name: 'Spring launch', description: null, public: true, draft: true, synchronized: false,
  publishAt: '2030-03-01T09:00:00.000Z', children: [], page: null, thumbnailURL: null, orphanedAt: null, orphanedReason: null,
  orphanedFromName: null, parentId: null, canEdit: true, canEditLimitedToGroupIds: false, limitedToGroupIds: [],
  catalogueMode: 'files', includesAllRecords: false, numberOfRecords: 0, numberOfFiles: 0, ownerId: null,
  ...overrides,
})

async function openSettings(page: Page, mockTrpc: MockTrpc, collection = draft(), beforeOpen = async (_row: Locator) => {}) {
  const api = await mockTrpc({
    'collection.treeAdmin': [collection],
    'collection.tree': [collection],
    'collection.update': (input: { draft?: boolean }) => ({ ...collection, ...input, publishAt: input.draft ? collection.publishAt : null }),
    'collection.schedulePublish': (input: { at: string }) => ({ ...collection, publishAt: input.at }),
    'collection.unschedulePublish': () => ({ ...collection, publishAt: null }),
  }, { role: 'admin' })
  await page.goto('/admin/collections')
  const row = page.getByRole('listitem').filter({ hasText: 'Spring launch' })
  await beforeOpen(row)
  await row.getByRole('button', { name: 'Settings of Spring launch' }).click()
  return { api, dialog: page.getByRole('dialog') }
}

test('the list says when a draft publishes, and the settings change the time', async ({ page, mockTrpc }) => {
  const { api, dialog } = await openSettings(page, mockTrpc, draft(), async (row) => {
    await expect(row.getByText('publishes Mar 1, 2030, 9:00 AM')).toBeVisible()
  })

  await expect(dialog.getByLabel('Hide collection')).toBeChecked()
  await expect(dialog.getByLabel('Publish on a schedule')).toBeChecked()
  const when = dialog.getByLabel(/Date and time/)
  await expect(when).toHaveValue('2030-03-01T09:00')
  await expect(dialog.getByText('Currently scheduled for Mar 1, 2030, 9:00 AM.')).toBeVisible()

  await when.fill('2030-04-02T10:30')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => api.count('collection.schedulePublish')).toBe(1)
  expect(api.last('collection.update').draft).toBe(true)
  expect(api.last('collection.schedulePublish')).toEqual({ id: 'spring', at: '2030-04-02T10:30:00.000Z' })
  expect(api.count('collection.unschedulePublish')).toBe(0)
})

test('saving an unchanged time sends no schedule, and unticking the schedule removes it', async ({ page, mockTrpc }) => {
  const { api, dialog } = await openSettings(page, mockTrpc)
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => api.count('collection.update')).toBe(1)
  await api.settled()
  expect(api.count('collection.schedulePublish')).toBe(0)
  expect(api.count('collection.unschedulePublish')).toBe(0)

  await page.getByRole('button', { name: 'Settings of Spring launch' }).click()
  await dialog.getByLabel('Publish on a schedule').click()
  await expect(dialog.getByLabel(/Date and time/)).toBeHidden()
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => api.count('collection.unschedulePublish')).toBe(1)
  expect(api.last('collection.unschedulePublish')).toBe('spring')
})

test('a draft is scheduled for the first time, and a time in the past is refused before saving', async ({ page, mockTrpc }) => {
  const { api, dialog } = await openSettings(page, mockTrpc, draft({ publishAt: null }))
  await expect(dialog.getByLabel('Publish on a schedule')).not.toBeChecked()
  await dialog.getByLabel('Publish on a schedule').click()

  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Pick the date and time to publish the collection.')).toBeVisible()
  await dialog.getByLabel(/Date and time/).fill('2001-01-01T08:00')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Pick a time in the future to publish the collection.')).toBeVisible()
  expect(api.count('collection.update')).toBe(0)

  await dialog.getByLabel(/Date and time/).fill('2030-05-06T07:15')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => api.count('collection.schedulePublish')).toBe(1)
  expect(api.last('collection.schedulePublish')).toEqual({ id: 'spring', at: '2030-05-06T07:15:00.000Z' })
})

test('publishing by hand needs no schedule, and a published collection offers none', async ({ page, mockTrpc }) => {
  const { api, dialog } = await openSettings(page, mockTrpc)
  await dialog.getByLabel('Hide collection').click()
  await expect(dialog.getByLabel('Publish on a schedule')).toBeHidden()
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => api.count('collection.update')).toBe(1)
  await api.settled()
  expect(api.last('collection.update').draft).toBe(false)
  expect(api.count('collection.schedulePublish')).toBe(0)
  expect(api.count('collection.unschedulePublish')).toBe(0)
})

test('a new draft can be scheduled from the create dialog', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'collection.treeAdmin': [],
    'collection.create': (input: { name: string, publishAt?: string }) => draft({ id: 'new', name: input.name, publishAt: input.publishAt ?? null }),
  }, { role: 'admin' })
  await page.goto('/admin/collections')
  await page.getByRole('button', { name: 'Add collection' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name *').fill('Summer drop')

  await expect(dialog.getByLabel('Publish on a schedule')).toBeHidden()
  await dialog.getByLabel('Draft').click()
  await dialog.getByLabel('Publish on a schedule').click()
  await dialog.getByRole('button', { name: 'Create collection' }).click()
  await expect(page.getByText('Pick the date and time to publish the collection.')).toBeVisible()
  // The browser holds back a time before the field's minimum itself.
  await dialog.getByLabel(/Date and time/).fill('2001-01-01T08:00')
  await dialog.getByRole('button', { name: 'Create collection' }).click()
  expect(await dialog.getByLabel(/Date and time/).evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true)
  await api.settled()
  expect(api.count('collection.create')).toBe(0)

  await dialog.getByLabel(/Date and time/).fill('2030-06-01T06:45')
  await dialog.getByRole('button', { name: 'Create collection' }).click()
  await expect.poll(() => api.count('collection.create')).toBe(1)
  expect(api.last('collection.create')).toMatchObject({ name: 'Summer drop', public: true, draft: true, publishAt: '2030-06-01T06:45:00.000Z' })
})

test('a collection created without a schedule, or not as a draft, sends no time', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'collection.treeAdmin': [],
    'collection.create': (input: { name: string }) => draft({ id: 'new', name: input.name, draft: false, publishAt: null }),
  }, { role: 'admin' })
  await page.goto('/admin/collections')
  await page.getByRole('button', { name: 'Add collection' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name *').fill('Autumn')
  // Picked, then the draft unticked: the schedule goes with it.
  await dialog.getByLabel('Draft').click()
  await dialog.getByLabel('Publish on a schedule').click()
  await dialog.getByLabel(/Date and time/).fill('2030-06-01T06:45')
  await dialog.getByLabel('Draft').click()
  await expect(dialog.getByLabel('Publish on a schedule')).toBeHidden()
  await dialog.getByRole('button', { name: 'Create collection' }).click()
  await expect.poll(() => api.count('collection.create')).toBe(1)
  expect(api.last('collection.create').draft).toBe(false)
  expect(api.last('collection.create')).not.toHaveProperty('publishAt')
})

test('a new product collection can be scheduled too', async ({ page, mockTrpc }) => {
  // Refused, so the dialog stays instead of opening the product builder.
  const api = await mockTrpc({ 'collection.treeAdmin': [], 'collection.create': conflict('Stop here.') }, { role: 'admin' })
  await page.goto('/admin/product-collections')
  await page.getByRole('button', { name: 'New products collection' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name *').fill('Launch range')
  await dialog.getByLabel('Draft').click()
  await dialog.getByLabel('Publish on a schedule').click()
  await dialog.getByLabel(/Date and time/).fill('2030-07-14T12:00')
  await dialog.getByRole('button', { name: 'Create and build it' }).click()
  await expect.poll(() => api.count('collection.create')).toBe(1)
  expect(api.last('collection.create')).toMatchObject({ catalogueMode: 'products', draft: true, publishAt: '2030-07-14T12:00:00.000Z' })
})
