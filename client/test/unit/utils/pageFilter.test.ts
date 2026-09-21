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
import {
  availableGroups,
  emptyPageFilter,
  fileFacets,
  filterChipsOf,
  isPageFilterActive,
  matchesCollection,
  groupValueCount,
  matchesFile,
  pageFilterCount,
  type FilterableFile,
  type PageFilterState,
} from '@/utils/pageFilter'

const file = (
  name: string,
  mimeType: string,
  assetType?: { id: string, name: string },
  attributes: { id: string, name: string, value: string }[] = []
): FilterableFile => ({
  name,
  mimeType,
  assetType: assetType ?? null,
  record: attributes.length ? { attributes } : null,
})

const packshot = { id: 'type-packshot', name: 'Packshots' }
const lifestyle = { id: 'type-lifestyle', name: 'Lifestyle' }
const colour = { id: 'attr-colour', name: 'colour', value: 'Red' }

const files = [
  file('Chair front.jpg', 'image/jpeg', packshot, [colour]),
  file('Chair side.png', 'image/png', packshot, [{ id: 'attr-colour', name: 'colour', value: 'Blue' }]),
  file('Living room.jpg', 'image/jpeg', lifestyle),
  file('Catalogue.pdf', 'application/pdf', lifestyle),
  file('Advert.mp4', 'video/mp4'),
]

const state = (values: Partial<PageFilterState> = {}): PageFilterState => ({ ...emptyPageFilter(), ...values })
const namesOf = (current: PageFilterState) => files.filter(item => matchesFile(item, current)).map(item => item.name)

describe('page filter', () => {
  test('the empty filter is inactive and matches everything', () => {
    expect(isPageFilterActive(emptyPageFilter())).toBe(false)
    expect(pageFilterCount(emptyPageFilter())).toBe(0)
    expect(namesOf(emptyPageFilter())).toHaveLength(files.length)
  })

  test('the name is a case-insensitive substring, on files and on collections alike', () => {
    expect(namesOf(state({ name: 'chair' }))).toEqual(['Chair front.jpg', 'Chair side.png'])
    expect(namesOf(state({ name: '  ROOM ' }))).toEqual(['Living room.jpg'])
    expect(matchesCollection({ name: 'Summer campaign' }, state({ name: 'summer' }))).toBe(true)
    expect(matchesCollection({ name: 'Summer campaign' }, state({ name: 'winter' }))).toBe(false)
    // A chip on a facet never hides a collection, which carries none of them.
    expect(matchesCollection({ name: 'Summer campaign' }, state({ fileTypes: ['video'] }))).toBe(true)
  })

  test('each dimension narrows on its own', () => {
    expect(namesOf(state({ assetTypes: [lifestyle.id] }))).toEqual(['Living room.jpg', 'Catalogue.pdf'])
    expect(namesOf(state({ fileTypes: ['video'] }))).toEqual(['Advert.mp4'])
    expect(namesOf(state({ fileTypes: ['document'] }))).toEqual(['Catalogue.pdf'])
    expect(namesOf(state({ extensions: ['PNG'] }))).toEqual(['Chair side.png'])
    expect(namesOf(state({ attributes: { 'attr-colour': ['Red'] } }))).toEqual(['Chair front.jpg'])
  })

  test('values inside a dimension widen, dimensions narrow together', () => {
    expect(namesOf(state({ extensions: ['JPG', 'MP4'] }))).toEqual(['Chair front.jpg', 'Living room.jpg', 'Advert.mp4'])
    expect(namesOf(state({ extensions: ['JPG'], assetTypes: [packshot.id] }))).toEqual(['Chair front.jpg'])
    expect(namesOf(state({ extensions: ['PNG'], assetTypes: [lifestyle.id] }))).toEqual([])
    expect(namesOf(state({ name: 'chair', fileTypes: ['image'], attributes: { 'attr-colour': ['Blue'] } }))).toEqual(['Chair side.png'])
  })

  test('a file with no asset type or no attribute is excluded by a filter on it', () => {
    expect(namesOf(state({ assetTypes: [packshot.id, lifestyle.id] }))).not.toContain('Advert.mp4')
    expect(namesOf(state({ attributes: { 'attr-colour': ['Red', 'Blue'] } }))).toEqual(['Chair front.jpg', 'Chair side.png'])
  })

  test('a count says what picking the value would show, so its own dimension is left out', () => {
    const facets = fileFacets(files, state({ assetTypes: [packshot.id] }))
    // Asset type counts ignore the chosen asset type, or the other values would read zero.
    expect(facets.assetTypes).toEqual([
      { id: lifestyle.id, label: 'Lifestyle', count: 2 },
      { id: packshot.id, label: 'Packshots', count: 2 },
    ])
    // Every other dimension is counted within the chosen asset type.
    expect(facets.extensions).toEqual([
      { id: 'JPG', label: 'JPG', count: 1 },
      { id: 'PNG', label: 'PNG', count: 1 },
    ])
    expect(facets.fileTypes).toEqual([{ id: 'image', label: 'Images', count: 2 }])
  })

  test('the name narrows every count, and unused values disappear', () => {
    const facets = fileFacets(files, state({ name: 'chair' }))
    expect(facets.fileTypes).toEqual([{ id: 'image', label: 'Images', count: 2 }])
    expect(facets.attributes).toEqual([{
      id: 'attr-colour',
      label: 'colour',
      options: [
        { id: 'Blue', label: 'Blue', count: 1 },
        { id: 'Red', label: 'Red', count: 1 },
      ],
    }])
  })

  test('a chosen value keeps a zero-count option, so it can still be taken back', () => {
    const facets = fileFacets(files, state({ name: 'advert', extensions: ['PNG'] }))
    // PNG survives at zero although the name leaves only Advert.mp4, and MP4
    // reads one because a dimension never counts against its own values.
    expect(facets.extensions).toEqual([
      { id: 'MP4', label: 'MP4', count: 1 },
      { id: 'PNG', label: 'PNG', count: 0 },
    ])
    // The other dimensions do apply it, so nothing is left to count there.
    expect(facets.fileTypes).toEqual([])
  })

  test('the funnel offers the dimensions this page can narrow by, and no other', () => {
    const current = emptyPageFilter()
    expect(availableGroups(current, fileFacets(files, current)).map(group => group.title))
      .toEqual(['Asset type', 'File type', 'Format', 'colour'])
    // A dimension with a single value narrows nothing, so it is not offered.
    const single = [file('Only one.jpg', 'image/jpeg', packshot, [colour])]
    expect(availableGroups(current, fileFacets(single, current))).toEqual([])
  })

  test('a dimension in use stays offered even once its values collapse to one', () => {
    const current = state({ name: 'chair', fileTypes: ['image'] })
    const groups = availableGroups(current, fileFacets(files, current))
    // Only images are left, yet File type stays because it is holding a value.
    expect(groups.map(group => group.title)).toContain('File type')
    expect(groupValueCount(current, 'fileTypes')).toBe(1)
  })

  test('the value count reads every dimension, so the funnel can mark what is in use', () => {
    const current = state({ name: 'chair', extensions: ['JPG', 'PNG'], attributes: { 'attr-colour': ['Red'] } })
    expect(groupValueCount(current, 'name')).toBe(1)
    expect(groupValueCount(current, 'extensions')).toBe(2)
    expect(groupValueCount(current, 'attribute:attr-colour')).toBe(1)
    expect(groupValueCount(current, 'assetTypes')).toBe(0)
    expect(groupValueCount(current, 'nothing')).toBe(0)
  })

  test('every value becomes a chip carrying its category', () => {
    const current = state({
      name: 'chair',
      assetTypes: [packshot.id],
      fileTypes: ['image'],
      extensions: ['JPG'],
      attributes: { 'attr-colour': ['Red'] },
    })
    expect(pageFilterCount(current)).toBe(5)
    expect(filterChipsOf(current, fileFacets(files, current))).toEqual([
      { key: 'name', value: 'chair', label: 'chair', category: 'Name' },
      { key: 'assetTypes', value: packshot.id, label: 'Packshots', category: 'Asset type' },
      { key: 'fileTypes', value: 'image', label: 'Images', category: 'File type' },
      { key: 'extensions', value: 'JPG', label: 'JPG', category: 'Format' },
      { key: 'attribute:attr-colour', value: 'Red', label: 'Red', category: 'colour' },
    ])
  })

  test('a chip stays removable once nothing on the page carries its attribute', () => {
    const current = state({ attributes: { 'attr-gone': ['Nothing'] } })
    const chips = filterChipsOf(current, fileFacets(files, current))
    expect(chips).toEqual([{ key: 'attribute:attr-gone', value: 'Nothing', label: 'Nothing', category: undefined }])
  })
})
