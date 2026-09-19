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

export const SEARCH_SORTS = ['relevance', 'name', 'newest'] as const
export type SearchSort = typeof SEARCH_SORTS[number]

export const FILE_TYPE_OPTIONS = [
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'document', label: 'Documents' },
] as const

// Filter keys that "Clear all filters" resets; the terms, scope and mode stay.
export const FILTER_KEYS = ['asset_types', 'product_views', 'file_types'] as const

export function queryValueToArray(query: LocationQueryValue | LocationQueryValue[] | undefined): string[] {
  if (!query) {
    return []
  } else if (!Array.isArray(query)) {
    return [query]
  }
  return query.filter((value): value is string => typeof value === 'string')
}

// Splits pasted or typed references on any whitespace or comma.
export function parseQueryParts(query: string | null | undefined): string[] {
  return (query ?? '')
    .replace(/[\s,]+/g, ' ')
    .trim()
    .split(' ')
    .filter((part) => part)
}

export function parseSearchQuery(query: LocationQuery, defaultSearchScope: string) {
  const attributes = Object.fromEntries(
    Object.entries(query)
      .map(([key, value]) => {
        const match = attributeKey.exec(key)
        return match ? [match[1], queryValueToArray(value)] : null
      })
      .filter((value): value is [string, string[]] => value !== null)
  )
  const sort = SEARCH_SORTS.find((value) => value === query.sort)

  return {
    query: query.q as string,
    page: query.page ? parseInt(query.page as string, 10) : undefined,
    collectionId: query.from_collection as string,
    assetTypes: queryValueToArray(query.asset_types),
    productViews: queryValueToArray(query.product_views),
    fileTypes: queryValueToArray(query.file_types),
    searchScope: (query.search_scope as string) ?? defaultSearchScope,
    exactMatch: query.exact_match === "true",
    attributes,
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
    if ((FILTER_KEYS as readonly string[]).includes(key) || attributeKey.test(key)) {
      patch[key] = undefined
    }
  }
  return patchSearchQuery(query, patch)
}

export type ActiveFilter = { key: string, value: string, group: 'asset_types' | 'product_views' | 'file_types' | 'attribute', attributeId?: string }

export function activeFilters(form: SearchForm): ActiveFilter[] {
  return [
    ...form.assetTypes.map((value) => ({ key: 'asset_types', value, group: 'asset_types' as const })),
    ...form.productViews.map((value) => ({ key: 'product_views', value, group: 'product_views' as const })),
    ...form.fileTypes.map((value) => ({ key: 'file_types', value, group: 'file_types' as const })),
    ...Object.entries(form.attributes).flatMap(([attributeId, values]) =>
      values.map((value) => ({ key: `attributes[${attributeId}]`, value, group: 'attribute' as const, attributeId }))
    ),
  ]
}
