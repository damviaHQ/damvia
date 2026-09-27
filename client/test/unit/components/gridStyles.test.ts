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
import { MASONRY_GAP, masonryColumns, masonryGridStyle, masonryTile } from '@/components/collection/gridStyles'

describe('masonry grid', () => {
  test('as many columns of the smallest width fit, and they share what is left', () => {
    expect(masonryColumns(1000, 280)).toEqual({ count: 3, width: (1000 - 2 * MASONRY_GAP) / 3 })
    // Exactly two columns and their gap.
    expect(masonryColumns(2 * 280 + MASONRY_GAP, 280)).toEqual({ count: 2, width: 280 })
    // One pixel short of that, one column takes the whole width.
    expect(masonryColumns(2 * 280 + MASONRY_GAP - 1, 280)).toEqual({ count: 1, width: 2 * 280 + MASONRY_GAP - 1 })
    // Never fewer than one column, even narrower than the minimum.
    expect(masonryColumns(100, 280)).toEqual({ count: 1, width: 100 })
  })

  test('a tile keeps the shape of its picture and spans the rows it needs', () => {
    const portrait = masonryTile({ width: 600, height: 900 }, 200)
    expect(portrait.height).toBe(300)
    const landscape = masonryTile({ width: 800, height: 600 }, 200)
    expect(landscape.height).toBe(150)
    // The span covers the tile and one gap, in whole rows.
    for (const tile of [portrait, landscape]) {
      const row = masonryGridStyle(1).gridAutoRows
      const rowHeight = Number.parseInt(row, 10)
      expect(tile.span * rowHeight).toBeGreaterThanOrEqual(tile.height + MASONRY_GAP)
      expect((tile.span - 1) * rowHeight).toBeLessThan(tile.height + MASONRY_GAP)
    }
  })

  test('a measured ratio wins, a missing size falls back, and extreme shapes are bounded', () => {
    expect(masonryTile({ width: 800, height: 600 }, 200, 2).height).toBe(400)
    expect(masonryTile(null, 200).height).toBe(150)
    expect(masonryTile({ width: 0, height: 600 }, 200).height).toBe(150)
    // A banner or a column would otherwise be a sliver or a tower.
    expect(masonryTile({ width: 10000, height: 10 }, 200).height).toBe(30)
    expect(masonryTile({ width: 10, height: 10000 }, 200).height).toBe(800)
  })

  test('the grid uses the same gap across and a fine row down', () => {
    expect(masonryGridStyle(4)).toEqual({
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      columnGap: `${MASONRY_GAP}px`,
      rowGap: '0px',
      gridAutoRows: '4px',
    })
  })
})
