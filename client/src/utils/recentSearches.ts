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
export const RECENT_SEARCHES_KEY = 'damvia.recentSearches'
export const RECENT_SEARCHES_LIMIT = 8

export type RecentSearch = { query: string, exactMatch: boolean }

function read(storage: Storage | undefined): RecentSearch[] {
  try {
    const raw = storage?.getItem(RECENT_SEARCHES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is RecentSearch => typeof entry?.query === 'string' && entry.query.trim() !== '')
      : []
  } catch (_) {
    return []
  }
}

function write(storage: Storage | undefined, entries: RecentSearch[]) {
  try {
    storage?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries))
  } catch (_) { /* storage unavailable */ }
}

function storageOrNone(): Storage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined
}

export function listRecentSearches(storage = storageOrNone()): RecentSearch[] {
  return read(storage)
}

// Newest first, one entry per query and mode, capped to the limit.
export function rememberSearch(entry: RecentSearch, storage = storageOrNone()): RecentSearch[] {
  const query = entry.query.trim()
  if (!query) {
    return read(storage)
  }
  const next = [
    { query, exactMatch: !!entry.exactMatch },
    ...read(storage).filter((existing) => !(existing.query === query && existing.exactMatch === !!entry.exactMatch)),
  ].slice(0, RECENT_SEARCHES_LIMIT)
  write(storage, next)
  return next
}

export function clearRecentSearches(storage = storageOrNone()) {
  try {
    storage?.removeItem(RECENT_SEARCHES_KEY)
  } catch (_) { /* storage unavailable */ }
}
