import { expect, test } from '@playwright/test'
import { fixture } from './records-fixtures'

// A focus outline cut by a scrolling or clipping container hides where the
// keyboard is. Each control of the records screen is focused in turn and its
// outline must fit inside every such container around it.
const AUDIT = `(() => {
  const out = []
  const focusables = [...document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"]), [role=gridcell], [data-cell]')]
    .filter((el) => el.getClientRects().length && !el.closest('[aria-hidden=true]'))
  for (const el of focusables) {
    el.focus()
    if (document.activeElement !== el) continue
    const style = getComputedStyle(el)
    let extent = 0
    if (style.outlineStyle !== 'none') extent = Math.max(extent, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset))
    if (style.boxShadow && style.boxShadow !== 'none') for (const m of style.boxShadow.matchAll(/(-?[\\d.]+)px (-?[\\d.]+)px (-?[\\d.]+)px (-?[\\d.]+)px/g)) extent = Math.max(extent, parseFloat(m[4]))
    if (extent <= 0) continue
    const r = el.getBoundingClientRect()
    const ring = { l: r.left - extent, t: r.top - extent, r: r.right + extent, b: r.bottom + extent }
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const c = a.getBoundingClientRect()
      const box = { l: c.left + a.clientLeft, t: c.top + a.clientTop, r: c.left + a.clientLeft + a.clientWidth, b: c.top + a.clientTop + a.clientHeight }
      const cut = []
      if (ring.l < box.l - 0.5) cut.push('left'); if (ring.t < box.t - 0.5) cut.push('top'); if (ring.r > box.r + 0.5) cut.push('right'); if (ring.b > box.b + 0.5) cut.push('bottom')
      if (cut.length) { out.push((el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.tagName) + ' [' + (el.className.baseVal ?? el.className).toString().split(' ').slice(0,2).join('.') + '] cut ' + cut.join('/') + ' by ' + a.tagName + '.' + a.className.toString().split(' ').slice(0, 3).join('.')); break }
    }
  }
  return [...new Set(out)]
})()`

test('no focus outline of the records screen is cut by its container', async ({ page }) => {
  await fixture(page)
  await page.goto('/admin/data-enrichment/records')
  await page.locator('[data-cell="0-1"]').waitFor()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(AUDIT), 'page').toEqual([])
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('button', { name: 'Add filter' }).click()
  expect(await page.evaluate(AUDIT), 'filters').toEqual([])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Columns' }).click()
  expect(await page.evaluate(AUDIT), 'columns').toEqual([])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open WX5678-100' }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).waitFor()
  expect(await page.evaluate(AUDIT), 'card').toEqual([])
  // Focusing a tab selects it, so come back to the fields.
  await page.getByRole('tab', { name: 'Fields' }).click()
  await page.getByRole('button', { name: 'Edit the field Colour' }).click()
  await page.getByRole('dialog', { name: /Edit Colour/ }).waitFor()
  expect(await page.evaluate(AUDIT), 'field dialog').toEqual([])
})
