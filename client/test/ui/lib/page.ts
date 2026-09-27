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
import { type Page } from '@playwright/test'

// Puts a filter on the page's filter bar, without a value yet, through the
// "Add filter" popover. The name filter is always on the bar.
export async function addFilter(page: Page, ...names: string[]) {
  for (const name of names.filter(name => name !== 'Name')) {
    await page.getByRole('button', { name: 'Add filter', exact: true }).click()
    await page.getByRole('dialog', { name: 'Add filter', exact: true }).getByRole('button', { name, exact: true }).click()
    await page.getByRole('button', { name: 'Add without a value', exact: true }).click()
  }
}
