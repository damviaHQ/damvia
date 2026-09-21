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
export type GridPosition = { row: number, column: number }
export type GridShape = { rows: number, columns: number, editable: (column: number) => boolean }
export type GridMove = 'up' | 'down' | 'left' | 'right' | 'next' | 'previous' | 'home' | 'end'

// Where the focus goes from a cell. Tab and Shift+Tab step over read-only
// columns and wrap to the next or previous row; arrows stop at the edges.
export function moveInGrid(position: GridPosition, move: GridMove, shape: GridShape): GridPosition {
  const { row, column } = position
  const lastRow = Math.max(0, shape.rows - 1)
  const lastColumn = Math.max(0, shape.columns - 1)
  switch (move) {
    case 'up': return { row: Math.max(0, row - 1), column }
    case 'down': return { row: Math.min(lastRow, row + 1), column }
    case 'left': return { row, column: Math.max(0, column - 1) }
    case 'right': return { row, column: Math.min(lastColumn, column + 1) }
    case 'home': return { row, column: 0 }
    case 'end': return { row, column: lastColumn }
    case 'next':
    case 'previous': {
      const step = move === 'next' ? 1 : -1
      let r = row
      let c = column
      for (let guard = 0; guard < shape.rows * shape.columns; guard++) {
        c += step
        if (c > lastColumn) { c = 0; r += 1 }
        if (c < 0) { c = lastColumn; r -= 1 }
        if (r < 0 || r > lastRow) return position
        if (shape.editable(c)) return { row: r, column: c }
      }
      return position
    }
  }
}

// The move a key asks for while a cell is focused, not edited.
export function moveForKey(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): GridMove | null {
  switch (event.key) {
    case 'ArrowUp': return 'up'
    case 'ArrowDown': return 'down'
    case 'ArrowLeft': return 'left'
    case 'ArrowRight': return 'right'
    case 'Home': return 'home'
    case 'End': return 'end'
    case 'Tab': return event.shiftKey ? 'previous' : 'next'
    default: return null
  }
}

// A printable key starts editing and replaces the value, as in a spreadsheet.
export function startsTyping(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}
