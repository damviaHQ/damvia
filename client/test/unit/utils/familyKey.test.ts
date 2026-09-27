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
import { familyKey } from '@/utils/familyKey'

// The same list is checked against the database function in
// server/test/families.cjs, so both sides group products the same way.
const cases: [string, string | null][] = [
  ['Pampa', 'pampa'],
  [' pampa ', 'pampa'],
  ['PAMPÁ', 'pampa'],
  ['Crème  Brûlée', 'creme brulee'],
  ['ÀÉÎÕÜ', 'aeiou'],
  ['', null],
  ['   ', null],
]

describe('familyKey', () => {
  test('ignores case, accents and stray spaces', () => {
    for (const [input, expected] of cases) {
      expect(familyKey(input), input).toBe(expected)
    }
  })

  test('treats a missing value as no family', () => {
    expect(familyKey(null)).toBeNull()
    expect(familyKey(undefined)).toBeNull()
  })
})
