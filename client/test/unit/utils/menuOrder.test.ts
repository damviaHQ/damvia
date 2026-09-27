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
import { byName, byPosition } from '@/utils/menuOrder'

describe('menu order', () => {
  test('menu entries follow the position an admin arranged, not the API order', () => {
    const items = [{ id: 'c', position: 2 }, { id: 'a', position: 0 }, { id: 'b', position: 1 }]
    expect(byPosition(items).map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(items.map(item => item.id)).toEqual(['c', 'a', 'b'])
    expect(byPosition(undefined)).toEqual([])
  })

  test('collection trees without a menu are alphabetical', () => {
    expect(byName([{ name: 'Social' }, { name: 'Brand' }]).map(item => item.name)).toEqual(['Brand', 'Social'])
  })
})
