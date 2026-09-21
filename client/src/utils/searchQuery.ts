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
import type { LocationQuery, LocationQueryValue } from 'vue-router'

const attributeKey = /^attributes\[(.+)]$/
const metadataKey = /^metadata\[(.+)]$/
const metadataRangeKey = /^metadata_(from|to)\[(.+)]$/

export const SEARCH_SORTS = ['relevance', 'name', 'newest'] as const
export type SearchSort = typeof SEARCH_SORTS[number]

export const SEARCH_SCOPES = ['all', 'current', 'current_with_sub'] as const
export type SearchScope = typeof SEARCH_SCOPES[number]

export function toSearchScope(value: unknown): SearchScope | undefined {
  return SEARCH_SCOPES.find((scope) => scope === value)
}

export const FILE_TYPE_OPTIONS = [
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'document', label: 'Documents' },
] as const

// Filter keys that "Clear all filters" resets; the terms, scope and mode stay.
export const FILTER_KEYS = ['asset_types', 'record_views', 'file_types', 'extensions', 'size_min', 'size_max'] as const

export const BYTES_PER_MB = 1024 * 1024

// Sizes travel through the URL in megabytes, because that is what the user typed.
export function megabytesToBytes(value: string | number | null | undefined): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * BYTES_PER_MB) : undefined
}

export function bytesToMegabytes(value: number | undefined): string {
  return value === undefined ? '' : String(Number((value / BYTES_PER_MB).toFixed(2)))
}

export function formatSizeRange(minSize: number | undefined, maxSize: number | undefined): string {
  const from = bytesToMegabytes(minSize)
  const to = bytesToMegabytes(maxSize)
  if (from && to) return `${from} to ${to} MB`
  if (from) return `Over ${from} MB`
  if (to) return `Under ${to} MB`
  return 'Any size'
}

export function queryValueToArray(query: LocationQueryValue | LocationQueryValue[] | undefined): string[] {
  if (!query) {
    return []
  } else if (!Array.isArray(query)) {
    return [query]
  }
  return query.filter((value): value is string => typeof value === 'string')
}

// A scalar param repeated in the URL keeps its first value.
export function queryValueToString(query: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  return queryValueToArray(query)[0]
}

function queryValueToPage(query: LocationQueryValue | LocationQueryValue[] | undefined): number | undefined {
  const page = parseInt(queryValueToString(query) ?? '', 10)
  return page > 0 ? page : undefined
}

// Splits pasted or typed references on any whitespace or comma.
export function parseQueryParts(query: string | null | undefined): string[] {
  return (query ?? '')
    .replace(/[\s,]+/g, ' ')
    .trim()
    .split(' ')
    .filter((part) => part)
}

export function parseSearchQuery(query: LocationQuery, defaultSearchScope: SearchScope) {
  const attributes = Object.fromEntries(
    Object.entries(query)
      .map(([key, value]) => {
        const match = attributeKey.exec(key)
        return match ? [match[1], queryValueToArray(value)] : null
      })
      .filter((value): value is [string, string[]] => value !== null)
  )
  // Text fields list their values; date fields carry a from/to range, days in the URL.
  const metadata: Record<string, string[] | { from?: string, to?: string }> = {}
  for (const [key, value] of Object.entries(query)) {
    const values = attributeKey.test(key) ? null : metadataKey.exec(key)
    if (values) metadata[values[1]] = queryValueToArray(value)
    const range = metadataRangeKey.exec(key)
    const day = queryValueToString(value)
    if (range && day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const current = metadata[range[2]]
      metadata[range[2]] = { ...(Array.isArray(current) ? {} : current), [range[1]]: day }
    }
  }
  const sort = SEARCH_SORTS.find((value) => value === query.sort)

  return {
    query: queryValueToString(query.q),
    page: queryValueToPage(query.page),
    collectionId: queryValueToString(query.from_collection),
    assetTypes: queryValueToArray(query.asset_types),
    recordViews: queryValueToArray(query.record_views),
    fileTypes: queryValueToArray(query.file_types),
    extensions: queryValueToArray(query.extensions),
    minSize: megabytesToBytes(query.size_min as string | undefined),
    maxSize: megabytesToBytes(query.size_max as string | undefined),
    searchScope: toSearchScope(queryValueToString(query.search_scope)) ?? defaultSearchScope,
    exactMatch: query.exact_match === "true",
    attributes,
    metadata,
    sort,
  }
}

export type SearchForm = ReturnType<typeof parseSearchQuery>

export type QueryPatch = Record<string, LocationQueryValue | LocationQueryValue[] | undefined>

// Merges a change into the current route query. Empty values drop the key and any change resets the page.
export function patchSearchQuery(query: LocationQuery, patch: QueryPatch): LocationQuery {
  const next: LocationQuery = { ...query }
  delete next.page
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
    } else {
      next[key] = value
    }
  }
  return next
}

export function toggleQueryValue(query: LocationQuery, key: string, value: string): LocationQuery {
  const current = queryValueToArray(query[key])
  const values = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
  return patchSearchQuery(query, { [key]: values })
}

export function clearFilterQuery(query: LocationQuery): LocationQuery {
  const patch: QueryPatch = {}
  for (const key of Object.keys(query)) {
    if ((FILTER_KEYS as readonly string[]).includes(key) || attributeKey.test(key) || metadataKey.test(key) || metadataRangeKey.test(key)) {
      patch[key] = undefined
    }
  }
  return patchSearchQuery(query, patch)
}

export type ActiveFilter = { key: string, value: string, group: 'asset_types' | 'record_views' | 'file_types' | 'extensions' | 'size' | 'attribute' | 'metadata' | 'metadata_range', attributeId?: string }

export function formatDateRange(range: { from?: string, to?: string }): string {
  if (range.from && range.to) return `${range.from} to ${range.to}`
  return range.from ? `From ${range.from}` : `Until ${range.to}`
}

export function activeFilters(form: SearchForm): ActiveFilter[] {
  return [
    ...form.assetTypes.map((value) => ({ key: 'asset_types', value, group: 'asset_types' as const })),
    ...form.recordViews.map((value) => ({ key: 'record_views', value, group: 'record_views' as const })),
    ...form.fileTypes.map((value) => ({ key: 'file_types', value, group: 'file_types' as const })),
    ...form.extensions.map((value) => ({ key: 'extensions', value, group: 'extensions' as const })),
    ...(form.minSize !== undefined || form.maxSize !== undefined
      ? [{ key: 'size', value: formatSizeRange(form.minSize, form.maxSize), group: 'size' as const }]
      : []),
    ...Object.entries(form.attributes).flatMap(([attributeId, values]) =>
      values.map((value) => ({ key: `attributes[${attributeId}]`, value, group: 'attribute' as const, attributeId }))
    ),
    ...Object.entries(form.metadata).flatMap(([fieldId, value]): ActiveFilter[] => Array.isArray(value)
      ? value.map((entry) => ({ key: `metadata[${fieldId}]`, value: entry, group: 'metadata' as const, attributeId: fieldId }))
      : [{ key: `metadata_range[${fieldId}]`, value: formatDateRange(value), group: 'metadata_range' as const, attributeId: fieldId }]
    ),
  ]
}
