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
import sanitizeHtml from "sanitize-html"

// The editor produces exactly these nodes. Styles and classes are dropped on
// purpose: page authors choose content, the theme chooses how it looks.
export const ALLOWED_TAGS = ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr']

export function sanitizeBlockHtml(html: string): string {
	return sanitizeHtml(html ?? '', {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: { a: ['href', 'target', 'rel'] },
		allowedSchemes: ['http', 'https', 'mailto'],
		allowedSchemesAppliedToAttributes: ['href'],
		allowProtocolRelative: false,
		allowedClasses: {},
		allowedStyles: {},
		transformTags: {
			a: (tagName, attribs) => ({
				tagName,
				attribs: attribs.target === '_blank'
					? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
					: { ...attribs, rel: 'noopener noreferrer' },
			}),
		},
	})
}
