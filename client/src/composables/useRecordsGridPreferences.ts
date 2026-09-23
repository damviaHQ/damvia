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
import { ref, watch, type Ref } from "vue"

export type RecordsGridPreferences = {
  hidden: string[]
  order: string[]
  widths: Record<string, number>
  sort: { column: string, direction: 'asc' | 'desc' } | null
  wrap: boolean
}

export const RECORDS_GRID_KEY = 'damvia_records_grid'
const DEFAULTS: RecordsGridPreferences = { hidden: [], order: [], widths: {}, sort: null, wrap: false }

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function parseLayout(parsed: unknown): RecordsGridPreferences {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return structuredClone(DEFAULTS)
  const value = parsed as Record<string, any>
  const widths = Object.fromEntries(Object.entries(value.widths ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 60 && entry[1] <= 800))
  const sort = value.sort && typeof value.sort.column === 'string' && ['asc', 'desc'].includes(value.sort.direction) ? { column: value.sort.column, direction: value.sort.direction } : null
  return { hidden: strings(value.hidden), order: strings(value.order), widths, sort, wrap: value.wrap === true }
}

function readStore(storage: Pick<Storage, 'getItem'> | undefined): Record<string, any> {
  try {
    const parsed = JSON.parse(storage?.getItem(RECORDS_GRID_KEY) ?? 'null')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// The layout of each table follows the admin in this browser only. A table
// without its own layout starts from the one saved before tables existed.
export function readRecordsGridPreferences(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage, tableId: string | null = null): RecordsGridPreferences {
  const store = readStore(storage)
  const own = tableId && store.tables && typeof store.tables === 'object' ? store.tables[tableId] : undefined
  return parseLayout(own ?? store)
}

export function useRecordsGridPreferences(tableId: Ref<string | null>) {
  const storage = () => { try { return globalThis.localStorage } catch { return undefined } }
  const preferences = ref(readRecordsGridPreferences(storage(), tableId.value))
  let loading = false
  watch(tableId, (id) => {
    loading = true
    preferences.value = readRecordsGridPreferences(storage(), id)
  })
  watch(preferences, (value) => {
    if (loading) { loading = false; return }
    if (!tableId.value) return
    try {
      const store = readStore(storage())
      const tables = store.tables && typeof store.tables === 'object' ? store.tables : {}
      localStorage.setItem(RECORDS_GRID_KEY, JSON.stringify({ ...store, tables: { ...tables, [tableId.value]: value } }))
    } catch {
      // Private browsing: the layout lasts for the visit.
    }
  }, { deep: true })
  return preferences
}
