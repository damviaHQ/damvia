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
import { files } from './lib/fixtures'
import { expect, test } from './lib/trpc'

const audience = {
  groups: [{ id: 'group-design', name: 'Design team' }, { id: 'group-sales', name: 'Sales' }],
  users: [{ id: 'user-ada', name: 'Ada Lovelace', email: 'ada@example.test' }],
}
const base = { id: 'personal', name: 'Launch shortlist', public: false, ownerId: 'preview-user', canEdit: true, children: [], files: files.slice(0, 2), sampleFiles: [], numberOfFiles: 2, parent: null, parentId: 'brand', synchronized: false, invitations: [], limitedToGroupIds: [] }
const everyone = { filter: true, search: true, display: true, share: true }

test('readers only get the tools the collection shows them', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'collection.findById': { ...base, canEdit: false, visibleActions: { ...everyone, filter: false }, actionBar: null } })
  await page.goto('/collections/personal')
  await expect(page.getByRole('button', { name: 'Display preferences', exact: true })).toBeVisible()
  await expect(page.getByRole('search', { name: 'Filter this page' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add filter', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Filter by name' })).toHaveCount(0)
})

test('readers see the filter bar when the collection shows it', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'collection.findById': { ...base, canEdit: false, visibleActions: everyone, actionBar: null } })
  await page.goto('/collections/personal')
  await expect(page.getByRole('search', { name: 'Filter this page' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add filter', exact: true })).toBeVisible()
})

test('searching from a collection stays inside it only when the collection shows search', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'collection.findById': { ...base, canEdit: false, visibleActions: everyone, actionBar: null } })
  await page.goto('/collections/personal')
  await page.getByRole('button', { name: 'Search filters', exact: true }).click()
  await expect(page).toHaveURL(/from_collection=personal/)
  await expect(page).toHaveURL(/search_scope=current/)

  await mockTrpc({ 'collection.findById': { ...base, canEdit: false, visibleActions: { ...everyone, search: false }, actionBar: null } })
  await page.goto('/collections/personal')
  await expect(page.getByText('Launch shortlist').first()).toBeVisible()
  await page.getByRole('button', { name: 'Search filters', exact: true }).click()
  await expect(page).toHaveURL(/\/search\?/)
  expect(page.url()).not.toContain('from_collection')
  expect(page.url()).toContain('search_scope=all')
})

test('an editor follows the parent, then sets custom rules for the collection and its sub-collections', async ({ page, mockTrpc }) => {
  const item = {
    ...base,
    visibleActions: everyone,
    actionBar: {
      own: null,
      inherited: { filter: { mode: 'only', roles: ['member'], groupIds: ['group-design'], userIds: [] } },
      inheritedFrom: { id: 'brand', name: 'Brand library' },
      descendantOverrides: 2,
    },
  }
  const api = await mockTrpc({ 'collection.findById': item, 'collection.actionBarAudience': audience, 'collection.update': item })
  await page.goto('/collections/personal')
  await expect(page.getByRole('textbox', { name: 'Filter by name' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Collection actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Collection settings', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Follows “Brand library”.')).toBeVisible()
  await expect(dialog.getByText('Visible to Members and Design team only')).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Filter' })).toBeDisabled()

  await dialog.getByText('Custom', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Display preferences' }).click()
  await page.getByRole('option', { name: 'Everyone except…' }).click()
  await dialog.getByRole('group', { name: 'Display preferences: who does not see it' }).getByRole('button', { name: 'Guests' }).click()
  await expect(dialog.getByText('Hidden from Guests')).toBeVisible()
  await dialog.getByLabel('Apply to all sub-collections').click()
  await dialog.getByRole('button', { name: 'Save changes' }).click()

  await expect.poll(() => api.count('collection.update')).toBe(1)
  const [update] = api.inputs('collection.update')
  expect(update.actionBar).toEqual({
    filter: { mode: 'only', roles: ['member'], groupIds: ['group-design'], userIds: [] },
    search: { mode: 'everyone', roles: [], groupIds: [], userIds: [] },
    display: { mode: 'except', roles: ['guest'], groupIds: [], userIds: [] },
    share: { mode: 'everyone', roles: [], groupIds: [], userIds: [] },
  })
  expect(update.resetDescendantActionBars).toBe(true)
})
