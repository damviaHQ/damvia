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
import { describe, expect, test } from 'vitest'
import { collapseBreadcrumb } from '@/utils/breadcrumb.ts'

const items = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `c${index}`, label: `Level ${index}` }))

describe('collapseBreadcrumb', () => {
  test('short paths are shown in full', () => {
    expect(collapseBreadcrumb(items(3))).toEqual({ visibleItems: items(3), hiddenItems: [] })
    expect(collapseBreadcrumb([])).toEqual({ visibleItems: [], hiddenItems: [] })
  })

  test('long paths keep the head and the tail around one ellipsis', () => {
    const { visibleItems, hiddenItems } = collapseBreadcrumb(items(6))
    expect(visibleItems.map(item => item.label)).toEqual(['Level 0', '…', 'Level 4', 'Level 5'])
    expect(visibleItems[1]).toMatchObject({ isEllipsis: true })
    expect(hiddenItems.map(item => item.label)).toEqual(['Level 1', 'Level 2', 'Level 3'])
  })

  test('head and tail sizes are configurable and never drop below one', () => {
    expect(collapseBreadcrumb(items(6), 2, 1).visibleItems.map(item => item.label)).toEqual(['Level 0', 'Level 1', '…', 'Level 5'])
    expect(collapseBreadcrumb(items(6), 0, 0).visibleItems.map(item => item.label)).toEqual(['Level 0', '…', 'Level 5'])
    expect(collapseBreadcrumb(items(2), 0, 0).hiddenItems).toEqual([])
  })
})
