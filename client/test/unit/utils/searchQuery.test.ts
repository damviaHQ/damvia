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
import { parseSearchQuery, queryValueToArray } from '@/utils/searchQuery.ts'

describe('search query parsing', () => {
  test('query values become string arrays', () => {
    expect(queryValueToArray(undefined)).toEqual([])
    expect(queryValueToArray(null)).toEqual([])
    expect(queryValueToArray('a')).toEqual(['a'])
    expect(queryValueToArray(['a', null, 'b'])).toEqual(['a', 'b'])
  })

  test('route query maps onto the search input with defaults', () => {
    expect(parseSearchQuery({}, 'all')).toEqual({
      query: undefined, page: undefined, collectionId: undefined, assetTypes: [], productViews: [], fileTypes: [], searchScope: 'all', exactMatch: false, attributes: {},
    })
    expect(parseSearchQuery({
      q: 'red hat', page: '2', from_collection: 'c1', asset_types: 't1', product_views: ['front', 'back'], file_types: 'image', search_scope: 'current', exact_match: 'true',
    }, 'all')).toEqual({
      query: 'red hat', page: 2, collectionId: 'c1', assetTypes: ['t1'], productViews: ['front', 'back'], fileTypes: ['image'], searchScope: 'current', exactMatch: true, attributes: {},
    })
    expect(parseSearchQuery({ exact_match: 'yes', page: 'x' }, 'all')).toMatchObject({ exactMatch: false, page: NaN })
  })

  test('attribute filters are read from bracketed keys and malformed keys are ignored', () => {
    expect(parseSearchQuery({ 'attributes[color]': 'red', 'attributes[size]': ['s', 'm'], 'attributes[': 'x', 'attributes[]': 'y' }, 'all').attributes)
      .toEqual({ color: ['red'], size: ['s', 'm'] })
    expect(parseSearchQuery({ 'attributes[color]': 'red' }, 'all').attributes).toEqual({ color: ['red'] })
  })
})
