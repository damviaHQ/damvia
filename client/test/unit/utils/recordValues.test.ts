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
import { csvSafe, formatRecordValue, joinMulti, normaliseValue, splitMulti, valueError, type ValueField } from '@/utils/recordValues'

const field = (valueType: ValueField['valueType'], options: string[] = []): ValueField => ({ name: 'f', displayName: 'Field', valueType, options })

describe('record values', () => {
  test('each type keeps one canonical form, the same as the server', () => {
    expect(normaliseValue(field('number'), ' 12,5 ')).toEqual({ value: '12.5' })
    expect(normaliseValue(field('date'), '2026-02-28')).toEqual({ value: '2026-02-28' })
    expect(normaliseValue(field('url'), 'https://example.test')).toEqual({ value: 'https://example.test' })
    expect(normaliseValue(field('single_select', ['Red', 'Blue']), 'Blue')).toEqual({ value: 'Blue' })
    expect(normaliseValue(field('multi_select', ['Eco', 'New', 'Sale']), 'Sale|Eco|Eco')).toEqual({ value: 'Eco|Sale' })
    expect(normaliseValue(field('text'), '  kept  ')).toEqual({ value: 'kept' })
    expect(normaliseValue(field('long_text'), '  kept  ')).toEqual({ value: '  kept  ' })
    for (const type of ['number', 'date', 'url', 'single_select', 'multi_select'] as const) expect(normaliseValue(field(type), '  ')).toEqual({ value: '' })
  })

  test('a value the type refuses gets a message naming the field', () => {
    expect(valueError(field('number'), 'abc')).toMatch(/^Field must be a number/)
    expect(valueError(field('date'), '2026-02-30')).toMatch(/YYYY-MM-DD/)
    expect(valueError(field('date'), '28/02/2026')).toMatch(/YYYY-MM-DD/)
    expect(valueError(field('url'), 'ftp://example.test')).toMatch(/https:/)
    expect(valueError(field('single_select', ['Red']), 'Green')).toMatch(/one of Red/)
    expect(valueError(field('multi_select', ['Eco']), 'Eco|Other')).toMatch(/"Other"/)
    expect(valueError(field('number'), undefined)).toBeNull()
  })

  test('display reads multi-select options as a list and web addresses without their scheme', () => {
    expect(formatRecordValue(field('multi_select', ['A', 'B']), 'A|B')).toBe('A, B')
    expect(formatRecordValue(field('url'), 'https://shop.example.test/p/1')).toBe('shop.example.test/p/1')
    expect(formatRecordValue(field('url'), 'not a link')).toBe('not a link')
    expect(formatRecordValue(undefined, 'raw')).toBe('raw')
    expect(splitMulti(' A | |B ')).toEqual(['A', 'B'])
    expect(joinMulti(['A', 'B'])).toBe('A|B')
  })

  test('an exported cell never starts a formula', () => {
    expect(['=SUM(A1)', '+1', '-1', '@x', 'plain'].map(csvSafe)).toEqual(["'=SUM(A1)", "'+1", "'-1", "'@x", 'plain'])
  })
})
