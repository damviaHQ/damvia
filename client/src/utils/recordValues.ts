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
// Client twin of server/src/services/record-values.ts: the server stays the
// authority, this gives the grid its display and its instant feedback.
export const RECORD_VALUE_TYPES = ['text', 'long_text', 'number', 'date', 'single_select', 'multi_select', 'url'] as const
export type RecordValueType = typeof RECORD_VALUE_TYPES[number]
export type ValueField = { name: string, displayName?: string | null, valueType: RecordValueType, options: string[] }

export const MULTI_SELECT_SEPARATOR = '|'
export const VALUE_TYPE_LABELS: Record<RecordValueType, string> = {
  text: 'Text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  single_select: 'Single select',
  multi_select: 'Multiple select',
  url: 'Link',
}
const NUMBER = /^-?\d+(\.\d+)?$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isSelect(type: RecordValueType): boolean {
  return type === 'single_select' || type === 'multi_select'
}

export function fieldLabel(field: { name: string, displayName?: string | null }): string {
  return field.displayName || field.name
}

export function splitMulti(value: string | null | undefined): string[] {
  if (!value) return []
  return value.split(MULTI_SELECT_SEPARATOR).map((part) => part.trim()).filter(Boolean)
}

export function joinMulti(values: string[]): string {
  return values.join(MULTI_SELECT_SEPARATOR)
}

function validDate(value: string): boolean {
  const match = DATE.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// The canonical form of a value, or an error message an admin can act on.
export function normaliseValue(field: ValueField, raw: string): { value: string } | { error: string } {
  if (field.valueType === 'long_text') return { value: raw }
  const value = raw.trim()
  if (value === '') return { value: '' }
  const label = fieldLabel(field)
  switch (field.valueType) {
    case 'text':
      return { value }
    case 'number': {
      const number = value.replace(/\s/g, '').replace(',', '.')
      return NUMBER.test(number) ? { value: number } : { error: `${label} must be a number, not "${value}".` }
    }
    case 'date':
      return validDate(value) ? { value } : { error: `${label} must be a date written YYYY-MM-DD, not "${value}".` }
    case 'url':
      return validUrl(value) ? { value } : { error: `${label} must be a web address starting with https://, not "${value}".` }
    case 'single_select':
      return field.options.includes(value) ? { value } : { error: `${label} must be one of ${field.options.join(', ') || 'its options'}, not "${value}".` }
    case 'multi_select': {
      const parts = splitMulti(value)
      const unknown = parts.filter((part) => !field.options.includes(part))
      if (unknown.length) return { error: `${label} has no option ${unknown.map((part) => `"${part}"`).join(', ')}.` }
      return { value: joinMulti(field.options.filter((option) => parts.includes(option))) }
    }
  }
}

export function valueError(field: ValueField, raw: string | null | undefined): string | null {
  const result = normaliseValue(field, raw ?? '')
  return 'error' in result ? result.error : null
}

// How a stored value reads in a cell or on a file.
export function formatRecordValue(field: ValueField | undefined, raw: string | null | undefined): string {
  const value = raw ?? ''
  if (!value || !field) return value
  if (field.valueType === 'multi_select') return splitMulti(value).join(', ')
  if (field.valueType === 'date' && validDate(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (field.valueType === 'url' && validUrl(value)) {
    const url = new URL(value)
    return url.host + (url.pathname === '/' ? '' : url.pathname)
  }
  return value
}

// A spreadsheet opening the export must never run a cell as a formula.
export function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}
