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
import type { GridPosition } from "@/composables/useGridNavigation"

export type GridRange = { top: number, bottom: number, left: number, right: number }
export type CellWrite = GridPosition & { value: string }

export function rangeOf(anchor: GridPosition, head: GridPosition): GridRange {
  return {
    top: Math.min(anchor.row, head.row),
    bottom: Math.max(anchor.row, head.row),
    left: Math.min(anchor.column, head.column),
    right: Math.max(anchor.column, head.column),
  }
}

export function inRange(range: GridRange, row: number, column: number): boolean {
  return row >= range.top && row <= range.bottom && column >= range.left && column <= range.right
}

export function rangeSize(range: GridRange): { rows: number, columns: number } {
  return { rows: range.bottom - range.top + 1, columns: range.right - range.left + 1 }
}

// Tab-separated rows, as Sheets and Excel put on the clipboard. A cell holding
// a tab, a line break or a quote is quoted, its quotes doubled.
export function toClipboard(block: string[][]): string {
  const cell = (value: string) => /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return block.map((row) => row.map(cell).join("\t")).join("\n")
}

export function parseClipboard(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const source = text.replace(/\r\n?/g, "\n").replace(/\n$/, "")
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === "") quoted = true
    else if (char === "\t") { row.push(cell); cell = "" }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = "" }
    else cell += char
  }
  row.push(cell)
  rows.push(row)
  return rows
}

// Where a copied block lands. One value fills the whole range; a block the
// range holds a whole number of times is repeated across it; otherwise the
// block is laid from the range's top-left cell and cut at the grid's edge.
export function pastePlan(block: string[][], range: GridRange, shape: { rows: number, columns: number }): CellWrite[] {
  const height = block.length
  const width = Math.max(...block.map((row) => row.length))
  const size = rangeSize(range)
  const tiles = size.rows % height === 0 && size.columns % width === 0
  const rows = height === 1 && width === 1 || tiles ? size.rows : height
  const columns = height === 1 && width === 1 || tiles ? size.columns : width
  const writes: CellWrite[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const row = range.top + r
      const column = range.left + c
      if (row >= shape.rows || column >= shape.columns) continue
      writes.push({ row, column, value: block[r % height][c % width] ?? "" })
    }
  }
  return writes
}

// Dragging the fill handle from a range to a row repeats the range's rows,
// in order, over the rows it is stretched across, up or down.
export function fillPlan(range: GridRange, toRow: number, valueAt: (position: GridPosition) => string): { writes: CellWrite[], range: GridRange } {
  const height = range.bottom - range.top + 1
  const rows = toRow > range.bottom ? { from: range.bottom + 1, to: toRow } : toRow < range.top ? { from: toRow, to: range.top - 1 } : null
  if (!rows) return { writes: [], range }
  const writes: CellWrite[] = []
  for (let row = rows.from; row <= rows.to; row++) {
    const source = range.top + (((row - range.top) % height) + height) % height
    for (let column = range.left; column <= range.right; column++) writes.push({ row, column, value: valueAt({ row: source, column }) })
  }
  return { writes, range: { ...range, top: Math.min(range.top, rows.from), bottom: Math.max(range.bottom, rows.to) } }
}

// Ctrl/Cmd+D: the first row of the range is copied into the rows under it.
export function fillDownPlan(range: GridRange, valueAt: (position: GridPosition) => string): CellWrite[] {
  const writes: CellWrite[] = []
  for (let row = range.top + 1; row <= range.bottom; row++) {
    for (let column = range.left; column <= range.right; column++) writes.push({ row, column, value: valueAt({ row: range.top, column }) })
  }
  return writes
}
