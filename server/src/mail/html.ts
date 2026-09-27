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

export function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(value: string): string {
	return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
		if (code[0] === '#') {
			const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
			return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity
		}
		return NAMED[code.toLowerCase()] ?? entity
	})
}

// The plain-text part, from the small set of tags the editor produces.
export function htmlToText(html: string): string {
	return decodeEntities(html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => {
			const text = label.replace(/<[^>]+>/g, '').trim()
			const target = decodeEntities(href)
			return !text || decodeEntities(text) === target ? target : `${text} (${target})`
		})
		.replace(/<li[^>]*>/gi, '- ')
		.replace(/<\/li>/gi, '\n')
		.replace(/<\/(p|h[1-6]|blockquote|ul|ol|div|table|tr)>/gi, '\n\n')
		.replace(/<[^>]+>/g, ''))
		.split('\n').map((line) => line.replace(/[ \t ]+/g, ' ').trim()).join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}
