import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

const audience = {
  groups: [{ id: 'group-design', name: 'Design team' }, { id: 'group-sales', name: 'Sales' }],
  users: [{ id: 'user-ada', name: 'Ada Lovelace', email: 'ada@example.test' }],
}
const base = { id: 'personal', name: 'Launch shortlist', public: false, ownerId: 'preview-user', canEdit: true, children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: 'brand', synchronized: false, invitations: [], limitedToGroupIds: [] }
const everyone = { filter: true, search: true, display: true, share: true }

async function fixture(page: Page, item: object) {
  const errors: string[] = []
  const updates: any[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data = responses[name] ?? []
    if (name === 'collection.findById') data = item
    if (name === 'collection.actionBarAudience') data = audience
    if (name === 'collection.update') {
      updates.push(route.request().postDataJSON())
      data = item
    }
    await route.fulfill({ json: { result: { data } } })
  })
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  return { errors, updates }
}

test('readers only get the tools the collection shows them', async ({ page }) => {
  const { errors } = await fixture(page, { ...base, canEdit: false, visibleActions: { ...everyone, filter: false, search: false }, actionBar: null })
  await page.goto('/collections/personal')
  await expect(page.getByRole('button', { name: 'Display preferences', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Search in this collection' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('an editor follows the parent, then sets custom rules for the collection and its sub-collections', async ({ page }) => {
  const { errors, updates } = await fixture(page, {
    ...base,
    visibleActions: everyone,
    actionBar: {
      own: null,
      inherited: { filter: { mode: 'only', roles: ['member'], groupIds: ['group-design'], userIds: [] } },
      inheritedFrom: { id: 'brand', name: 'Brand library' },
      descendantOverrides: 2,
    },
  })
  await page.goto('/collections/personal')
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveAttribute('title', /Hidden for some people/)
  await page.getByRole('button', { name: 'Collection actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Collection settings', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Follows “Brand library”.')).toBeVisible()
  await expect(dialog.getByText('Visible to Members and Design team only')).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Filter' })).toBeDisabled()

  await dialog.getByText('Custom', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Search in collection' }).click()
  await page.getByRole('option', { name: 'Everyone except…' }).click()
  await dialog.getByRole('group', { name: 'Search in collection: who does not see it' }).getByRole('button', { name: 'Guests' }).click()
  await expect(dialog.getByText('Hidden from Guests')).toBeVisible()
  await dialog.getByLabel('Apply to all sub-collections').click()
  await dialog.getByRole('button', { name: 'Save changes' }).click()

  await expect.poll(() => updates.length).toBe(1)
  expect(updates[0].actionBar).toEqual({
    filter: { mode: 'only', roles: ['member'], groupIds: ['group-design'], userIds: [] },
    search: { mode: 'except', roles: ['guest'], groupIds: [], userIds: [] },
    display: { mode: 'everyone', roles: [], groupIds: [], userIds: [] },
    share: { mode: 'everyone', roles: [], groupIds: [], userIds: [] },
  })
  expect(updates[0].resetDescendantActionBars).toBe(true)
  expect(errors).toEqual([])
})
