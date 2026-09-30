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
import { FILTER_OPERATORS, filterIsComplete, operatorLabel, operatorsFor, type FilterOp } from '@/utils/recordFilters'

describe('record filters', () => {
  test('each column type offers its own conditions, the default first', () => {
    expect(operatorsFor('key')).toEqual(['contains', 'is'])
    expect(operatorsFor('text')).toEqual(['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'])
    expect(operatorsFor('long_text')).toEqual(operatorsFor('text'))
    expect(operatorsFor('url')).toEqual(operatorsFor('text'))
    expect(operatorsFor('number')).toEqual(['is', 'is_not', 'is_empty', 'is_not_empty'])
    expect(operatorsFor('date')).toEqual(operatorsFor('number'))
    expect(operatorsFor('single_select')).toEqual(['has_any', 'is_empty', 'is_not_empty'])
    expect(operatorsFor('multi_select')).toEqual(operatorsFor('single_select'))
  })

  test('every condition offered has a label', () => {
    const offered = new Set((['key', 'text', 'number', 'single_select'] as const).flatMap(operatorsFor))
    for (const op of offered) expect(FILTER_OPERATORS[op]).toBeTruthy()
    expect(FILTER_OPERATORS.has_any).toBe('is any of')
  })

  test('the picture filter asks whether a record has a picture, having one by default', () => {
    expect(operatorsFor('picture')).toEqual(['is_not_empty', 'is_empty'])
    expect(operatorsFor('picture').map((op) => operatorLabel('picture', op))).toEqual(['has a picture', 'has no picture'])
    expect(operatorLabel('text', 'is_empty')).toBe('is empty')
  })

  test('a filter narrows the list only once it is complete', () => {
    const filter = (op: FilterOp, rest: { value?: string, values?: string[] } = {}) => ({ column: 'colour', op, ...rest })
    expect(filterIsComplete(filter('is_empty'))).toBe(true)
    expect(filterIsComplete(filter('is_not_empty', { value: '' }))).toBe(true)
    expect(filterIsComplete(filter('has_any'))).toBe(false)
    expect(filterIsComplete(filter('has_any', { values: [] }))).toBe(false)
    expect(filterIsComplete(filter('has_any', { values: ['Sand'] }))).toBe(true)
    expect(filterIsComplete(filter('contains'))).toBe(false)
    expect(filterIsComplete(filter('contains', { value: '   ' }))).toBe(false)
    expect(filterIsComplete(filter('is', { value: ' Sand ' }))).toBe(true)
    // A value typed for another condition does not count.
    expect(filterIsComplete(filter('is_not', { values: ['Sand'] }))).toBe(false)
  })
})
