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
import { records, recordsApi } from './lib/records'
import { expect, test } from './lib/trpc'

test('cells are selected as a range, filled from the handle and pasted as a block', async ({ page, mockTrpc, shot }) => {
  const api = await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  const grid = page.getByRole('grid')
  const at = (row: number, column: number) => grid.locator(`[data-cell="${row}-${column}"]`)
  await at(0, 2).waitFor()

  // Drag across cells to select them.
  const from = await at(0, 2).boundingBox()
  const to = await at(1, 3).boundingBox()
  await page.mouse.move(from!.x + 20, from!.y + 10)
  await page.mouse.down()
  await page.mouse.move(to!.x + 20, to!.y + 10, { steps: 4 })
  await page.mouse.up()
  await expect(at(1, 3)).toHaveAttribute('aria-selected', 'true')
  await expect(at(2, 2)).not.toHaveAttribute('aria-selected', 'true')
  await shot('range-select')

  // Drag the fill handle of one cell down two rows.
  await at(0, 2).click()
  const handle = at(0, 2).locator('.records-grid-fill-handle')
  const box = await handle.boundingBox()
  const target = await at(2, 2).boundingBox()
  await page.mouse.move(box!.x + 4, box!.y + 4)
  await page.mouse.down()
  await page.mouse.move(target!.x + 20, target!.y + 10, { steps: 6 })
  await shot('range-fill')
  await page.mouse.up()
  await expect.poll(() => api.inputs('record.patchMany')[0]).toEqual({ changes: [
    { id: records[1].id, values: { name: 'Canvas tote' } },
    { id: records[2].id, values: { name: 'Canvas tote' } },
  ] })
  await expect(page.getByText('2 cells updated on 2 products.')).toBeVisible()

  // Paste two rows from a spreadsheet at the focused cell.
  await at(1, 2).click()
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'Hat\t\r\nGlove\t\r\n')
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect.poll(() => api.last('record.patchMany')).toEqual({ changes: [
    { id: records[1].id, values: { name: 'Hat', colour: '' } },
    { id: records[2].id, values: { name: 'Glove' } },
  ] })
})

test('a long value keeps its column width, and wrapped text shows its lines', async ({ page, mockTrpc, shot }) => {
  await mockTrpc(recordsApi, { role: 'admin' })
  await page.goto('/admin/data-enrichment/records')
  const story = page.getByRole('grid').locator('[data-cell="0-7"]')
  await story.waitFor()
  expect(Math.round((await story.boundingBox())!.width)).toBeLessThan(400)
  const oneLine = (await story.boundingBox())!.height
  await page.getByRole('button', { name: 'Columns' }).click()
  await page.getByRole('switch', { name: 'Wrap text' }).click()
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await story.boundingBox())!.height).toBeGreaterThan(oneLine * 2)
  await story.scrollIntoViewIfNeeded()
  await shot('range-wrap')
})
