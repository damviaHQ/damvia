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
import type { BlockSize } from "server/src/page-blocks/schema"

// Blocks are an ordered list, not a grid: each one takes the full width, a half
// or a third of a six column grid, and the browser packs them into lines.
const SPANS: Record<BlockSize, string> = {
  full: "md:col-span-6",
  half: "md:col-span-3",
  third: "md:col-span-2",
}

export const SIZE_LABELS: Record<BlockSize, string> = {
  full: "Full width",
  half: "Half width",
  third: "Third width",
}

export function spanClass(size: BlockSize): string {
  return SPANS[size] ?? SPANS.full
}

export const COLUMNS = 6
const SPAN_UNITS: Record<BlockSize, number> = { full: 6, half: 3, third: 2 }

export function spanUnits(size: BlockSize): number {
  return SPAN_UNITS[size] ?? COLUMNS
}

// Blocks flow like text: a line fills up to six columns, and a block that no
// longer fits starts the next one.
export function columnsLeftBefore(sizes: BlockSize[], index: number): number {
  let used = 0
  for (const size of sizes.slice(0, index)) {
    const span = spanUnits(size)
    used = used + span > COLUMNS ? span : used + span
    // A line that is exactly full is closed: the next block starts a new one.
    if (used === COLUMNS) {
      used = 0
    }
  }
  return COLUMNS - used
}

// A block dropped beside a narrower one takes the room that is left, so
// dragging something next to a half-width block does not push it onto its own
// line. A block dropped at the start of a fresh line keeps its own width.
export function fitToLine(sizes: BlockSize[], index: number, current: BlockSize): BlockSize {
  const left = columnsLeftBefore(sizes, index)
  if (left >= COLUMNS || left <= 0) {
    return current
  }
  if (spanUnits(current) <= left) {
    return current
  }
  return left >= 3 ? 'half' : 'third'
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return next
  }
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function insertAt<T>(items: T[], index: number, item: T): T[] {
  const next = [...items]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
  return next
}
