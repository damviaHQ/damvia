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
import { moveForKey, moveInGrid, startsTyping } from '@/composables/useGridNavigation'
import { readRecordsGridPreferences, RECORDS_GRID_KEY } from '@/composables/useRecordsGridPreferences'

// Columns 0 and 1 are the picture and the key; fields start at 2.
const shape = { rows: 3, columns: 5, editable: (column: number) => column >= 2 }

describe('grid navigation', () => {
  test('arrows move one cell and stop at the edges', () => {
    expect(moveInGrid({ row: 0, column: 0 }, 'up', shape)).toEqual({ row: 0, column: 0 })
    expect(moveInGrid({ row: 0, column: 0 }, 'down', shape)).toEqual({ row: 1, column: 0 })
    expect(moveInGrid({ row: 2, column: 4 }, 'down', shape)).toEqual({ row: 2, column: 4 })
    expect(moveInGrid({ row: 1, column: 4 }, 'right', shape)).toEqual({ row: 1, column: 4 })
    expect(moveInGrid({ row: 1, column: 3 }, 'home', shape)).toEqual({ row: 1, column: 0 })
    expect(moveInGrid({ row: 1, column: 0 }, 'end', shape)).toEqual({ row: 1, column: 4 })
  })

  test('Tab steps over read-only columns and wraps rows; at the last cell it stays for the page to take focus', () => {
    expect(moveInGrid({ row: 0, column: 1 }, 'next', shape)).toEqual({ row: 0, column: 2 })
    expect(moveInGrid({ row: 0, column: 4 }, 'next', shape)).toEqual({ row: 1, column: 2 })
    expect(moveInGrid({ row: 1, column: 2 }, 'previous', shape)).toEqual({ row: 0, column: 4 })
    expect(moveInGrid({ row: 2, column: 4 }, 'next', shape)).toEqual({ row: 2, column: 4 })
    expect(moveInGrid({ row: 0, column: 2 }, 'previous', shape)).toEqual({ row: 0, column: 2 })
  })

  test('keys map to moves, and a printable key starts typing', () => {
    expect(moveForKey({ key: 'Tab', shiftKey: true })).toBe('previous')
    expect(moveForKey({ key: 'ArrowDown', shiftKey: false })).toBe('down')
    expect(moveForKey({ key: 'Enter', shiftKey: false })).toBeNull()
    expect(startsTyping({ key: 'a', ctrlKey: false, metaKey: false, altKey: false })).toBe(true)
    expect(startsTyping({ key: 'c', ctrlKey: true, metaKey: false, altKey: false })).toBe(false)
    expect(startsTyping({ key: 'Enter', ctrlKey: false, metaKey: false, altKey: false })).toBe(false)
  })
})

describe('grid preferences', () => {
  const storage = (value: string | null) => ({ getItem: (key: string) => key === RECORDS_GRID_KEY ? value : null })

  test('a stored layout is read back and malformed parts fall back to the defaults', () => {
    const stored = readRecordsGridPreferences(storage(JSON.stringify({ hidden: ['files', 3], order: ['key'], widths: { key: 240, bad: 5000, worse: 'x' }, sort: { column: 'price', direction: 'desc' }, pageSize: 200, wrap: true })))
    expect(stored).toEqual({ hidden: ['files'], order: ['key'], widths: { key: 240 }, sort: { column: 'price', direction: 'desc' }, pageSize: 200, wrap: true })
    for (const value of [null, 'not json', '"text"', '[]', JSON.stringify({ sort: { column: 1, direction: 'up' }, pageSize: 7, wrap: 'yes' })]) {
      expect(readRecordsGridPreferences(storage(value))).toEqual({ hidden: [], order: [], widths: {}, sort: null, pageSize: 100, wrap: false })
    }
  })
})
