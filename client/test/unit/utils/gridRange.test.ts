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
import { fillDownPlan, fillPlan, parseClipboard, pastePlan, rangeOf, toClipboard } from '@/utils/gridRange'

const grid = [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]
const valueAt = ({ row, column }: { row: number, column: number }) => grid[row][column]

describe('grid ranges', () => {
  test('a range spans its two corners in any order', () => {
    expect(rangeOf({ row: 3, column: 1 }, { row: 1, column: 0 })).toEqual({ top: 1, bottom: 3, left: 0, right: 1 })
  })

  test('the clipboard round-trips tabs, line breaks and quotes the way Sheets writes them', () => {
    const block = [['plain', 'a\ttab'], ['two\nlines', 'say "hi"']]
    expect(parseClipboard(toClipboard(block))).toEqual(block)
    expect(parseClipboard('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']])
  })

  test('one value fills the range, a fitting block repeats, any other block is cut at the edge', () => {
    const shape = { rows: 4, columns: 3 }
    expect(pastePlan([['x']], rangeOf({ row: 0, column: 0 }, { row: 1, column: 1 }), shape).map(w => w.value)).toEqual(['x', 'x', 'x', 'x'])
    expect(pastePlan([['1'], ['2']], rangeOf({ row: 0, column: 0 }, { row: 3, column: 0 }), shape).map(w => w.value)).toEqual(['1', '2', '1', '2'])
    expect(pastePlan([['1', '2'], ['3', '4']], rangeOf({ row: 3, column: 2 }, { row: 3, column: 2 }), shape)).toEqual([{ row: 3, column: 2, value: '1' }])
  })

  test('filling repeats the rows of the range down or up, and Ctrl+D copies the first row down', () => {
    const range = rangeOf({ row: 1, column: 0 }, { row: 2, column: 0 })
    expect(fillPlan(range, 3, valueAt)).toEqual({ writes: [{ row: 3, column: 0, value: 'c' }], range: { top: 1, bottom: 3, left: 0, right: 0 } })
    expect(fillPlan(range, 0, valueAt).writes).toEqual([{ row: 0, column: 0, value: 'e' }])
    expect(fillPlan(range, 2, valueAt).writes).toEqual([])
    expect(fillDownPlan(rangeOf({ row: 0, column: 0 }, { row: 2, column: 1 }), valueAt).map(w => w.value)).toEqual(['a', 'b', 'a', 'b'])
  })
})
