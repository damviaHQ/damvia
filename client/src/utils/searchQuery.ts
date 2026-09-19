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

export function queryValueToArray(query: LocationQueryValue | LocationQueryValue[] | undefined): string[] {
  if (!query) {
    return []
  } else if (!Array.isArray(query)) {
    return [query]
  }
  return query.filter((value): value is string => typeof value === 'string')
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
  }
}
