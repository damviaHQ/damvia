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
import { AxisRecognizer } from "../entity/variant-axis"

// ISO 639-1 codes; a column is a language only when every value is one.
const LANGUAGES = new Set(['aa', 'ab', 'af', 'am', 'ar', 'as', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'eo', 'es', 'et', 'eu', 'fa', 'fi', 'fr', 'ga', 'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kk', 'km', 'kn', 'ko', 'lb', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'nb', 'ne', 'nl', 'nn', 'no', 'pa', 'pl', 'pt', 'ro', 'ru', 'si', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'uz', 'vi', 'zh', 'zu'])

export const RECOGNIZER_NAMES: Record<AxisRecognizer, string> = {
	dimension: 'Dimensions',
	ratio: 'Ratio',
	duration: 'Duration',
	language: 'Language',
}

// A recognizer names a column only when it matches every value of it: a
// column mixing 1080x1080 and en stays "Variant n", fully usable as a filter.
export function recognizeAxis(values: string[]): AxisRecognizer | null {
	const present = values.filter((value) => value !== '')
	if (!present.length) return null
	if (present.every((value) => /^\d+x\d+$/.test(value))) {
		return present.some((value) => value.split('x').some((side) => parseInt(side, 10) >= 100)) ? 'dimension' : 'ratio'
	}
	if (present.every((value) => /^\d+s$/.test(value))) return 'duration'
	if (present.every((value) => LANGUAGES.has(value))) return 'language'
	return null
}

export type AxisCandidate = { id: string, values: string[], createdAt: Date }

// A column reuses an axis only when that axis already holds all its values;
// among several, the smallest, then the oldest. Values never grow on their
// own: the admin merges axes by hand.
export function attachToExistingAxis(values: string[], axes: AxisCandidate[]): AxisCandidate | null {
	const wanted = values.filter((value) => value !== '')
	return axes
		.filter((axis) => wanted.every((value) => axis.values.includes(value)))
		.sort((a, b) => a.values.length - b.values.length || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0] ?? null
}
