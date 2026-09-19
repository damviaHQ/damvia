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
import { clearRecentSearches, listRecentSearches, RECENT_SEARCH_MAX_LENGTH, RECENT_SEARCHES_KEY, RECENT_SEARCHES_LIMIT, rememberSearch } from '@/utils/recentSearches.ts'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size },
  }
}

describe('recent searches', () => {
  test('newest first, one entry per query and mode, capped', () => {
    const storage = memoryStorage()
    rememberSearch({ query: ' red hat ', exactMatch: false }, storage)
    rememberSearch({ query: 'blue', exactMatch: false }, storage)
    rememberSearch({ query: 'red hat', exactMatch: false }, storage)
    rememberSearch({ query: 'red hat', exactMatch: true }, storage)
    expect(listRecentSearches(storage)).toEqual([
      { query: 'red hat', exactMatch: true },
      { query: 'red hat', exactMatch: false },
      { query: 'blue', exactMatch: false },
    ])
    for (let i = 0; i < RECENT_SEARCHES_LIMIT + 3; i++) rememberSearch({ query: `q${i}`, exactMatch: false }, storage)
    expect(listRecentSearches(storage)).toHaveLength(RECENT_SEARCHES_LIMIT)
    expect(listRecentSearches(storage)[0]).toEqual({ query: `q${RECENT_SEARCHES_LIMIT + 2}`, exactMatch: false })
  })

  test('blank queries, broken storage and bad JSON are ignored', () => {
    const storage = memoryStorage({ [RECENT_SEARCHES_KEY]: '{not json' })
    expect(listRecentSearches(storage)).toEqual([])
    expect(rememberSearch({ query: '   ', exactMatch: false }, storage)).toEqual([])
    const broken = { ...memoryStorage(), getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as Storage
    expect(rememberSearch({ query: 'a', exactMatch: false }, broken)).toEqual([{ query: 'a', exactMatch: false }])
    expect(listRecentSearches(undefined)).toEqual([])
    clearRecentSearches(storage)
    expect(storage.getItem(RECENT_SEARCHES_KEY)).toBeNull()
  })

  test('seeded entries are normalised: non-boolean modes, long queries and odd shapes', () => {
    const long = 'x'.repeat(RECENT_SEARCH_MAX_LENGTH + 50)
    const storage = memoryStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify([{ query: 'a', exactMatch: {} }, { query: long, exactMatch: 'true' }, { query: 1 }, null, 'b', { query: ' c ', exactMatch: true }]) })
    expect(listRecentSearches(storage)).toEqual([
      { query: 'a', exactMatch: false },
      { query: 'x'.repeat(RECENT_SEARCH_MAX_LENGTH), exactMatch: false },
      { query: 'c', exactMatch: true },
    ])
  })
})
