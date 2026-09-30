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
// Runs against the client built with the hello module of test/fixtures (the
// modules project of playwright.config.ts): a module shows as part of the
// client, in its menus, its routes and its screens.
import { expect, test } from './lib/trpc'

test('a module page opens from the main menu and calls its own procedures', async ({ page, mockTrpc }) => {
  const notes = [{ id: 'n1', text: 'First note' }]
  const api = await mockTrpc({
    'modules.hello.list': () => notes,
    'modules.hello.add': (input: { text: string }) => { notes.push({ id: `n${notes.length + 1}`, text: input.text }); return notes.at(-1) },
  })
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Collections' }).getByRole('link', { name: 'Notes' }).click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect(page).toHaveTitle('Notes · Studio Library')
  const list = page.getByRole('list', { name: 'Notes' })
  await expect(list.getByRole('listitem')).toHaveText(['First note'])
  await page.getByRole('textbox', { name: 'New note' }).fill('Second note')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(list.getByRole('listitem')).toHaveText(['First note', 'Second note'])
  expect(api.inputs('modules.hello.add')).toEqual([{ text: 'Second note' }])
})

test('a module admin entry sits in its menu section and shows only to the roles of its route', async ({ page, mockTrpc }) => {
  await mockTrpc({ 'modules.hello.list': [{ id: 'n1', text: 'First note' }], 'user.list': [] }, { role: 'admin' })
  await page.goto('/admin')
  const menu = page.getByRole('navigation', { name: 'Administration' })
  await menu.getByRole('link', { name: 'All notes' }).click()
  await expect(page).toHaveURL(/\/admin\/notes$/)
  await expect(page.getByRole('heading', { name: 'All notes', level: 1 })).toBeVisible()
  await expect(page.getByText('1 notes')).toBeVisible()
  await mockTrpc({ 'user.list': [], 'region.list': [] }, { role: 'manager' })
  await page.goto('/admin/users')
  await expect(menu.getByRole('link', { name: 'Users' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'All notes' })).toHaveCount(0)
})
