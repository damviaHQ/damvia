import { expect, test } from '@playwright/test'
import { fixture, records } from './records-fixtures'

const shot = (name: string) => process.env.RECORDS_SHOTS ? `${process.env.RECORDS_SHOTS}/${name}.png` : undefined

test('cells are selected as a range, filled from the handle and pasted as a block', async ({ page }) => {
  const { errors, calls } = await fixture(page)
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
  await page.screenshot({ path: shot('range-select') })

  // Drag the fill handle of one cell down two rows.
  await at(0, 2).click()
  const handle = at(0, 2).locator('.records-grid-fill-handle')
  const box = await handle.boundingBox()
  const target = await at(2, 2).boundingBox()
  await page.mouse.move(box!.x + 4, box!.y + 4)
  await page.mouse.down()
  await page.mouse.move(target!.x + 20, target!.y + 10, { steps: 6 })
  await page.screenshot({ path: shot('range-fill') })
  await page.mouse.up()
  await expect.poll(() => calls.find(call => call.name === 'record.patchMany')?.input).toEqual({ changes: [
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
  await expect.poll(() => calls.filter(call => call.name === 'record.patchMany').at(-1)?.input).toEqual({ changes: [
    { id: records[1].id, values: { name: 'Hat', colour: '' } },
    { id: records[2].id, values: { name: 'Glove' } },
  ] })
  expect(errors).toEqual([])
})

test('a long value keeps its column width, and wrapped text shows its lines', async ({ page }) => {
  await fixture(page)
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
  await page.screenshot({ path: shot('range-wrap') })
})
