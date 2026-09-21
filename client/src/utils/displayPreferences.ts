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
import type { RouterOutput } from '@/services/server'

export type DisplayFile = RouterOutput['collection']['findById']['files'][number]
// Masonry is a reader's view of files, next to the grid and the list.
export type DisplayView = 'grid' | 'list' | 'masonry'
export const MASONRY_SIZES = [
  { id: 1, label: 'Small', minWidth: 160 },
  { id: 2, label: 'Medium', minWidth: 220 },
  { id: 3, label: 'Large', minWidth: 280 },
  { id: 4, label: 'Extra large', minWidth: 380 },
] as const
export type MasonrySize = typeof MASONRY_SIZES[number]['id']
export const DEFAULT_MASONRY_SIZE: MasonrySize = 3
export type DisplayProperty = { id: string; label: string }
export type DisplayGroup = {
  id: string
  name: string
  defaultDisplay: 'grid' | 'list'
  defaultColumns: string[]
  properties: DisplayProperty[]
}
export type DisplayDetails = { columns?: string[]; masonrySize?: MasonrySize }

export const fileProperties: DisplayProperty[] = [
  { id: 'size', label: 'Size' },
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'updated_at', label: 'Updated at' },
  { id: 'format', label: 'Format' },
  { id: 'license', label: 'License' },
  { id: 'record_view', label: 'Record view' },
]
export type DisplayCollection = { description?: string | null; numberOfFiles?: number }
export function collectionDisplayGroup(collections: DisplayCollection[]): DisplayGroup {
  const properties = [{ id: 'description', label: 'Description' }, { id: 'numberOfFiles', label: 'Files' }] as const
  return {
    id: 'asset_folder', name: 'Collections', defaultDisplay: 'grid',
    defaultColumns: properties.filter(property => collections.some(collection => {
      const value = collection[property.id]
      return value !== undefined && value !== null && value !== ''
    })).map(property => property.id),
    properties: [...properties],
  }
}

// Use only attributes returned by the API, which already enforces attribute visibility.
export function fileDisplayGroup(files: DisplayFile[]): DisplayGroup {
  const firstType = files[0]?.assetType
  const type = firstType && files.every(file => file.assetType?.id === firstType.id) ? firstType : null
  const attributes = new Map<string, DisplayProperty>()
  for (const file of files) {
    for (const attribute of [...(file.assetType?.recordAttributes ?? []), ...(file.record?.attributes ?? [])]) {
      if (attribute) attributes.set(attribute.id, { id: `record_attribute.${attribute.id}`, label: attribute.displayName || attribute.name })
    }
    for (const field of file.metadata ?? []) {
      attributes.set(field.id, { id: `metadata_field.${field.id}`, label: field.displayName || field.name })
    }
  }
  return {
    id: type?.id ?? 'asset_file',
    name: type?.name ?? 'Files',
    defaultDisplay: type?.defaultDisplay ?? 'grid',
    defaultColumns: type?.listDisplayItems ?? ['size', 'dimensions', 'format', 'updated_at'],
    properties: [...fileProperties, ...attributes.values()],
  }
}

export function readDisplayDetails(): Record<string, DisplayDetails> {
  try {
    const stored = JSON.parse(localStorage.getItem('dam_display_details') ?? '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).flatMap(([id, value]) => {
      if (!value || typeof value !== 'object') return []
      const details = value as DisplayDetails
      return [[id, {
        ...(Array.isArray(details.columns) && details.columns.every(item => typeof item === 'string') ? { columns: details.columns } : {}),
        ...(MASONRY_SIZES.some(size => size.id === details.masonrySize) ? { masonrySize: details.masonrySize } : {}),
      }]]
    }))
  } catch { return {} }
}
