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
import type { FacetOption } from '@/components/search/SearchFacetGroup.vue'
import { getFileExtension } from '@/utils/fileExtention'
import { fileTypeOf } from '@/utils/fileType'
import { FILE_TYPE_OPTIONS } from '@/utils/searchQuery'

// Shared with the search toolbar, so a filter reads the same wherever it is shown.
export type FilterChip = { key: string, value: string, label: string, category?: string, displayValue?: string }

// Narrowing a page is done over what is already loaded, so the filter only ever
// needs what a file and a collection already carry.
export type FilterableFile = {
  name: string
  recordKey?: string
  mimeType?: string | null
  assetType?: { id: string, name: string } | null
  dimensions?: { width?: number | null, height?: number | null } | null
  record?: { attributes?: ({ id: string, name: string, displayName?: string | null, value?: string | null, facetable?: boolean } | null)[] | null } | null
}
export type FilterableCollection = { name: string }

export type PageFilterDimension = 'assetTypes' | 'fileTypes' | 'extensions' | 'orientations'

export type PageFilterState = {
  name: string
  assetTypes: string[]
  fileTypes: string[]
  extensions: string[]
  orientations: string[]
  attributes: Record<string, string[]>
}

export function emptyPageFilter(): PageFilterState {
  return { name: '', assetTypes: [], fileTypes: [], extensions: [], orientations: [], attributes: {} }
}

export function isPageFilterActive(state: PageFilterState): boolean {
  return !!state.name.trim() ||
    !!state.assetTypes.length ||
    !!state.fileTypes.length ||
    !!state.extensions.length ||
    !!state.orientations.length ||
    Object.values(state.attributes).some(values => values.length > 0)
}

// How many values are set, for the badge on the toggle. The name counts as one.
export function pageFilterCount(state: PageFilterState): number {
  return (state.name.trim() ? 1 : 0) +
    state.assetTypes.length +
    state.fileTypes.length +
    state.extensions.length +
    state.orientations.length +
    Object.values(state.attributes).reduce((total, values) => total + values.length, 0)
}

function matchesName(name: string, term: string): boolean {
  const needle = term.trim().toLowerCase()
  return !needle || name.toLowerCase().includes(needle)
}

// A name with no dot has no extension. Without this a file called README, or
// a product reference, becomes a format of its own on the filter bar.
export function fileExtensionOf(file: FilterableFile): string {
  return !file.recordKey && file.name.includes('.') ? getFileExtension(file.name) : ''
}

export function orientationOf(file: FilterableFile): 'portrait' | 'landscape' | 'square' | null {
  const { width, height } = file.dimensions ?? {}
  if (!width || !height || width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return null
  return width < height ? 'portrait' : width > height ? 'landscape' : 'square'
}

function attributeValues(file: FilterableFile, attributeId: string): string[] {
  return (file.record?.attributes ?? [])
    .filter(attribute => attribute?.id === attributeId && !!attribute.value)
    .map(attribute => attribute!.value as string)
}

// Values inside one dimension are an OR, dimensions are an AND: picking two
// asset types widens, picking an asset type and a format narrows.
function matchesDimensions(file: FilterableFile, state: PageFilterState, except?: PageFilterDimension | string): boolean {
  if (except !== 'assetTypes' && state.assetTypes.length && !state.assetTypes.includes(file.assetType?.id ?? '')) {
    return false
  }
  if (except !== 'fileTypes' && state.fileTypes.length && !state.fileTypes.includes(fileTypeOf(file))) {
    return false
  }
  if (except !== 'extensions' && state.extensions.length && !state.extensions.includes(fileExtensionOf(file))) {
    return false
  }
  if (except !== 'orientations' && state.orientations.length && !state.orientations.includes(orientationOf(file) ?? '')) {
    return false
  }
  for (const [attributeId, values] of Object.entries(state.attributes)) {
    if (!values.length || except === attributeId) continue
    if (!attributeValues(file, attributeId).some(value => values.includes(value))) {
      return false
    }
  }
  return true
}

export function matchesFile(file: FilterableFile, state: PageFilterState): boolean {
  return matchesName(file.name, state.name) && matchesDimensions(file, state)
}

// A collection carries none of the facets, so only the name narrows it. Its
// chips still apply to the files beside it, which is what the reader expects.
export function matchesCollection(collection: FilterableCollection, state: PageFilterState): boolean {
  return matchesName(collection.name, state.name)
}

function countBy(files: FilterableFile[], value: (file: FilterableFile) => string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of files) {
    for (const id of new Set(value(file))) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return counts
}

export type PageFacets = {
  assetTypes: FacetOption[]
  fileTypes: FacetOption[]
  extensions: FacetOption[]
  orientations?: FacetOption[]
  attributes: { id: string, label: string, options: FacetOption[] }[]
}

// Every dimension is counted with its own values ignored, so a count says what
// picking that value would show rather than what is already on screen. Same rule
// searchFacets() follows on the server.
export function fileFacets(files: FilterableFile[], state: PageFilterState): PageFacets {
  const within = (except: PageFilterDimension | string) =>
    files.filter(file => matchesName(file.name, state.name) && matchesDimensions(file, state, except))

  const assetTypeNames = new Map<string, string>()
  const attributeLabels = new Map<string, string>()
  for (const file of files) {
    if (file.assetType) assetTypeNames.set(file.assetType.id, file.assetType.name)
    for (const attribute of file.record?.attributes ?? []) {
      if (attribute?.value && attribute.facetable !== false) attributeLabels.set(attribute.id, attribute.displayName || attribute.name)
    }
  }

  const assetTypeCounts = countBy(within('assetTypes'), file => file.assetType ? [file.assetType.id] : [])
  const fileTypeCounts = countBy(within('fileTypes'), file => file.recordKey ? [] : [fileTypeOf(file)])
  const extensionCounts = countBy(within('extensions'), file => {
    const extension = fileExtensionOf(file)
    return extension ? [extension] : []
  })
  const orientationCounts = countBy(within('orientations'), file => {
    const orientation = orientationOf(file)
    return orientation ? [orientation] : []
  })

  const byLabel = (a: FacetOption, b: FacetOption) => a.label.localeCompare(b.label)

  return {
    assetTypes: Array.from(assetTypeNames, ([id, name]) => ({ id, label: name, count: assetTypeCounts.get(id) ?? 0 })).sort(byLabel),
    fileTypes: [...FILE_TYPE_OPTIONS, { id: 'other', label: 'Other files' }]
      .map(option => ({ id: option.id, label: option.label, count: fileTypeCounts.get(option.id) ?? 0 }))
      .filter(option => option.count > 0 || state.fileTypes.includes(option.id)),
    extensions: Array.from(extensionCounts, ([id, count]) => ({ id, label: id, count }))
      .concat(state.extensions.filter(id => !extensionCounts.has(id)).map(id => ({ id, label: id, count: 0 })))
      .sort(byLabel),
    orientations: [
      { id: 'portrait', label: 'Portrait' },
      { id: 'landscape', label: 'Landscape' },
      { id: 'square', label: 'Square' },
    ].map(option => ({ ...option, count: orientationCounts.get(option.id) ?? 0 }))
      .filter(option => option.count > 0 || state.orientations.includes(option.id)),
    attributes: Array.from(attributeLabels, ([id, label]) => {
      const counts = countBy(within(id), file => attributeValues(file, id))
      return {
        id,
        label,
        options: Array.from(counts, ([value, count]) => ({ id: value, label: value, count }))
          .concat((state.attributes[id] ?? []).filter(value => !counts.has(value)).map(value => ({ id: value, label: value, count: 0 })))
          .sort(byLabel),
      }
    }).sort((a, b) => a.label.localeCompare(b.label)),
  }
}

// The chips read from the facets, so a value keeps the label it was picked with
// even once nothing on the page carries it any more.
export function filterChipsOf(state: PageFilterState, facets: PageFacets): FilterChip[] {
  const chips: FilterChip[] = []
  const labelOf = (options: FacetOption[], value: string) => options.find(option => option.id === value)?.label ?? value

  if (state.name.trim()) {
    chips.push({ key: 'name', value: state.name.trim(), label: state.name.trim(), category: 'Name' })
  }
  for (const value of state.assetTypes) {
    chips.push({ key: 'assetTypes', value, label: labelOf(facets.assetTypes, value), category: 'Asset type' })
  }
  for (const value of state.fileTypes) {
    chips.push({ key: 'fileTypes', value, label: labelOf(facets.fileTypes, value), category: 'File type' })
  }
  for (const value of state.extensions) {
    chips.push({ key: 'extensions', value, label: value, category: 'Format' })
  }
  for (const value of state.orientations) {
    chips.push({ key: 'orientations', value, label: labelOf(facets.orientations ?? [], value), category: 'Orientation' })
  }
  // Read from the state, not the facets: a value must stay removable even once
  // nothing left on the page carries its attribute.
  for (const [attributeId, values] of Object.entries(state.attributes)) {
    const category = facets.attributes.find(attribute => attribute.id === attributeId)?.label
    for (const value of values) {
      chips.push({ key: `attribute:${attributeId}`, value, label: value, category })
    }
  }
  return chips
}

// One filter the reader can put on the bar: a dimension that exists on this page
// and the values it offers. The picker and the bar read the same list, so what
// can be switched on is exactly what can then be used.
export type PageFilterGroup = {
  key: string
  title: string
  options: FacetOption[]
  selected: string[]
}

export const NAME_FILTER_KEY = 'name'

// A dimension holding a single value narrows nothing, so it is not offered —
// unless it is already in use, which must stay visible to be taken back.
export function availableGroups(state: PageFilterState, facets: PageFacets, showSingleValues = false): PageFilterGroup[] {
  return [
    { key: 'assetTypes', title: 'Asset type', options: facets.assetTypes, selected: state.assetTypes },
    { key: 'fileTypes', title: 'File type', options: facets.fileTypes, selected: state.fileTypes },
    { key: 'extensions', title: 'Format', options: facets.extensions, selected: state.extensions },
    { key: 'orientations', title: 'Orientation', options: facets.orientations ?? [], selected: state.orientations },
    ...facets.attributes.map(attribute => ({
      key: `attribute:${attribute.id}`,
      title: attribute.label,
      options: attribute.options,
      selected: state.attributes[attribute.id] ?? [],
    })),
  ].filter(group => group.options.length > (showSingleValues ? 0 : 1) || group.selected.length)
}

// How many values a dimension holds in the state, so the picker can say which
// of the filters on the bar are actually doing something.
export function groupValueCount(state: PageFilterState, key: string): number {
  if (key === NAME_FILTER_KEY) return state.name.trim() ? 1 : 0
  if (key.startsWith('attribute:')) return (state.attributes[key.slice('attribute:'.length)] ?? []).length
  if (key === 'assetTypes' || key === 'fileTypes' || key === 'extensions' || key === 'orientations') return state[key].length
  return 0
}
