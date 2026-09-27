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
import { activeFilters, applyFilterDraft, bytesToMegabytes, clearFilterQuery, filterDraft, formatDateRange, formatSizeRange, megabytesToBytes, parseQueryParts, parseSearchQuery, patchSearchQuery, queryValueToArray, queryValueToString, toSearchScope, toggleQueryValue } from '@/utils/searchQuery'

describe('search query parsing', () => {
  test('query values become string arrays', () => {
    expect(queryValueToArray(undefined)).toEqual([])
    expect(queryValueToArray(null)).toEqual([])
    expect(queryValueToArray('a')).toEqual(['a'])
    expect(queryValueToArray(['a', null, 'b'])).toEqual(['a', 'b'])
  })

  test('route query maps onto the search input with defaults', () => {
    expect(parseSearchQuery({}, 'all')).toEqual({
      query: undefined, page: undefined, collectionId: undefined, assetTypes: [], recordViews: [], fileTypes: [], extensions: [], minSize: undefined, maxSize: undefined, searchScope: 'all', exactMatch: false, attributes: {}, metadata: {}, variantAxes: {}, sort: undefined,
    })
    expect(parseSearchQuery({
      q: 'red hat', page: '2', from_collection: 'c1', asset_types: 't1', record_views: ['front', 'back'], file_types: 'image', search_scope: 'current', exact_match: 'true', sort: 'newest', extensions: 'jpg', size_min: '2', size_max: '50',
    }, 'all')).toEqual({
      query: 'red hat', page: 2, collectionId: 'c1', assetTypes: ['t1'], recordViews: ['front', 'back'], fileTypes: ['image'], extensions: ['jpg'], minSize: 2097152, maxSize: 52428800, searchScope: 'current', exactMatch: true, attributes: {}, metadata: {}, variantAxes: {}, sort: 'newest',
    })
    expect(parseSearchQuery({ sort: 'random' }, 'all').sort).toBeUndefined()
    expect(parseSearchQuery({ size_min: 'abc', size_max: '-3' }, 'all')).toMatchObject({ minSize: undefined, maxSize: undefined })
    expect(parseSearchQuery({ size_max: '0.5' }, 'all').maxSize).toBe(524288)
    expect(parseSearchQuery({ exact_match: 'yes', page: 'x' }, 'all')).toMatchObject({ exactMatch: false, page: undefined })
  })

  test('metadata filters come from the URL: values for text fields, a day range for dates, bad days ignored', () => {
    const form = parseSearchQuery({ 'metadata[f1]': ['Barros', 'Salazar'], 'metadata_from[f2]': '2026-05-01', 'metadata_to[f2]': '2026-05-21', 'metadata_to[f3]': 'yesterday' }, 'all')
    expect(form.metadata).toEqual({ f1: ['Barros', 'Salazar'], f2: { from: '2026-05-01', to: '2026-05-21' } })
    expect(activeFilters(form).filter((filter) => filter.group.startsWith('metadata'))).toEqual([
      { key: 'metadata[f1]', value: 'Barros', group: 'metadata', attributeId: 'f1' },
      { key: 'metadata[f1]', value: 'Salazar', group: 'metadata', attributeId: 'f1' },
      { key: 'metadata_range[f2]', value: '2026-05-01 to 2026-05-21', group: 'metadata_range', attributeId: 'f2' },
    ])
    expect(clearFilterQuery({ q: 'a', 'metadata[f1]': 'x', 'metadata_from[f2]': '2026-01-01' })).toEqual({ q: 'a' })
    const axes = parseSearchQuery({ 'axes[a1]': ['en', 'fr'] }, 'all')
    expect(axes.variantAxes).toEqual({ a1: ['en', 'fr'] })
    expect(activeFilters(axes)).toEqual([{ key: 'axes[a1]', value: 'en', group: 'axis', attributeId: 'a1' }, { key: 'axes[a1]', value: 'fr', group: 'axis', attributeId: 'a1' }])
    expect(clearFilterQuery({ q: 'a', 'axes[a1]': 'en' })).toEqual({ q: 'a' })
  })

  test('repeated scalar params keep their first value and the page is a positive integer', () => {
    expect(parseSearchQuery({ q: ['a', 'b'], page: ['3', '4'], from_collection: ['c1', 'c2'], search_scope: ['current', 'all'] }, 'all'))
      .toMatchObject({ query: 'a', page: 3, collectionId: 'c1', searchScope: 'current' })
    expect(parseSearchQuery({ q: [null], search_scope: [null] }, 'all')).toMatchObject({ query: undefined, searchScope: 'all' })
    expect(parseSearchQuery({ page: '0' }, 'all').page).toBeUndefined()
    expect(parseSearchQuery({ page: '-2' }, 'all').page).toBeUndefined()
    expect(parseSearchQuery({ page: '2.5' }, 'all').page).toBe(2)
  })

  test('attribute filters are read from bracketed keys and malformed keys are ignored', () => {
    expect(parseSearchQuery({ 'attributes[color]': 'red', 'attributes[size]': ['s', 'm'], 'attributes[': 'x', 'attributes[]': 'y' }, 'all').attributes)
      .toEqual({ color: ['red'], size: ['s', 'm'] })
    expect(parseSearchQuery({ 'attributes[color]': 'red' }, 'all').attributes).toEqual({ color: ['red'] })
  })

  test('typed or pasted references split on whitespace and commas', () => {
    expect(parseQueryParts(' a,b  c\n d ')).toEqual(['a', 'b', 'c', 'd'])
    expect(parseQueryParts(undefined)).toEqual([])
  })

  test('patching the query drops empty values and resets the page', () => {
    expect(patchSearchQuery({ q: 'a', page: '3', file_types: 'image' }, { file_types: [], sort: 'name' })).toEqual({ q: 'a', sort: 'name' })
    expect(toggleQueryValue({ asset_types: ['t1'] }, 'asset_types', 't2')).toEqual({ asset_types: ['t1', 't2'] })
    expect(toggleQueryValue({ asset_types: ['t1', 't2'], page: '2' }, 'asset_types', 't1')).toEqual({ asset_types: ['t2'] })
    expect(toggleQueryValue({ asset_types: 't1' }, 'asset_types', 't1')).toEqual({})
  })

  test('clearing filters keeps the terms, scope and mode', () => {
    expect(clearFilterQuery({ q: 'a', exact_match: 'true', search_scope: 'current', from_collection: 'c', asset_types: 't', record_views: 'v', file_types: 'image', extensions: 'jpg', size_min: '2', size_max: '50', 'attributes[color]': 'red', sort: 'name' }))
      .toEqual({ q: 'a', exact_match: 'true', search_scope: 'current', from_collection: 'c', sort: 'name' })
  })

  test('a size range reads as plain words', () => {
    expect(formatSizeRange(undefined, undefined)).toBe('Any size')
    expect(formatSizeRange(2097152, undefined)).toBe('Over 2 MB')
    expect(formatSizeRange(undefined, 52428800)).toBe('Under 50 MB')
    expect(formatSizeRange(2097152, 52428800)).toBe('2 to 50 MB')
  })

  test('active filters list every selected value with its group', () => {
    const form = parseSearchQuery({ asset_types: 't1', file_types: ['image', 'video'], extensions: 'jpg', size_min: '2', size_max: '50', 'attributes[color]': 'red' }, 'all')
    expect(activeFilters(form)).toEqual([
      { key: 'asset_types', value: 't1', group: 'asset_types' },
      { key: 'file_types', value: 'image', group: 'file_types' },
      { key: 'file_types', value: 'video', group: 'file_types' },
      { key: 'extensions', value: 'jpg', group: 'extensions' },
      { key: 'size', value: '2 to 50 MB', group: 'size' },
      { key: 'attributes[color]', value: 'red', group: 'attribute', attributeId: 'color' },
    ])
  })
})

describe('filter drafts', () => {
  const desktopUrl = {
    q: 'AB-12 CD-34', from_collection: 'c1', search_scope: 'current_with_sub', kind: 'files', page: '3',
    asset_types: ['t1', 't2'], extensions: 'pdf', size_min: '2', 'attributes[a1]': ['Red', 'Blue'],
    'metadata[m1]': 'Paris', 'metadata_from[d1]': '2026-01-01', 'axes[x1]': 'L', sort: 'newest', exact_match: 'true',
  }

  test('a complex desktop search keeps every criterion through a draft and back', () => {
    const draft = filterDraft(desktopUrl)
    expect(draft).not.toHaveProperty('q')
    expect(draft).not.toHaveProperty('from_collection')
    const { page: _page, ...withoutPage } = desktopUrl
    expect(applyFilterDraft(desktopUrl, draft)).toEqual(withoutPage)
    expect(parseSearchQuery(applyFilterDraft(desktopUrl, draft), 'all')).toEqual({ ...parseSearchQuery(desktopUrl, 'all'), page: undefined })
  })

  test('applying replaces the filters but keeps terms and scope', () => {
    const next = applyFilterDraft(desktopUrl, { file_types: 'image' })
    expect(next).toEqual({ q: 'AB-12 CD-34', from_collection: 'c1', search_scope: 'current_with_sub', kind: 'files', file_types: 'image' })
  })

  test('only a known scope is accepted', () => {
    expect(toSearchScope('current_with_sub')).toBe('current_with_sub')
    expect(toSearchScope('all')).toBe('all')
    for (const value of ['everywhere', '', null, undefined, 1, ['all']]) expect(toSearchScope(value)).toBeUndefined()
  })

  test('sizes travel in megabytes and come back rounded to two decimals', () => {
    expect(megabytesToBytes('2')).toBe(2 * 1024 * 1024)
    expect(megabytesToBytes(0.5)).toBe(524288)
    expect(megabytesToBytes('1.5 MB')).toBe(1572864)
    expect(megabytesToBytes('0')).toBe(0)
    for (const value of ['-1', 'large', '', null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) expect(megabytesToBytes(value)).toBeUndefined()
    expect(bytesToMegabytes(undefined)).toBe('')
    expect(bytesToMegabytes(0)).toBe('0')
    expect(bytesToMegabytes(2 * 1024 * 1024)).toBe('2')
    expect(bytesToMegabytes(1234567)).toBe('1.18')
    expect(bytesToMegabytes(megabytesToBytes('12.34'))).toBe('12.34')
  })

  test('a repeated scalar param keeps its first value', () => {
    expect(queryValueToString(['first', 'second'])).toBe('first')
    expect(queryValueToString([null, 'second'])).toBe('second')
    expect(queryValueToString('only')).toBe('only')
    expect(queryValueToString(undefined)).toBeUndefined()
    expect(queryValueToString(null)).toBeUndefined()
    expect(queryValueToString([])).toBeUndefined()
  })

  test('a date range reads as a sentence whichever end is open', () => {
    expect(formatDateRange({ from: '2026-01-01', to: '2026-12-31' })).toBe('2026-01-01 to 2026-12-31')
    expect(formatDateRange({ from: '2026-01-01' })).toBe('From 2026-01-01')
    expect(formatDateRange({ to: '2026-12-31' })).toBe('Until 2026-12-31')
  })
})
