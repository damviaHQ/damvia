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
import { buildRows, cellText, cleanCsv, defaultTargets, mappingErrors, sampleValues, sheetToCsv, uniqueTableName } from '@/utils/recordImport'

describe('record CSV import', () => {
  test('blank lines, padded headers and cells past the last header are not data', () => {
    const csv = cleanCsv('a.csv', [' SKU ', 'Colour', ''], [
      { ' SKU ': 'A1', Colour: 'Red', '': 'x', __parsed_extra: ['y'] },
      { ' SKU ': '', Colour: ' ' },
    ])
    expect(csv).toEqual({ name: 'a.csv', columns: ['SKU', 'Colour'], rows: [{ SKU: 'A1', Colour: 'Red' }] })
  })

  test('each column goes into its field of the same name, and two columns cannot share one', () => {
    const targets = defaultTargets(['SKU', 'Colour', 'Color'])
    expect(targets).toEqual({ SKU: 'SKU', Colour: 'Colour', Color: 'Color' })
    expect(mappingErrors({ ...targets, Color: 'Colour' }, 'SKU', 'SKU')).toEqual({ Color: 'Colour already goes into Colour.' })
    expect(mappingErrors({ Ref: 'SKU', Name: 'Name' }, 'Code', 'SKU')).toEqual({ Ref: 'SKU holds the key; it cannot also be a field.' })
    expect(mappingErrors({ SKU: 'SKU', Colour: '' }, 'SKU', null)).toEqual({})
    const fields = [{ name: 'colour', displayName: 'Colour' }, { name: 'bf_name', displayName: 'Name' }]
    expect(defaultTargets(['SKU', 'COLOUR', 'name', 'Colour'], fields)).toEqual({ SKU: 'SKU', COLOUR: 'colour', name: 'bf_name', Colour: 'Colour' })
  })

  test('rows carry the key and the kept columns under their fields, dropping empty cells when stored values stay', () => {
    const csv = { name: 'a.csv', columns: ['SKU', 'Colour', 'Notes'], rows: [{ SKU: 'A1', Colour: 'Red', Notes: '' }, { SKU: 'A2', Colour: '', Notes: 'n' }] }
    const targets = { SKU: 'SKU', Colour: 'colour', Notes: '' }
    expect(buildRows(csv, 'SKU', targets, true)).toEqual([{ SKU: 'A1', colour: 'Red' }, { SKU: 'A2' }])
    expect(buildRows(csv, 'SKU', targets, false)).toEqual([{ SKU: 'A1', colour: 'Red' }, { SKU: 'A2', colour: '' }])
  })

  test('samples are the first distinct values present', () => {
    expect(sampleValues([{ c: '' }, { c: 'a' }, { c: 'a' }, { c: 'b' }, { c: 'c' }, { c: 'd' }], 'c')).toEqual(['a', 'b', 'c'])
  })

  test('a sheet reads like a CSV from its first row with a value; dates become days and empty sheets say why', () => {
    const sheet = sheetToCsv('Shoes', [
      [null, null],
      ['SKU', 'Launch', 'Price', 'Eco'],
      ['S-1', new Date(Date.UTC(2026, 1, 28)), 12.5, true],
      [null, null, null, null],
    ])
    expect(sheet).toEqual({ name: 'Shoes', error: null, csv: { name: 'Shoes', columns: ['SKU', 'Launch', 'Price', 'Eco'], rows: [{ SKU: 'S-1', Launch: '2026-02-28', Price: '12.5', Eco: 'true' }] } })
    expect(cellText(new Date(Date.UTC(2026, 1, 28, 9, 30)))).toBe('2026-02-28 09:30:00')
    expect(sheetToCsv('Empty', [[null], ['']])).toEqual({ name: 'Empty', csv: null, error: 'The sheet is empty.' })
    expect(sheetToCsv('Head', [['SKU']]).error).toBe('The sheet has a header row but no data under it.')
  })

  test('a new table takes the name of its sheet, numbered when the name is taken', () => {
    expect(uniqueTableName('Shoes', ['Apparel'])).toBe('Shoes')
    expect(uniqueTableName('Shoes', ['shoes', 'Shoes (1)'])).toBe('Shoes (2)')
    expect(uniqueTableName('  ', [])).toBe('Table')
  })
})
