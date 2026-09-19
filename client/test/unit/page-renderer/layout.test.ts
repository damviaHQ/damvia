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
import { insertAt, moveItem, spanClass } from '@/components/page-renderer/layout'

describe('page layout', () => {
  test('a block spans the grid according to its size', () => {
    expect(spanClass('full')).toBe('md:col-span-6')
    expect(spanClass('half')).toBe('md:col-span-3')
    expect(spanClass('third')).toBe('md:col-span-2')
    // A row of six columns is what makes halves and thirds share a line.
    expect(spanClass('nonsense' as any)).toBe('md:col-span-6')
  })

  test('moving a block keeps every other block in order', () => {
    const blocks = ['a', 'b', 'c', 'd']
    expect(moveItem(blocks, 2, 0)).toEqual(['c', 'a', 'b', 'd'])
    expect(moveItem(blocks, 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(blocks).toEqual(['a', 'b', 'c', 'd'])
  })

  test('a move that leaves the page changes nothing', () => {
    const blocks = ['a', 'b']
    expect(moveItem(blocks, 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(blocks, 1, 5)).toEqual(['a', 'b'])
    expect(moveItem(blocks, 1, 1)).toEqual(['a', 'b'])
  })

  test('inserting clamps to the ends of the page', () => {
    expect(insertAt(['a', 'b'], 1, 'x')).toEqual(['a', 'x', 'b'])
    expect(insertAt(['a', 'b'], 99, 'x')).toEqual(['a', 'b', 'x'])
    expect(insertAt(['a', 'b'], -3, 'x')).toEqual(['x', 'a', 'b'])
  })
})
