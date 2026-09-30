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
import { apiURL } from "../env"
import { ALLOWED_TAGS } from "../page-blocks/sanitize"

export const NEWSLETTER_IMAGE_PATH = '/v1/newsletter-images/'
// The email content column is 480px wide.
export const NEWSLETTER_IMAGE_WIDTH = 480

export function newsletterImageUrl(id: string, extension: string): string {
	return `${apiURL()}${NEWSLETTER_IMAGE_PATH}${id}.${extension}`
}

// Any host: an image saved before API_URL changed is served from the new one.
const NEWSLETTER_IMAGE = new RegExp(`^https?://[^/?#]+${NEWSLETTER_IMAGE_PATH}([0-9a-f-]{36})\\.(png|jpg)$`, 'i')

// What the page editor keeps, plus images uploaded for newsletters and
// buttons. An image from anywhere else is dropped: it could track who opens
// the email, and it may be gone by the time the email is read.
export function sanitizeNewsletterHtml(html: string): string {
	return sanitizeHtml(html ?? '', {
		allowedTags: [...ALLOWED_TAGS, 'img'],
		allowedAttributes: { a: ['href', 'target', 'rel', 'data-button'], img: ['src', 'alt', 'width'] },
		allowedSchemes: ['http', 'https', 'mailto'],
		allowedSchemesByTag: { img: ['http', 'https'] },
		allowedSchemesAppliedToAttributes: ['href', 'src'],
		allowProtocolRelative: false,
		allowedClasses: {},
		allowedStyles: {},
		exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
		transformTags: {
			a: (tagName, attribs) => ({
				tagName,
				attribs: {
					...attribs,
					...(attribs['data-button'] !== undefined ? { 'data-button': '' } : {}),
					...(attribs.target === '_blank' ? { target: '_blank' } : {}),
					rel: 'noopener noreferrer',
				},
			}),
			img: (tagName, attribs) => {
				const [, id, extension] = NEWSLETTER_IMAGE.exec(attribs.src ?? '') ?? []
				const width = Math.min(Math.max(parseInt(attribs.width ?? '', 10) || NEWSLETTER_IMAGE_WIDTH, 1), NEWSLETTER_IMAGE_WIDTH)
				return { tagName, attribs: { src: id ? newsletterImageUrl(id.toLowerCase(), extension.toLowerCase()) : '', alt: attribs.alt ?? '', width: String(width) } }
			},
		},
	})
}
