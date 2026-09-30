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
import { conflict, expect, test } from './lib/trpc'

const organisations = [
  { id: 'o1', name: 'Brandfolio', userCount: 3 },
  { id: 'o2', name: 'Palladium Germany', userCount: 0 },
]
const people = [
  { id: 'u1', name: 'Alex Morgan', email: 'alex@example.test', company: 'Studio', region: 'Europe', regionId: '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', organisation: 'Brandfolio', organisationId: 'o1', role: 'member', emailVerified: true, approved: true, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', lastLoginAt: null, suspendedAt: null, mfaEnabled: false, groups: [] },
]

test('an admin creates, renames and removes organisations from the User Management menu', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'organisation.list': organisations,
    'organisation.create': (input: { name: string }) => input.name === 'Brandfolio' ? conflict('An organisation with this name already exists.') : { id: 'o3', name: input.name, userCount: 0 },
    'organisation.update': null,
    'organisation.remove': { unassignedUsers: 3 },
  }, { role: 'admin' })
  await page.goto('/admin')
  await page.getByRole('navigation', { name: 'Administration' }).getByRole('link', { name: 'Organisations' }).click()
  await expect(page).toHaveURL(/\/admin\/organisations$/)
  await expect(page.getByRole('row', { name: /Brandfolio 3/ })).toBeVisible()

  await page.getByRole('button', { name: 'Add organisation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create organisation' })
  await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled()
  await dialog.getByLabel('Name *').fill('Brandfolio')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('An organisation with this name already exists.')).toBeVisible()
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name *').fill('Palladium France')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()
  expect(api.inputs('organisation.create')).toEqual([{ name: 'Brandfolio' }, { name: 'Palladium France' }])

  await page.getByRole('row', { name: /Palladium Germany/ }).getByRole('button', { name: 'Rename' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename organisation' })
  await expect(rename.getByLabel('Name *')).toHaveValue('Palladium Germany')
  await rename.getByLabel('Name *').fill('Palladium DACH')
  await rename.getByRole('button', { name: 'Rename' }).click()
  await expect(rename).toBeHidden()
  expect(api.last('organisation.update')).toEqual({ id: 'o2', name: 'Palladium DACH' })

  await page.getByRole('row', { name: /Brandfolio/ }).getByRole('button', { name: 'Remove' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Remove Brandfolio' })
  await expect(confirm).toContainText('Its 3 user(s) keep their account, without an organisation.')
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Organisation removed. 3 user(s) no longer belong to one.')).toBeVisible()
  expect(api.last('organisation.remove')).toBe('o1')
})

test('an admin or a manager sets or clears the organisation of a user; a manager never changes their own', async ({ page, mockTrpc }) => {
  const api = await mockTrpc({
    'user.list': people,
    'region.list': [{ id: '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', name: 'Europe', defaultGroupId: 'g1', licenseCount: 0, userCount: 1 }],
    'organisation.list': organisations,
    'user.update': null,
  }, { role: 'admin' })
  await page.goto('/admin/users')
  await expect(page.getByRole('row', { name: /Alex Morgan/ })).toContainText('Brandfolio')
  await page.getByRole('searchbox', { name: 'Search users' }).fill('brandfolio')
  await expect(page.getByRole('row', { name: /Alex Morgan/ })).toBeVisible()
  await page.getByRole('button', { name: 'View Alex Morgan' }).click()
  const details = page.getByRole('dialog', { name: 'Alex Morgan' })
  const select = details.getByLabel('Organisation')
  await expect(select).toHaveValue('o1')
  await select.selectOption('o2')
  await details.getByRole('button', { name: 'Save changes' }).click()
  await expect(details).toBeHidden()
  expect(api.last('user.update')).toMatchObject({ id: 'u1', organisationId: 'o2' })
  await page.getByRole('button', { name: 'View Alex Morgan' }).click()
  await details.getByLabel('Organisation').selectOption('')
  await details.getByRole('button', { name: 'Save changes' }).click()
  await expect(details).toBeHidden()
  expect(api.last('user.update')).toMatchObject({ id: 'u1', organisationId: null })

  await mockTrpc({
    'user.me': { id: 'manager', name: 'Morgan', email: 'morgan@example.test', role: 'manager', regionId: '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', approved: true, emailVerified: true },
    'user.list': [...people, { ...people[0], id: 'manager', name: 'Morgan', email: 'morgan@example.test', role: 'manager', organisation: null, organisationId: null }],
    'region.list': [{ id: '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f', name: 'Europe', defaultGroupId: 'g1', licenseCount: 0, userCount: 1 }],
    'organisation.list': organisations,
    'user.update': null,
  })
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'View Alex Morgan' }).click()
  await details.getByLabel('Organisation').selectOption('o2')
  await details.getByRole('button', { name: 'Save changes' }).click()
  await expect(details).toBeHidden()
  expect(api.last('user.update')).toMatchObject({ id: 'u1', organisationId: 'o2' })
  await page.getByRole('button', { name: 'View Morgan' }).click()
  const own = page.getByRole('dialog', { name: 'Morgan' })
  await expect(own.getByText('An administrator manages your role, region, organisation and groups.')).toBeVisible()
  await expect(own.getByLabel('Organisation')).toHaveCount(0)
  await own.getByRole('button', { name: 'Save changes' }).click()
  await expect(own).toBeHidden()
  expect(api.last('user.update')).not.toHaveProperty('organisationId')
})
