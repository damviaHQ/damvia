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
import { ref, watch } from "vue"

export type RecordsGridPreferences = {
  hidden: string[]
  order: string[]
  widths: Record<string, number>
  sort: { column: string, direction: 'asc' | 'desc' } | null
  pageSize: number
  wrap: boolean
}

export const RECORDS_GRID_KEY = 'damvia_records_grid'
export const PAGE_SIZES = [50, 100, 200, 500]
const DEFAULTS: RecordsGridPreferences = { hidden: [], order: [], widths: {}, sort: null, pageSize: 100, wrap: false }

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

// The layout of the grid follows the admin in this browser only.
export function readRecordsGridPreferences(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): RecordsGridPreferences {
  try {
    const parsed = JSON.parse(storage?.getItem(RECORDS_GRID_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULTS)
    const widths = Object.fromEntries(Object.entries(parsed.widths ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 60 && entry[1] <= 800))
    const sort = parsed.sort && typeof parsed.sort.column === 'string' && ['asc', 'desc'].includes(parsed.sort.direction) ? { column: parsed.sort.column, direction: parsed.sort.direction } : null
    return {
      hidden: strings(parsed.hidden),
      order: strings(parsed.order),
      widths,
      sort,
      pageSize: PAGE_SIZES.includes(parsed.pageSize) ? parsed.pageSize : DEFAULTS.pageSize,
      wrap: parsed.wrap === true,
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export function useRecordsGridPreferences() {
  const preferences = ref(readRecordsGridPreferences())
  watch(preferences, (value) => {
    try {
      localStorage.setItem(RECORDS_GRID_KEY, JSON.stringify(value))
    } catch {
      // Private browsing: the layout lasts for the visit.
    }
  }, { deep: true })
  return preferences
}
