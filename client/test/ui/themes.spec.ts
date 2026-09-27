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

// The design system reference page: no API, the shared tokens and controls.
for (const neutral of [false, true]) {
  test(`${neutral ? 'Neutral' : 'Damvia'} theme preserves production interactions`, async ({ page }) => {
    await page.goto('/design-system.html')
    if (neutral) await page.getByRole('button', { name: 'Damvia brand theme', exact: true }).click()
    const primary = page.getByRole('button', { name: 'Download assets', exact: true })
    await expect(primary).toHaveCSS('background-color', neutral ? 'rgb(38, 38, 38)' : 'rgb(0, 68, 244)')
    await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(page.getByRole('button', { name: 'Unavailable', exact: true })).toBeDisabled()
    const checkbox = page.getByLabel('Include metadata')
    const fieldBorder = await page.locator('#reference-search').evaluate(element => getComputedStyle(element).borderColor)
    await expect(checkbox).toHaveCSS('border-color', fieldBorder)
    await expect(checkbox).toHaveCSS('border-radius', '0px')
    await checkbox.focus(); await page.keyboard.press('Space')
    await expect(checkbox).toBeChecked()
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Web ready', exact: true }).click()
    await expect(page.getByRole('combobox')).toHaveText('Web ready')
    const trigger = page.getByRole('button', { name: 'Edit collection', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveCSS('border-radius', '12px')
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toHaveCSS('background-color', neutral ? 'rgb(38, 38, 38)' : 'rgb(0, 68, 244)')
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused()
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await expect(page.getByRole('menu')).toHaveClass(neutral ? /dv-neutral/ : /dv-admin/)
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Activity', exact: true }).click()
    await expect(page.getByText('No recent downloads.', { exact: true })).toBeVisible()
    await primary.click()
    const toast = page.locator('[data-sonner-toast]').first()
    await expect(toast).toContainText('Download prepared')
    await expect(toast).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(toast.locator('.dv-toast__title')).toHaveCSS('color', neutral ? 'rgb(38, 38, 38)' : 'rgb(23, 35, 67)')
    await expect(page.locator('[data-sonner-toaster]')).toHaveCSS('position', 'fixed')
  })
}

test('neutral reference fits mobile and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/design-system.html')
  await page.getByRole('button', { name: 'Damvia brand theme', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click()
  const bounds = await page.getByRole('dialog').boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(358)
})
