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
import { beforeEach, describe, expect, test } from 'vitest'
import { collectionDisplayGroup, fileDisplayGroup, fileProperties, productDisplayGroup, readDisplayDetails, type DisplayFile, type DisplayProduct } from '@/utils/displayPreferences'

const photo = { id: 'photo', name: 'Photography', defaultDisplay: 'list', listDisplayItems: ['size', 'format'], recordAttributes: [{ id: 'colour', name: 'colour', displayName: 'Colour' }] }
const file = (value: object) => ({ name: 'a.jpg', assetType: photo, record: null, metadata: [], ...value }) as unknown as DisplayFile

describe('display preferences', () => {
  beforeEach(() => localStorage.clear())

  test('collections offer their description and file count, shown when any collection has one', () => {
    expect(collectionDisplayGroup([])).toMatchObject({ id: 'asset_folder', name: 'Collections', defaultDisplay: 'grid', defaultColumns: [] })
    expect(collectionDisplayGroup([]).properties.map(property => property.id)).toEqual(['description', 'numberOfFiles'])
    expect(collectionDisplayGroup([{ description: '', numberOfFiles: 3 }]).defaultColumns).toEqual(['numberOfFiles'])
    expect(collectionDisplayGroup([{ description: null }, { description: 'Spring', numberOfFiles: 0 }]).defaultColumns).toEqual(['description', 'numberOfFiles'])
  })

  test('files of one type follow that type, with its record fields and metadata as columns', () => {
    const group = fileDisplayGroup([
      file({ record: { attributes: [{ id: 'season', name: 'season', displayName: null }] } }),
      file({ metadata: [{ id: 'credit', name: 'credit', displayName: 'Credit' }] }),
    ])
    expect(group).toMatchObject({ id: 'photo', name: 'Photography', defaultDisplay: 'list', defaultColumns: ['size', 'format'] })
    expect(group.properties.slice(0, fileProperties.length)).toEqual(fileProperties)
    expect(group.properties.slice(fileProperties.length)).toEqual([
      { id: 'record_attribute.colour', label: 'Colour' },
      { id: 'record_attribute.season', label: 'season' },
      { id: 'metadata_field.credit', label: 'Credit' },
    ])
  })

  test('files of mixed types share the generic file preferences', () => {
    const group = fileDisplayGroup([file({}), file({ assetType: { ...photo, id: 'video', name: 'Motion' } })])
    expect(group).toMatchObject({ id: 'asset_file', name: 'Files', defaultDisplay: 'grid', defaultColumns: ['size', 'dimensions', 'format', 'updated_at'] })
    expect(fileDisplayGroup([])).toMatchObject({ id: 'asset_file', name: 'Files' })
  })

  test('products offer their fields except the one already used as the card title', () => {
    const product = (attributes: (object | null)[], titleField: string | null = null) => ({ id: 'p', name: 'P', titleField, record: { attributes } }) as unknown as DisplayProduct
    const group = productDisplayGroup([
      product([{ id: '1', name: 'name', displayName: 'Name' }, { id: '2', name: 'season', displayName: 'Season' }], 'name'),
      product([{ id: '2', name: 'season', displayName: 'Season' }, { id: '3', name: 'format', displayName: '' }, null]),
    ], 'Products')
    expect(group).toMatchObject({ id: 'record', name: 'Products', defaultDisplay: 'grid', defaultColumns: [] })
    expect(group.properties).toEqual([{ id: 'season', label: 'Season' }, { id: 'format', label: 'format' }])
  })

  test('saved details are read back only when well formed', () => {
    expect(readDisplayDetails()).toEqual({})
    localStorage.setItem('dam_display_details', JSON.stringify({
      photo: { columns: ['size', 'record_attribute.colour'], masonrySize: 2 },
      video: { columns: ['size', 3], masonrySize: 7 },
      broken: 'list',
      empty: null,
    }))
    expect(readDisplayDetails()).toEqual({ photo: { columns: ['size', 'record_attribute.colour'], masonrySize: 2 }, video: {} })
    for (const stored of ['{broken', '[]', '"list"', 'null']) {
      localStorage.setItem('dam_display_details', stored)
      expect(readDisplayDetails()).toEqual({})
    }
  })
})
