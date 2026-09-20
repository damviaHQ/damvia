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
import { columnsLeftBefore, fitToLine, insertAt, moveItem, spanClass } from '@/components/page-renderer/layout'

describe('page layout', () => {
  // No breakpoint: blocks an author put side by side stay side by side, and
  // the content inside each block wraps to the block instead.
  test('a block spans the grid according to its size, at every width', () => {
    expect(spanClass('full')).toBe('col-span-6')
    expect(spanClass('half')).toBe('col-span-3')
    expect(spanClass('third')).toBe('col-span-2')
    // A row of six columns is what makes halves and thirds share a line.
    expect(spanClass('nonsense' as any)).toBe('col-span-6')
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

  test('a line fills to six columns before the next one starts', () => {
    expect(columnsLeftBefore(['full'], 1)).toBe(6)
    expect(columnsLeftBefore(['half'], 1)).toBe(3)
    expect(columnsLeftBefore(['third'], 1)).toBe(4)
    expect(columnsLeftBefore(['third', 'third'], 2)).toBe(2)
    expect(columnsLeftBefore(['half', 'half'], 2)).toBe(6)
    // A block too wide for the room left takes a line of its own, and fills
    // it, so whatever follows starts on a fresh line.
    expect(columnsLeftBefore(['half', 'full'], 2)).toBe(6)
    expect(columnsLeftBefore(['third', 'third', 'third'], 3)).toBe(6)
  })

  test('a block dropped beside a narrower one takes the room that is left', () => {
    expect(fitToLine(['half', 'full'], 1, 'full')).toBe('half')
    expect(fitToLine(['third', 'full'], 1, 'full')).toBe('half')
    expect(fitToLine(['third', 'third', 'full'], 2, 'full')).toBe('third')
    // A block that already fits, or that starts a fresh line, keeps its width.
    expect(fitToLine(['half', 'third'], 1, 'third')).toBe('third')
    expect(fitToLine(['full', 'full'], 1, 'full')).toBe('full')
    expect(fitToLine(['full'], 0, 'full')).toBe('full')
  })

  test('inserting clamps to the ends of the page', () => {
    expect(insertAt(['a', 'b'], 1, 'x')).toEqual(['a', 'x', 'b'])
    expect(insertAt(['a', 'b'], 99, 'x')).toEqual(['a', 'b', 'x'])
    expect(insertAt(['a', 'b'], -3, 'x')).toEqual(['x', 'a', 'b'])
  })
})
