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
import { RecordValueType } from "../entity/record-attribute"

// Every record value is stored as text in the hstore. A field's type decides
// the one canonical form it takes; an empty string is valid for every type.
export const MULTI_SELECT_SEPARATOR = '|'
export const MAX_OPTIONS = 200
const NUMBER = /^-?\d+(\.\d+)?$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export type ValueField = { name: string, displayName?: string | null, valueType: RecordValueType, options: string[] }

export class RecordValueError extends Error {}

export function splitMulti(value: string | null | undefined): string[] {
	if (!value) return []
	return value.split(MULTI_SELECT_SEPARATOR).map((part) => part.trim()).filter(Boolean)
}

export function joinMulti(values: string[]): string {
	return values.join(MULTI_SELECT_SEPARATOR)
}

function label(field: ValueField): string {
	return field.displayName || field.name
}

function validDate(value: string): boolean {
	const match = DATE.exec(value)
	if (!match) return false
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
	return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}

// Returns the canonical form of a value, or throws a message an admin can act on.
export function normaliseValue(field: ValueField, raw: string): string {
	if (field.valueType === 'long_text') return raw
	const value = raw.trim()
	if (value === '') return ''
	switch (field.valueType) {
		case 'text':
			return value
		case 'number': {
			const number = value.replace(/\s/g, '').replace(',', '.')
			if (!NUMBER.test(number)) throw new RecordValueError(`${label(field)} must be a number, not "${value}".`)
			return number
		}
		case 'date':
			if (!validDate(value)) throw new RecordValueError(`${label(field)} must be a date written YYYY-MM-DD, not "${value}".`)
			return value
		case 'url': {
			let url: URL
			try {
				url = new URL(value)
			} catch {
				throw new RecordValueError(`${label(field)} must be a web address starting with https://, not "${value}".`)
			}
			if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new RecordValueError(`${label(field)} must be a web address starting with https://, not "${value}".`)
			return value
		}
		case 'single_select':
			if (!field.options.includes(value)) throw new RecordValueError(`${label(field)} must be one of ${field.options.join(', ') || 'its options'}, not "${value}".`)
			return value
		case 'multi_select': {
			const parts = splitMulti(value)
			const unknown = parts.filter((part) => !field.options.includes(part))
			if (unknown.length) throw new RecordValueError(`${label(field)} has no option ${unknown.map((part) => `"${part}"`).join(', ')}.`)
			return joinMulti(field.options.filter((option) => parts.includes(option)))
		}
	}
}

export function validateValue(field: ValueField, raw: string): string | null {
	try {
		normaliseValue(field, raw)
		return null
	} catch (error) {
		if (error instanceof RecordValueError) return error.message
		throw error
	}
}

// The options a select field starts with, taken from the values records hold.
export function optionsFromValues(values: string[], valueType: RecordValueType): string[] {
	const found = new Set<string>()
	for (const value of values) {
		const parts = valueType === 'multi_select' ? splitMulti(value) : [value.trim()]
		for (const part of parts) {
			if (part && !part.includes(MULTI_SELECT_SEPARATOR)) found.add(part)
			if (found.size >= MAX_OPTIONS) return [...found]
		}
	}
	return [...found].sort((a, b) => a.localeCompare(b))
}

// Options a set of raw values would add to a select field.
export function newOptions(field: ValueField, values: string[]): string[] {
	if (field.valueType !== 'single_select' && field.valueType !== 'multi_select') return []
	const known = new Set(field.options)
	const found = new Set<string>()
	for (const value of values) {
		const parts = field.valueType === 'multi_select' ? splitMulti(value) : [value.trim()]
		for (const part of parts) {
			if (part && !known.has(part) && !part.includes(MULTI_SELECT_SEPARATOR)) found.add(part)
		}
	}
	return [...found]
}
