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
import { readRecordsGridPreferences, RECORDS_GRID_KEY } from '@/composables/useRecordsGridPreferences'

describe('grid preferences', () => {
  const storage = (value: string | null) => ({ getItem: (key: string) => key === RECORDS_GRID_KEY ? value : null })

  test('a stored layout is read back and malformed parts fall back to the defaults', () => {
    const stored = readRecordsGridPreferences(storage(JSON.stringify({ hidden: ['files', 3], order: ['key'], widths: { key: 240, bad: 5000, worse: 'x' }, sort: { column: 'price', direction: 'desc' }, wrap: true })))
    expect(stored).toEqual({ hidden: ['files'], order: ['key'], widths: { key: 240 }, sort: { column: 'price', direction: 'desc' }, wrap: true })
    for (const value of [null, 'not json', '"text"', '[]', JSON.stringify({ sort: { column: 1, direction: 'up' }, wrap: 'yes' })]) {
      expect(readRecordsGridPreferences(storage(value))).toEqual({ hidden: [], order: [], widths: {}, sort: null, wrap: false })
    }
  })

  test('each table keeps its own layout; a table without one starts from the layout saved before tables', () => {
    const saved = JSON.stringify({ hidden: ['files'], order: [], widths: {}, sort: null, wrap: false, tables: { shoes: { hidden: ['filled'], order: [], widths: {}, sort: { column: 'size', direction: 'asc' }, wrap: true } } })
    expect(readRecordsGridPreferences(storage(saved), 'shoes')).toEqual({ hidden: ['filled'], order: [], widths: {}, sort: { column: 'size', direction: 'asc' }, wrap: true })
    expect(readRecordsGridPreferences(storage(saved), 'apparel').hidden).toEqual(['files'])
  })
})
